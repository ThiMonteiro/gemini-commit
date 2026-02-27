import { execFileSync } from "child_process";

export const Git = {
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
    }
}