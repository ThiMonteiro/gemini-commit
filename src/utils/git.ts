import chalk from "chalk";
import { execFileSync, execSync } from "child_process";

export const Git = {

    getCurrentBranch(): string {
        try {
            const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"]).toString().trim();
            return branch;
        } catch {
            return "main";
        }
    },

    getRecentCommits(count: number = 5): string {
        try {
            // Retorna os últimos títulos e corpos para a IA entender seu estilo
            return execSync(`git log -${count} --pretty=format:"%s %b"`).toString().trim();
        } catch { return ""; }
    },

    getStagedDiff(): string | null {
        try {
            const diff = execFileSync("git", [
                "diff",
                "--staged",
                "--",
                ".",
                ":(exclude)package-lock.json",
                ":(exclude)yarn.lock",
                ":(exclude)pnpm-lock.yaml"
            ]).toString().trim();
            return diff || null;
        } catch {
            return null;
        }
    },

    getChangedFilesSummary(): string {
        try {
            const output = execFileSync("git", [
                "diff",
                "--staged",
                "--name-status",
                "--",
                ".",
                ":(exclude)package-lock.json",
                ":(exclude)yarn.lock",
                ":(exclude)pnpm-lock.yaml"
            ]).toString().trim();

            if (!output) return "";

            const statusMap: Record<string, string> = {
                M: "modificado",
                A: "adicionado",
                D: "removido",
                R: "renomeado",
                C: "copiado",
                U: "não mesclado",
            };

            return output.split("\n").map(line => {
                const parts = line.split("\t");
                const code = parts[0];
                // Se for renomeado (R), o nome final é o último elemento do array
                const file = parts[parts.length - 1];

                return `- ${file} (${statusMap[code[0]] || "alterado"})`;
            }).join("\n");
        } catch {
            return "";
        }
    },
    getProjectName(): string {
        try {
            const gitConfig = execFileSync("git", ["config", "--get", "remote.origin.url"]).toString();
            return gitConfig.split("/").pop()?.split(".")[0] || "Projeto Local";
        } catch {
            return "Projeto Local";
        }
    },
    commit(message: string) {
        execFileSync("git", ["commit", "-m", message], { stdio: "inherit" });
    },
    push() {
        try {
            execFileSync("git", ["push"], { stdio: "inherit" });
        } catch (error) {
            const branch = this.getCurrentBranch();

            console.log(chalk.yellow(`\n⚠️  Branch [${branch}] sem upstream detectada.`));
            console.log(chalk.blue(`🌍 Configurando upstream origin ${branch}...`));

            try {
                execFileSync("git", ["push", "--set-upstream", "origin", branch], { stdio: "inherit" });
                console.log(chalk.green(`✅ Branch [${branch}] configurada e push realizado!`));
            } catch (pushError) {
                console.error(chalk.red("❌ Erro ao configurar upstream e realizar push:"), pushError);
            }
        }
    }
}