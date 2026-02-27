#!/usr/bin/env node
import chalk from "chalk";
import "dotenv/config";
import prompts from "prompts";
import { getCommitSuggestion } from "./services/gemini.js";
import { Git } from "./utils/git.js";

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error(chalk.red("❌ GEMINI_API_KEY não configurada."));
        process.exit(1);
    }

    const diff = Git.getStagedDiff();
    if (!diff) {
        console.log(chalk.yellow("⚠️ Use 'git add' primeiro."));
        return;
    }

    console.log(chalk.blue(`🚀 Projeto: [${Git.getProjectName()}]`));

    let currentMessage = "";
    let isDone = false;

    while (!isDone) {
        if (!currentMessage) {
            console.log(chalk.cyan("🤖 Gerando sugestão..."));
            currentMessage = await getCommitSuggestion(apiKey, diff);
        }

        console.log(chalk.gray("\n--- Sugestão ---"));
        console.log(chalk.white(currentMessage));
        console.log(chalk.gray("----------------\n"));

        const { action } = await prompts({
            type: 'select',
            name: 'action',
            message: 'O que deseja fazer?',
            choices: [
                { title: '✅ Aceitar e Commitar', value: 'commit' },
                { title: '🔄 Gerar nova sugestão', value: 'regenerate' },
                { title: '✏️ Editar mensagem', value: 'edit' },
                { title: '❌ Cancelar', value: 'cancel' }
            ]
        });

        if (action === 'commit') {
            Git.commit(currentMessage);
            console.log(chalk.green("✅ Feito!"));
            isDone = true;
        }
        else if (action === 'edit') {
            const { edited } = await prompts({
                type: 'text',
                name: 'edited',
                message: 'Edite:',
                initial: currentMessage
            });
            if (edited) {
                Git.commit(edited);
                console.log(chalk.green("✅ Feito!"));
                isDone = true;
            }
        }
        else if (action === 'regenerate') {
            currentMessage = "";
        }
        else {
            console.log(chalk.yellow("Tchau!"));
            isDone = true;
        }
    }

}

main();
