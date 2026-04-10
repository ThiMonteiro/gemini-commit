#!/usr/bin/env node
import chalk from "chalk";
import "dotenv/config";
import { CommitEngine } from "./core/CommitEngine.js";
import { env } from "./env.js";

async function bootstrap() {
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error(chalk.red("❌ GEMINI_API_KEY não encontrada."));
        process.exit(1);
    }

    // Inicializa e executa o motor
    const engine = new CommitEngine(apiKey);
    await engine.run();
}

bootstrap().catch((err) => {
    console.error(chalk.red("\n💥 Erro crítico na aplicação:"), err);
    process.exit(1);
});