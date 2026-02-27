import { GoogleGenerativeAI } from "@google/generative-ai";
import { SYSTEM_INSTRUCTIONS } from "../constants/prompt.js";

export async function getCommitSuggestion(apiKey: string, diff: string): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_INSTRUCTIONS
    });

    const prompt = `Gere a mensagem de commit para o seguinte diff:\n\n${diff.substring(0, 20000)}`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim().replace(/```/g, "");
}