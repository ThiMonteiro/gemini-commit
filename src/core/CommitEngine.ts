import chalk from "chalk";
import prompts from "prompts";
import {
    buildFallbackCommitSuggestion,
    GeminiServiceError,
    getCommitSuggestion
} from "../services/gemini.js";
import { Git } from "../utils/git.js";

export class CommitEngine {
    private apiKey: string;
    private currentMessage: string = "";
    private isDone: boolean = false;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * O ponto de entrada principal que inicia o loop de interação.
     */
    async run(): Promise<void> {
        const filesSummary = Git.getChangedFilesSummary();

        if (!filesSummary) {
            console.log(chalk.yellow("⚠️ Use 'git add' primeiro."));
            return;
        }

        this.displayEnvironmentInfo(filesSummary);

        const diff = Git.getStagedDiff() ?? "";

        while (!this.isDone) {
            if (!this.currentMessage) {
                await this.generateNewSuggestion(diff, filesSummary);
            }

            if (!this.currentMessage) {
                const { action } = await prompts({
                    type: 'select',
                    name: 'action',
                    message: 'Não foi possível gerar uma sugestão. O que deseja fazer?',
                    choices: [
                        { title: '🔄 Tentar novamente', value: 'regenerate' },
                        { title: '❌ Cancelar', value: 'cancel' }
                    ]
                });

                await this.handleAction(action, diff, filesSummary);
                continue;
            }

            this.showSuggestion();

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

            await this.handleAction(action, diff, filesSummary);
        }
    }

    private displayEnvironmentInfo(filesSummary: string): void {
        const fileCount = filesSummary.split("\n").length;
        console.log(chalk.blue(`🚀 Projeto: [${Git.getProjectName()}]`));
        console.log(chalk.blue(`📂 Arquivos staged: ${fileCount}`));
        console.log(chalk.gray(filesSummary));
    }

    private async generateNewSuggestion(diff: string, filesSummary: string): Promise<void> {
        console.log(chalk.cyan("🤖 Analisando seu estilo e gerando sugestão..."));

        // Passo 2: Busca o histórico de estilo
        const history = Git.getRecentCommits(5);

        try {
            this.currentMessage = await getCommitSuggestion(
                this.apiKey,
                diff,
                filesSummary,
                history
            );
        } catch (error) {
            this.displaySuggestionError(error);
            this.currentMessage = buildFallbackCommitSuggestion(diff, filesSummary);
            console.log(chalk.yellow("\n🛟 Usando sugestão local de fallback baseada no diff staged."));
        }
    }

    private showSuggestion(): void {
        console.log(chalk.gray("\n--- Sugestão ---"));
        console.log(chalk.white(this.currentMessage));
        console.log(chalk.gray("----------------\n"));
    }

    private async handleAction(action: string, diff: string, filesSummary: string): Promise<void> {
        switch (action) {
            case 'regenerate':
                this.currentMessage = "";
                break;

            case 'edit':
                await this.handleEdit();
                break;

            case 'commit':
                await this.executeCommitFlow();
                break;

            case 'cancel':
            default:
                console.log(chalk.yellow("\nAté logo! 👋"));
                this.isDone = true;
                break;
        }
    }

    private displaySuggestionError(error: unknown): void {
        if (error instanceof GeminiServiceError) {
            console.log(chalk.red(`\n❌ ${error.message}`));

            if (error.retryable) {
                console.log(chalk.yellow("Você pode tentar gerar novamente sem perder o fluxo atual."));
            }

            return;
        }

        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.red(`\n❌ Falha inesperada ao gerar sugestão: ${message}`));
    }

    private async handleEdit(): Promise<void> {
        const { edited } = await prompts({
            type: 'text',
            name: 'edited',
            message: 'Edite a mensagem de commit:',
            initial: this.currentMessage
        });

        if (edited && edited.trim() !== "") {
            this.currentMessage = edited.trim();
        } else {
            console.log(chalk.yellow("Nenhuma edição feita, mantendo original."));
        }
    }

    private async executeCommitFlow(): Promise<void> {
        Git.commit(this.currentMessage);
        console.log(chalk.green("\n✅ Commit realizado com sucesso!"));

        const { push } = await prompts({
            type: 'confirm',
            name: 'push',
            message: 'Deseja fazer push agora?',
            initial: true
        });

        if (push) {
            console.log(chalk.cyan("\n⬆️ Enviando para o repositório remoto..."));
            Git.push();
            console.log(chalk.bold.green("✨ Tudo pronto! Código na nuvem."));
        } else {
            console.log(chalk.yellow("👍 Commit mantido localmente."));
        }

        this.isDone = true;
    }
}
