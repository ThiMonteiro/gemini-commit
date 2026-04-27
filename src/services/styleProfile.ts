import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Git } from "../utils/git.js";

const PROFILE_FILENAME = ".gcommit-profile.json";
const COMMIT_SAMPLE_SIZE = 20;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type StyleProfile = {
    /** Hash do commit mais recente quando o perfil foi gerado */
    lastCommitHash: string;
    /** Vocabulário recorrente extraído dos títulos */
    vocabulary: string[];
    /** Escopos mais usados: cli, core, ui, etc. */
    scopes: string[];
    /** Emojis + tipos mais usados: ["✨ feat", "🐛 fix", ...] */
    preferredTypes: string[];
    /** Nível de detalhe: "short" | "detailed" */
    detailLevel: "short" | "detailed";
    /** Exemplos reais de commits anteriores (máx 5) */
    examples: string[];
};

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------

function profilePath(): string {
    return join(process.cwd(), PROFILE_FILENAME);
}

function loadCached(): StyleProfile | null {
    const path = profilePath();
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, "utf-8")) as StyleProfile;
    } catch {
        return null;
    }
}

function saveCache(profile: StyleProfile): void {
    try {
        writeFileSync(profilePath(), JSON.stringify(profile, null, 2), "utf-8");
    } catch {
        // Falha silenciosa — o perfil ainda será usado na memória
    }
}

// ---------------------------------------------------------------------------
// Parsing e extração de padrões
// ---------------------------------------------------------------------------

/**
 * Extrai o emoji + tipo de um título de commit.
 * Ex: "✨ feat(cli): adiciona..." → "✨ feat"
 */
function extractType(title: string): string | null {
    const match = title.match(/^(\S+)\s+(feat|fix|docs|refactor|test|chore|perf|ci|build|style)/i);
    if (!match) return null;
    return `${match[1]} ${match[2].toLowerCase()}`;
}

/**
 * Extrai o escopo de um título de commit.
 * Ex: "✨ feat(cli): ..." → "cli"
 */
function extractScope(title: string): string | null {
    const match = title.match(/\(([^)]+)\)/);
    return match?.[1] ?? null;
}

/**
 * Extrai palavras-chave do corpo do título (verbos imperativos e substantivos técnicos).
 * Remove stopwords, emojis e prefixos convencionais.
 */
function extractKeywords(title: string): string[] {
    const clean = title
        .replace(/^(\S+)\s+\w+(\([^)]+\))?:\s*/u, "") // remove "✨ feat(cli): "
        .toLowerCase();

    const stopwords = new Set([
        "a", "o", "e", "de", "do", "da", "no", "na", "em", "para",
        "com", "por", "ao", "os", "as", "um", "uma", "que", "se",
        "the", "in", "to", "of", "and", "for", "on", "at", "with"
    ]);

    return clean
        .split(/\s+/)
        .map(w => w.replace(/[^a-záéíóúãõç]/gi, ""))
        .filter(w => w.length > 3 && !stopwords.has(w));
}

/**
 * Calcula o nível de detalhe médio com base no comprimento das mensagens.
 */
function computeDetailLevel(commits: string[]): "short" | "detailed" {
    if (commits.length === 0) return "short";
    const avgLength = commits.reduce((sum, c) => sum + c.length, 0) / commits.length;
    return avgLength > 120 ? "detailed" : "short";
}

/**
 * Retorna os N itens mais frequentes de uma lista.
 */
function topN<T>(items: T[], n: number): T[] {
    const freq = new Map<string, number>();
    for (const item of items) {
        const key = String(item);
        freq.set(key, (freq.get(key) ?? 0) + 1);
    }
    return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key]) => key) as T[];
}

// ---------------------------------------------------------------------------
// Construção do perfil
// ---------------------------------------------------------------------------

function buildProfile(commits: string[], lastHash: string): StyleProfile {
    const types: string[] = [];
    const scopes: string[] = [];
    const keywords: string[] = [];

    for (const commit of commits) {
        const firstLine = commit.split("\n")[0];

        const type = extractType(firstLine);
        if (type) types.push(type);

        const scope = extractScope(firstLine);
        if (scope) scopes.push(scope);

        keywords.push(...extractKeywords(firstLine));
    }

    return {
        lastCommitHash: lastHash,
        vocabulary: topN(keywords, 12),
        scopes: topN(scopes, 6),
        preferredTypes: topN(types, 5),
        detailLevel: computeDetailLevel(commits),
        examples: commits.slice(0, 5),
    };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Retorna o perfil de estilo do desenvolvedor.
 * - Se não há cache: analisa git log e salva.
 * - Se há cache mas há commits novos: re-analisa e atualiza.
 * - Se cache está atualizado: retorna direto do arquivo.
 */
export function getStyleProfile(): StyleProfile | null {
    const currentHash = Git.getLatestCommitHash();
    if (!currentHash) return null; // Repositório sem histórico

    const cached = loadCached();

    if (cached && cached.lastCommitHash === currentHash) {
        return cached;
    }

    // Precisa gerar ou atualizar
    const rawCommits = Git.getRecentCommits(COMMIT_SAMPLE_SIZE);
    if (!rawCommits) return null;

    const commits = rawCommits
        .split("\n")
        .map(c => c.trim())
        .filter(Boolean);

    if (commits.length === 0) return null;

    const profile = buildProfile(commits, currentHash);
    saveCache(profile);

    return profile;
}

/**
 * Serializa o perfil em um bloco de texto legível para o prompt do Gemini.
 */
export function formatProfileForPrompt(profile: StyleProfile): string {
    const lines: string[] = [
        "## PERFIL DE ESTILO DO DESENVOLVEDOR",
        "",
        `**Tipos preferidos:** ${profile.preferredTypes.join(" | ") || "não identificado"}`,
        `**Escopos usados:** ${profile.scopes.join(", ") || "não identificado"}`,
        `**Vocabulário recorrente:** ${profile.vocabulary.join(", ") || "não identificado"}`,
        `**Nível de detalhe:** ${profile.detailLevel === "detailed" ? "corpo detalhado" : "corpo curto e direto"}`,
        "",
        "**Exemplos de commits anteriores:**",
        ...profile.examples.map(e => `- ${e.split("\n")[0]}`),
    ];

    return lines.join("\n");
}