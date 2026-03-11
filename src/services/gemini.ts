import { GoogleGenerativeAI } from "@google/generative-ai";
import chalk from "chalk";
import { SYSTEM_INSTRUCTIONS } from "../constants/prompt.js";

const DIFF_CHAR_LIMIT = 100_000;

export async function getCommitSuggestion(apiKey: string, diff: string, filesSummary: string): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_INSTRUCTIONS
    });

    let diffContent = diff;
    let truncationWarning = "";

    if (diff.length > DIFF_CHAR_LIMIT) {
        diffContent = diff.substring(0, DIFF_CHAR_LIMIT);
        truncationWarning = `\n\n⚠️ ATENÇÃO: O diff foi truncado em ${DIFF_CHAR_LIMIT.toLocaleString()} caracteres por ser muito extenso. Use a lista de arquivos acima como referência completa para o corpo do commit.`;
        console.log(chalk.yellow(`\n⚠️  Diff muito extenso (${diff.length.toLocaleString()} chars). Truncando para ${DIFF_CHAR_LIMIT.toLocaleString()} chars.`));
    }

    const prompt = `## Arquivos modificados neste commit (lista COMPLETA e obrigatória para o corpo):
${filesSummary}

## Diff detalhado (pode estar truncado):
${diffContent}${truncationWarning}

Gere a mensagem de commit seguindo estritamente as instruções do sistema.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim().replace(/```/g, "");
}