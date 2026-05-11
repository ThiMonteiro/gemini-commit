import { GoogleGenerativeAI } from "@google/generative-ai";
import chalk from "chalk";
import { env } from "process";
import { SYSTEM_INSTRUCTIONS_DETAILED, SYSTEM_INSTRUCTIONS_OVERVIEW } from "../constants/prompt.js";

const DIFF_CHAR_LIMIT = 100_000;
const MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const TITLE_LIMIT = 50;
const GROUP_THRESHOLD = 2;

export type CommitMode = "detailed" | "overview";

export class GeminiServiceError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    readonly cause?: unknown;

    constructor(message: string, options: { code: string; retryable: boolean; cause?: unknown }) {
        super(message);
        this.name = "GeminiServiceError";
        this.code = options.code;
        this.retryable = options.retryable;
        this.cause = options.cause;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

function getErrorStatus(error: unknown): number | undefined {
    if (typeof error === "object" && error !== null && "status" in error) {
        const status = (error as { status?: unknown }).status;
        return typeof status === "number" ? status : undefined;
    }
    return undefined;
}

function isRetryableError(error: unknown): boolean {
    const message = getErrorMessage(error).toLowerCase();
    const status = getErrorStatus(error);
    if (status && RETRYABLE_STATUS_CODES.has(status)) return true;
    return ["fetch failed", "service unavailable", "network", "econnreset", "etimedout", "timeout", "temporar"]
        .some((f) => message.includes(f));
}

function normalizeGeminiError(error: unknown): GeminiServiceError {
    const message = getErrorMessage(error);
    const status = getErrorStatus(error);

    if (message.includes("SAFETY")) {
        return new GeminiServiceError(
            "O Gemini recusou o diff por motivos de seguranca. Revise o conteudo staged e tente novamente.",
            { code: "SAFETY_BLOCK", retryable: false, cause: error }
        );
    }
    if (status === 503) {
        return new GeminiServiceError(
            "O Gemini esta indisponivel no momento (503). Aguarde alguns instantes e tente gerar novamente.",
            { code: "SERVICE_UNAVAILABLE", retryable: true, cause: error }
        );
    }
    if (message.toLowerCase().includes("fetch failed")) {
        return new GeminiServiceError(
            "Falha de rede ao contatar o Gemini. Verifique sua conexao, VPN/proxy ou instabilidade temporaria da API.",
            { code: "NETWORK_FAILURE", retryable: true, cause: error }
        );
    }
    if (status === 401 || status === 403) {
        return new GeminiServiceError(
            "Nao foi possivel autenticar na API do Gemini. Confira a GEMINI_API_KEY e as permissoes da conta.",
            { code: "AUTH_FAILURE", retryable: false, cause: error }
        );
    }
    if (status === 429) {
        return new GeminiServiceError(
            "Limite de requisicoes do Gemini atingido. Aguarde um pouco antes de tentar novamente.",
            { code: "RATE_LIMIT", retryable: true, cause: error }
        );
    }
    return new GeminiServiceError(
        `Erro ao gerar sugestao de commit com o Gemini${status ? ` (HTTP ${status})` : ""}.`,
        { code: "UNKNOWN", retryable: isRetryableError(error), cause: error }
    );
}

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

type ParsedFile = { file: string; status: string };
type FileDiffInsight = { additions: number; deletions: number; content: string };
type FileGroup = { label: string; files: ParsedFile[]; theme: string; description: string };
type CommitKind = { emoji: string; type: string; scope: string; title: string };

// ---------------------------------------------------------------------------
// Utilitários de título
// ---------------------------------------------------------------------------

function truncateTitle(title: string): string {
    if (title.length <= TITLE_LIMIT) return title;
    return `${title.slice(0, TITLE_LIMIT - 3).trimEnd()}...`;
}

function toScope(files: string[]): string {
    const normalized = files.map((f) => f.split("/")[0]).filter((p) => p && !p.includes("."));
    return normalized.length === 0 ? "core" : normalized[0].toLowerCase();
}

function detectCommitKind(files: string[], diff: string): CommitKind {
    const content = `${files.join("\n")}\n${diff}`.toLowerCase();
    if (files.some((f) => /(^|\/)(readme|docs?)|\.md$/i.test(f)))
        return { emoji: "📝", type: "docs", scope: "docs", title: "documenta uso e fluxo do projeto" };
    if (files.some((f) => /(\.|\/)(spec|test)\./i.test(f) || /__tests__/i.test(f)))
        return { emoji: "✅", type: "test", scope: "tests", title: "cobre cenarios com novos testes" };
    if (files.some((f) => /package\.json|tsconfig|vite|webpack|rollup|eslint|prettier|docker|github\/workflows/i.test(f)))
        return { emoji: "🔧", type: "chore", scope: "config", title: "ajusta configuracoes do projeto" };
    if (content.includes("fix") || content.includes("error") || content.includes("bug") || content.includes("catch"))
        return { emoji: "🐛", type: "fix", scope: toScope(files), title: "corrige falhas no fluxo de commit" };
    if (content.includes("refactor") || content.includes("rename") || content.includes("extract") || content.includes("cleanup"))
        return { emoji: "♻️", type: "refactor", scope: toScope(files), title: "reorganiza fluxo interno do commit" };
    return { emoji: "✨", type: "feat", scope: toScope(files), title: "adiciona suporte ao fluxo de commit" };
}

// ---------------------------------------------------------------------------
// Algoritmo de agrupamento (usado no fallback DETAILED)
// ---------------------------------------------------------------------------

function groupKey(file: string): string {
    const parts = file.split("/");
    if (parts.length === 1) {
        const ext = file.includes(".") ? file.split(".").pop()! : "misc";
        return `(raiz)/${ext}`;
    }
    const folder = parts.slice(0, -1).join("/");
    const ext = file.includes(".") ? file.split(".").pop()! : "misc";
    return `${folder}/${ext}`;
}

function themeOf(file: string): string {
    const lower = file.toLowerCase();
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|avif)$/i.test(file)) return "Assets";
    if (/\.(sql|migration)/.test(lower) || lower.includes("migration")) return "Banco de Dados";
    if (/\.(spec|test)\.(ts|tsx|js|jsx)$/.test(lower) || lower.includes("__tests__")) return "Testes";
    if (/\.(md|txt|rst)$/.test(lower) || lower.includes("docs/")) return "Documentação";
    if (/package\.json|tsconfig|eslint|prettier|vite|webpack|docker|\.env/.test(lower)) return "Config";
    if (lower.includes("component") || lower.includes("/ui/") || /\.(tsx|jsx)$/.test(lower)) return "Interface";
    if (lower.includes("service") || lower.includes("api") || lower.includes("hook")) return "Funcionalidade";
    if (lower.includes("util") || lower.includes("helper") || lower.includes("lib/")) return "Utilitários";
    if (lower.includes("db") || lower.includes("schema") || lower.includes("model")) return "Banco de Dados";
    return "Funcionalidade";
}

function pickAction(status: string): string {
    const map: Record<string, string> = {
        adicionado: "adiciona", modificado: "atualiza", removido: "remove",
        renomeado: "renomeia", copiado: "copia", alterado: "ajusta"
    };
    return map[status] || "atualiza";
}

function describeGroup(files: ParsedFile[], diff: string): string {
    const action = pickAction(files[0].status);
    const lowerFiles = files.map((f) => f.file.toLowerCase()).join(" ");
    const lowerDiff = diff.toLowerCase().slice(0, 5000);
    if (/\.(png|jpg|jpeg|gif|webp|avif)/.test(lowerFiles)) {
        const exts = [...new Set(files.map((f) => f.file.split(".").pop()))];
        if (exts.length === 1) return `${action} assets de imagem no formato ${exts[0]!.toUpperCase()}`;
        return `converte formato ${exts.slice(0, -1).join(", ").toUpperCase()} → ${exts.at(-1)!.toUpperCase()}`;
    }
    if (lowerFiles.includes(".svg")) return `${action} ícones SVG`;
    if (lowerFiles.includes("migration") || lowerFiles.includes(".sql")) return `${action} estrutura de tabelas no banco`;
    if (lowerFiles.includes(".spec.") || lowerFiles.includes(".test.")) return `${action} cobertura de testes`;
    if (lowerFiles.includes("component") || /\.tsx/.test(lowerFiles)) {
        if (lowerDiff.includes("disabled") || lowerDiff.includes("readonly")) return `${action} prop de controle de estado`;
        if (lowerDiff.includes("style") || lowerDiff.includes("classname")) return `${action} estilos visuais dos componentes`;
        return `${action} componentes e comportamentos da interface`;
    }
    if (lowerFiles.includes("service") || lowerFiles.includes("api")) return `${action} integração e lógica de serviço`;
    if (lowerFiles.includes("hook")) return `${action} hooks e lógica de estado`;
    return `${action} implementação do módulo`;
}

function inferDescriptionFromFileType(file: string): string | null {
    const lower = file.toLowerCase();
    if (lower.endsWith("page.tsx")) return "renderização e carregamento da página";
    if (lower.endsWith(".tsx")) return "componente e comportamento da interface";
    if (lower.endsWith("/types.ts")) return "tipagens e contratos usados no fluxo";
    if (lower.endsWith("/db.ts")) return "acesso a dados e operações de persistência";
    if (lower.endsWith("/index.ts")) return "ponto de entrada e exportações do módulo";
    if (lower.endsWith("/server.ts")) return "configuração do servidor e integrações";
    if (lower.includes("/actions/")) return "ações do servidor e regras de negócio";
    if (lower.endsWith(".ts")) return "lógica e regras do módulo";
    if (lower.endsWith(".md")) return "documentação do uso e do comportamento esperado";
    if (lower.endsWith(".lock")) return "travamento de versões e resolução de dependências";
    return null;
}

function buildSingleFileDescription(file: string, status: string): string {
    const action = pickAction(status);
    const byType = inferDescriptionFromFileType(file);
    return byType ? `${action} ${byType}` : `${action} implementação relacionada ao módulo`;
}

function groupFiles(parsedFiles: ParsedFile[], diff: string): FileGroup[] {
    const buckets = new Map<string, ParsedFile[]>();
    for (const f of parsedFiles) {
        const key = groupKey(f.file);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(f);
    }
    const groups: FileGroup[] = [];
    for (const [key, files] of buckets) {
        const folder = key.split("/").slice(0, -1).join("/") || "(raiz)";
        groups.push({ label: folder, files, theme: themeOf(files[0].file), description: describeGroup(files, diff) });
    }
    return groups;
}

function renderDetailedBody(groups: FileGroup[]): string {
    const themes = [...new Set(groups.map((g) => g.theme))];
    const useBlocks = themes.length > 1;
    const byTheme = new Map<string, FileGroup[]>();
    for (const g of groups) {
        if (!byTheme.has(g.theme)) byTheme.set(g.theme, []);
        byTheme.get(g.theme)!.push(g);
    }
    const lines: string[] = [];
    for (const theme of themes) {
        if (useBlocks) lines.push(`[${theme}]`);
        for (const group of byTheme.get(theme)!) {
            if (group.files.length >= GROUP_THRESHOLD) {
                lines.push(`- ${group.label} (${group.files.length} arquivos): ${group.description}`);
            } else {
                for (const f of group.files) {
                    lines.push(`- ${f.file}: ${buildSingleFileDescription(f.file, f.status)}`);
                }
            }
        }
        if (useBlocks) lines.push("");
    }
    return lines.join("\n").trimEnd();
}

// ---------------------------------------------------------------------------
// Fallback para modo OVERVIEW (sem API)
// ---------------------------------------------------------------------------

function renderOverviewBody(parsedFiles: ParsedFile[], diff: string): string {
    const themes = [...new Set(parsedFiles.map((f) => themeOf(f.file)))];

    if (themes.length <= 1) {
        // Natureza única — parágrafo simples
        const theme = themes[0] ?? "Funcionalidade";
        const action = pickAction(parsedFiles[0]?.status ?? "alterado");
        return `${action} implementação relacionada a ${theme.toLowerCase()} com base nas alterações staged.`;
    }

    // Naturezas distintas — bullets por tema
    return themes
        .slice(0, 4)
        .map((theme) => {
            const filesOfTheme = parsedFiles.filter((f) => themeOf(f.file) === theme);
            const action = pickAction(filesOfTheme[0]?.status ?? "alterado");
            return `- ${action} ${theme.toLowerCase()}`;
        })
        .join("\n");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseFilesSummary(filesSummary: string): ParsedFile[] {
    return filesSummary.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
        const match = line.match(/^- (.+) \((.+)\)$/);
        if (!match) return { file: line.replace(/^- /, ""), status: "alterado" };
        return { file: match[1], status: match[2] };
    });
}

function parseDiffByFile(diff: string): Map<string, FileDiffInsight> {
    const insights = new Map<string, FileDiffInsight>();
    const lines = diff.split("\n");
    let currentFile: string | null = null;
    for (const line of lines) {
        if (line.startsWith("diff --git ")) {
            const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
            currentFile = match?.[2] ?? null;
            if (currentFile && !insights.has(currentFile))
                insights.set(currentFile, { additions: 0, deletions: 0, content: "" });
            continue;
        }
        if (!currentFile) continue;
        const current = insights.get(currentFile);
        if (!current) continue;
        if (line.startsWith("+") && !line.startsWith("+++")) { current.additions += 1; current.content += `${line.slice(1)}\n`; }
        else if (line.startsWith("-") && !line.startsWith("---")) { current.deletions += 1; current.content += `${line.slice(1)}\n`; }
    }
    return insights;
}

// ---------------------------------------------------------------------------
// Fallback público
// ---------------------------------------------------------------------------

export function buildFallbackCommitSuggestion(diff: string, filesSummary: string, mode: CommitMode = "detailed"): string {
    const parsedFiles = parseFilesSummary(filesSummary);
    const fileNames = parsedFiles.map(({ file }) => file);
    const kind = detectCommitKind(fileNames, diff);
    const header = `${kind.emoji} ${kind.type}(${kind.scope}): ${truncateTitle(kind.title)}`;

    const body = mode === "overview"
        ? renderOverviewBody(parsedFiles, diff)
        : renderDetailedBody(groupFiles(parsedFiles, diff));

    return `${header}\n\n${body}`;
}

// ---------------------------------------------------------------------------
// Chamada à API do Gemini
// ---------------------------------------------------------------------------

export async function getCommitSuggestion(
    apiKey: string,
    diff: string,
    filesSummary: string,
    styleContext: string,
    mode: CommitMode = "detailed"
): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);

    const systemInstruction = mode === "overview"
        ? SYSTEM_INSTRUCTIONS_OVERVIEW
        : SYSTEM_INSTRUCTIONS_DETAILED;

    const model = genAI.getGenerativeModel({ model: env.MODEL_GEMINI as string, systemInstruction });

    let diffContent = diff;
    let truncationWarning = "";
    if (diff.length > DIFF_CHAR_LIMIT) {
        diffContent = diff.substring(0, DIFF_CHAR_LIMIT);
        truncationWarning = `\n\n⚠️ ATENÇÃO: O diff foi truncado por ser muito extenso.`;
        console.log(chalk.yellow(`\n⚠️  Diff muito extenso (${diff.length.toLocaleString()} chars). Truncando para o limite.`));
    }

    const prompt = `
${styleContext || "## PERFIL DE ESTILO DO DESENVOLVEDOR\nSem histórico disponível."}

## ARQUIVOS MODIFICADOS:
${filesSummary}

## DIFF DETALHADO:
${diffContent}${truncationWarning}

Gere a mensagem de commit seguindo o perfil de estilo e o modo ${mode === "overview" ? "OVERVIEW" : "DETAILED"} conforme as instruções.`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text().replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
        } catch (error) {
            const retryable = isRetryableError(error);
            const isLastAttempt = attempt === MAX_RETRIES;
            if (!retryable || isLastAttempt) throw normalizeGeminiError(error);
            const waitMs = attempt * 1_500;
            console.log(chalk.yellow(`\n⚠️  Falha temporaria. Nova tentativa em ${(waitMs / 1000).toFixed(1)}s...`));
            await sleep(waitMs);
        }
    }

    throw new GeminiServiceError(
        "Nao foi possivel gerar a sugestao de commit apos varias tentativas.",
        { code: "UNKNOWN", retryable: true }
    );
}