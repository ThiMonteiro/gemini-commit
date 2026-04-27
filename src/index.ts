#!/usr/bin/env node
import chalk from "chalk";
import "dotenv/config";
import { CommitEngine } from "./core/CommitEngine.js";
import { env } from "./env.js";
import type { CommitMode } from "./services/gemini.js";

function parseArgs(): { mode: CommitMode } {
    const args = process.argv.slice(2);

    if (args.includes("--overview")) return { mode: "overview" };
    if (args.includes("--detailed")) return { mode: "detailed" };

    return { mode: "detailed" };
}

async function bootstrap() {
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error(chalk.red("❌ GEMINI_API_KEY não encontrada."));
        process.exit(1);
    }

    const { mode } = parseArgs();

    const engine = new CommitEngine(apiKey, mode);
    await engine.run();
}

bootstrap().catch((err) => {
    console.error(chalk.red("\n💥 Erro crítico na aplicação:"), err);
    process.exit(1);
});