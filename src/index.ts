#!/usr/bin/env node
import chalk from "chalk";
import "dotenv/config";
import prompts from "prompts";
import { env } from "./env.js";
import { getCommitSuggestion } from "./services/gemini.js";
import { Git } from "./utils/git.js";

async function main() {
    const apiKey = env.GEMINI_API_KEY;
    console.log(chalk.blue("🔍 Verificando ambiente..."))
    console.log(chalk.blue(`🔑 API Key: ${apiKey ? "Configurada" : "Não configurada"}`));

    if (!apiKey) {
        console.error(chalk.red("❌ GEMINI_API_KEY não configurada."));
        process.exit(1);
    }

    const filesSummary = Git.getChangedFilesSummary();
    if (!filesSummary) {
        console.log(chalk.yellow("⚠️ Use 'git add' primeiro."));
        return;
    }

    const diff = Git.getStagedDiff() ?? "";
    const fileCount = filesSummary.split("\n").length;

    console.log(chalk.blue(`🚀 Projeto: [${Git.getProjectName()}]`));
    console.log(chalk.blue(`📂 Arquivos staged: ${fileCount}`));
    console.log(chalk.gray(filesSummary));

    let currentMessage = "";
    let isDone = false;

    while (!isDone) {
        if (!currentMessage) {
            console.log(chalk.cyan("🤖 Gerando sugestão..."));
            currentMessage = await getCommitSuggestion(apiKey, diff, filesSummary);
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

        if (action === 'regenerate') {
            currentMessage = "";
            continue;
        }

        if (action === 'cancel' || !action) {
            console.log(chalk.yellow("Tchau!"));
            break;
        }

        let finalMessage = currentMessage;

        if (action === 'edit') {
            const { edited } = await prompts({
                type: 'text',
                name: 'edited',
                message: 'Edite a mensagem de commit:',
                initial: currentMessage
            });
            if (edited && edited.trim() !== "") {
                finalMessage = edited.trim();
            } else {
                console.log(chalk.yellow("Nenhuma edição feita, usando sugestão original."));
                continue;
            }
        }

        Git.commit(finalMessage);
        console.log(chalk.green("✅ Commit realizado com sucesso!"));
        const { push } = await prompts({
            type: 'confirm',
            name: 'push',
            message: 'Deseja fazer push agora?',
            initial: true
        });
        if (push) {
            console.log(chalk.cyan("⬆️ Enviando para o repositório remoto..."));
            Git.push();
            console.log(chalk.bold.green("✨ Tudo pronto! Código na nuvem."));
        } else {
            console.log(chalk.yellow("👍 Commit mantido localmente."));
        }
        isDone = true;
    }

}

main();
