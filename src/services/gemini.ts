import { GoogleGenerativeAI } from "@google/generative-ai";
import chalk from "chalk";
import { SYSTEM_INSTRUCTIONS } from "../constants/prompt.js";

const DIFF_CHAR_LIMIT = 100_000;
const MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const TITLE_LIMIT = 50;

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
    if (error instanceof Error) {
        return error.message;
    }

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

    if (status && RETRYABLE_STATUS_CODES.has(status)) {
        return true;
    }

    return [
        "fetch failed",
        "service unavailable",
        "network",
        "econnreset",
        "etimedout",
        "timeout",
        "temporar"
    ].some((fragment) => message.includes(fragment));
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

type CommitKind = {
    emoji: string;
    type: string;
    scope: string;
    title: string;
};

type ParsedFile = {
    file: string;
    status: string;
};

type FileDiffInsight = {
    additions: number;
    deletions: number;
    content: string;
};

function truncateTitle(title: string): string {
    if (title.length <= TITLE_LIMIT) {
        return title;
    }

    return `${title.slice(0, TITLE_LIMIT - 3).trimEnd()}...`;
}

function toScope(files: string[]): string {
    const normalized = files
        .map((file) => file.split("/")[0])
        .filter((part) => part && !part.includes("."));

    if (normalized.length === 0) {
        return "core";
    }

    return normalized[0].toLowerCase();
}

function detectCommitKind(files: string[], diff: string): CommitKind {
    const content = `${files.join("\n")}\n${diff}`.toLowerCase();

    if (files.some((file) => /(^|\/)(readme|docs?)|\.md$/i.test(file))) {
        return { emoji: "📝", type: "docs", scope: "docs", title: "documenta uso e fluxo do projeto" };
    }

    if (files.some((file) => /(\.|\/)(spec|test)\./i.test(file) || /__tests__/i.test(file))) {
        return { emoji: "✅", type: "test", scope: "tests", title: "cobre cenarios com novos testes" };
    }

    if (files.some((file) => /package\.json|tsconfig|vite|webpack|rollup|eslint|prettier|docker|github\/workflows/i.test(file))) {
        return { emoji: "🔧", type: "chore", scope: "config", title: "ajusta configuracoes do projeto" };
    }

    if (content.includes("fix") || content.includes("error") || content.includes("bug") || content.includes("catch")) {
        return { emoji: "🐛", type: "fix", scope: toScope(files), title: "corrige falhas no fluxo de commit" };
    }

    if (content.includes("refactor") || content.includes("rename") || content.includes("extract") || content.includes("cleanup")) {
        return { emoji: "♻️", type: "refactor", scope: toScope(files), title: "reorganiza fluxo interno do commit" };
    }

    return { emoji: "✨", type: "feat", scope: toScope(files), title: "adiciona suporte ao fluxo de commit" };
}

function inferFileDescription(file: string, status: string, diff: string): string {
    const lowerFile = file.toLowerCase();
    const lowerDiff = diff.toLowerCase();
    const actionMap: Record<string, string> = {
        adicionado: "adiciona",
        modificado: "atualiza",
        removido: "remove",
        renomeado: "renomeia",
        copiado: "copia",
        alterado: "ajusta"
    };
    const action = actionMap[status] || "atualiza";

    if (lowerFile.includes("gemini")) {
        return `${action} integracao com Gemini e tratamento de falhas da API`;
    }

    if (lowerFile.includes("commitengine")) {
        return `${action} fluxo interativo e recuperacao de erros na geracao`;
    }

    if (lowerFile.includes("git")) {
        return `${action} leitura do estado staged e operacoes de commit`;
    }

    if (lowerFile.includes("prompt")) {
        return `${action} instrucoes enviadas ao modelo para gerar commits`;
    }

    if (lowerFile.endsWith(".md")) {
        return `${action} documentacao do uso e do comportamento esperado`;
    }

    if (lowerDiff.includes("retry") || lowerDiff.includes("backoff")) {
        return `${action} logica de retry e mensagens para falhas transitorias`;
    }

    if (lowerDiff.includes("prompt") || lowerDiff.includes("select")) {
        return `${action} mensagens e interacoes exibidas no terminal`;
    }

    return `${action} implementacao relacionada ao fluxo de commit automatizado`;
}

function parseFilesSummary(filesSummary: string): ParsedFile[] {
    return filesSummary
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const match = line.match(/^- (.+) \((.+)\)$/);

            if (!match) {
                return { file: line.replace(/^- /, ""), status: "alterado" };
            }

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

            if (currentFile && !insights.has(currentFile)) {
                insights.set(currentFile, { additions: 0, deletions: 0, content: "" });
            }

            continue;
        }

        if (!currentFile) {
            continue;
        }

        const current = insights.get(currentFile);

        if (!current) {
            continue;
        }

        if (line.startsWith("+") && !line.startsWith("+++")) {
            current.additions += 1;
            current.content += `${line.slice(1)}\n`;
            continue;
        }

        if (line.startsWith("-") && !line.startsWith("---")) {
            current.deletions += 1;
            current.content += `${line.slice(1)}\n`;
        }
    }

    return insights;
}

function pickAction(status: string): string {
    const actionMap: Record<string, string> = {
        adicionado: "adiciona",
        modificado: "atualiza",
        removido: "remove",
        renomeado: "renomeia",
        copiado: "copia",
        alterado: "ajusta"
    };

    return actionMap[status] || "atualiza";
}

function inferDomainFromPath(file: string): string | null {
    const lowerFile = file.toLowerCase();
    const segments = lowerFile.split("/");

    if (lowerFile.startsWith("apps/admin/")) {
        return "aplicacao administrativa";
    }

    if (lowerFile.startsWith("apps/web/")) {
        return "aplicacao web";
    }

    if (lowerFile.startsWith("packages/backend/")) {
        return "servicos do backend";
    }

    if (lowerFile.startsWith("packages/")) {
        return "pacotes compartilhados";
    }

    if (lowerFile.startsWith("migrations/")) {
        return "migracoes de banco de dados";
    }

    if (segments.includes("actions")) {
        return "camada de actions";
    }

    if (segments.includes("components")) {
        return "camada de componentes";
    }

    if (segments.includes("app")) {
        return "camada de rotas da aplicacao";
    }

    if (segments.includes("db") || segments.includes("schema")) {
        return "camada de persistencia";
    }

    return null;
}

function inferDescriptionFromFileType(file: string): string | null {
    const lowerFile = file.toLowerCase();

    if (lowerFile.endsWith(".sql")) {
        return "estrutura e consultas relacionadas ao banco";
    }

    if (lowerFile.endsWith("page.tsx")) {
        return "renderizacao e carregamento da pagina";
    }

    if (lowerFile.endsWith(".tsx")) {
        return "componente e comportamento da interface";
    }

    if (lowerFile.endsWith(".ts")) {
        if (lowerFile.endsWith("/types.ts")) {
            return "tipagens e contratos usados no fluxo";
        }

        if (lowerFile.endsWith("/db.ts")) {
            return "acesso a dados e operacoes de persistencia";
        }

        if (lowerFile.endsWith("/index.ts")) {
            return "ponto de entrada e exportacoes do modulo";
        }

        if (lowerFile.endsWith("/server.ts")) {
            return "configuracao do servidor e integracoes";
        }

        if (lowerFile.includes("/actions/")) {
            return "acoes do servidor e regras de negocio";
        }

        return "logica e regras do modulo";
    }

    if (lowerFile.endsWith(".md")) {
        return "documentacao do uso e do comportamento esperado";
    }

    if (lowerFile.endsWith(".lock")) {
        return "travamento de versoes e resolucao de dependencias";
    }

    return null;
}

function inferDescriptionFromFileDiff(file: string, fileDiff: FileDiffInsight | undefined): string | null {
    if (!fileDiff) {
        return null;
    }

    const lowerContent = fileDiff.content.toLowerCase();
    const lowerFile = file.toLowerCase();

    if (lowerFile.includes("gemini")) {
        return "integracao com Gemini e tratamento de falhas da API";
    }

    if (lowerFile.includes("commitengine")) {
        return "fluxo interativo e recuperacao de erros na geracao";
    }

    if (lowerFile.includes("git")) {
        return "leitura do estado staged e operacoes de commit";
    }

    if (lowerFile.includes("prompt")) {
        return "instrucoes enviadas ao modelo para gerar commits";
    }

    if (lowerContent.includes("zod") || lowerContent.includes("schema")) {
        return "validacao de dados e definicao de esquema";
    }

    if (lowerContent.includes("select ") || lowerContent.includes("insert ") || lowerContent.includes("update ") || lowerContent.includes("delete ")) {
        return "consultas e manipulacao de dados persistidos";
    }

    if (lowerContent.includes("fetch(") || lowerContent.includes("await fetch") || lowerContent.includes("axios")) {
        return "integracao com requisicoes externas";
    }

    if (lowerContent.includes("use state") || lowerContent.includes("usestate") || lowerContent.includes("useeffect") || lowerContent.includes("form")) {
        return "estado da interface e interacoes do formulario";
    }

    if (lowerContent.includes("export type") || lowerContent.includes("interface ") || lowerContent.includes("type ")) {
        return "tipagens e contratos compartilhados";
    }

    if (lowerContent.includes("try {") || lowerContent.includes("catch") || lowerContent.includes("error")) {
        return "tratamento de erros e fluxo de excecao";
    }

    if (fileDiff.additions > 0 && fileDiff.deletions === 0) {
        return "novas capacidades no fluxo deste modulo";
    }

    if (fileDiff.deletions > 0 && fileDiff.additions === 0) {
        return "remocao de codigo e simplificacao do fluxo";
    }

    if (fileDiff.additions > 0 && fileDiff.deletions > 0) {
        return "comportamento interno e organizacao do fluxo";
    }

    return null;
}

function buildFileDescription(file: string, status: string, fileDiff: FileDiffInsight | undefined): string {
    const action = pickAction(status);
    const specific = inferDescriptionFromFileDiff(file, fileDiff);

    if (specific) {
        return `${action} ${specific}`;
    }

    const byType = inferDescriptionFromFileType(file);
    const domain = inferDomainFromPath(file);

    if (byType && domain) {
        return `${action} ${byType} do ${domain}`;
    }

    if (byType) {
        return `${action} ${byType}`;
    }

    if (domain) {
        return `${action} implementacao ligada ao ${domain}`;
    }

    return inferFileDescription(file, status, fileDiff?.content ?? "");
}

export function buildFallbackCommitSuggestion(diff: string, filesSummary: string): string {
    const parsedFiles = parseFilesSummary(filesSummary);
    const diffByFile = parseDiffByFile(diff);
    const fileNames = parsedFiles.map(({ file }) => file);
    const kind = detectCommitKind(fileNames, diff);
    const header = `${kind.emoji} ${kind.type}(${kind.scope}): ${truncateTitle(kind.title)}`;
    const body = parsedFiles
        .map(({ file, status }) => `- ${file}: ${buildFileDescription(file, status, diffByFile.get(file))}.`)
        .join("\n");

    return `${header}\n\n${body}`;
}

/**
 * Solicita uma sugestão de commit ao Gemini, fornecendo o diff, 
 * o resumo dos arquivos e o histórico de estilo do desenvolvedor.
 */
// ... (imports e constantes iguais)

export async function getCommitSuggestion(
    apiKey: string,
    diff: string,
    filesSummary: string,
    history: string
): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_INSTRUCTIONS
    });

    let diffContent = diff;
    let truncationWarning = "";

    if (diff.length > DIFF_CHAR_LIMIT) {
        diffContent = diff.substring(0, DIFF_CHAR_LIMIT);
        truncationWarning = `\n\n⚠️ ATENÇÃO: O diff foi truncado por ser muito extenso.`;
        console.log(chalk.yellow(`\n⚠️  Diff muito extenso (${diff.length.toLocaleString()} chars). Truncando para o limite.`));
    }

    const prompt = `
## HISTÓRICO DE ESTILO:
${history || "Sem histórico disponível."}

## ARQUIVOS MODIFICADOS:
${filesSummary}

## DIFF DETALHADO:
${diffContent}${truncationWarning}

Gere a mensagem de commit seguindo o histórico de estilo e o Agrupamento Inteligente.`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            return responseText
                .replace(/```[a-z]*\n?/gi, "")
                .replace(/```/g, "")
                .trim();
        } catch (error) {
            const retryable = isRetryableError(error);
            const isLastAttempt = attempt === MAX_RETRIES;

            if (!retryable || isLastAttempt) {
                throw normalizeGeminiError(error);
            }

            const waitMs = attempt * 1_500;
            console.log(
                chalk.yellow(
                    `\n⚠️  Falha temporaria ao consultar o Gemini. Nova tentativa em ${(
                        waitMs / 1000
                    ).toFixed(1)}s...`
                )
            );
            await sleep(waitMs);
        }
    }

    throw new GeminiServiceError(
        "Nao foi possivel gerar a sugestao de commit apos varias tentativas.",
        { code: "UNKNOWN", retryable: true }
    );
}
