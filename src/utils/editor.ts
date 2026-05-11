import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export async function openEditor(initialContent: string): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `GEMINI_COMMIT_EDITMSG-${Date.now()}.txt`);

    const instructions = `\n\n# ---
# Edite a mensagem acima para alterar o commit.
# Linhas começando com '#' serão ignoradas.
# Salve e feche o editor para confirmar.`;

    fs.writeFileSync(tempFile, initialContent + instructions);

    const editorConfig = process.env.EDITOR || process.env.VISUAL || (os.platform() === "win32" ? "notepad" : "nano");
    const [editor, ...args] = editorConfig.split(" ");

    // Adiciona flags de espera para editores comuns que abrem em novas janelas
    if (editor.includes("code") && !args.includes("--wait")) {
        args.push("--wait");
    }

    return new Promise((resolve, reject) => {
        const child = spawn(editor, [...args, tempFile], {
            stdio: "inherit",
            shell: true
        });

        child.on("exit", (code) => {
            if (code === 0) {
                const editedContent = fs.readFileSync(tempFile, "utf8");
                const cleanContent = editedContent
                    .split("\n")
                    .filter(line => !line.trim().startsWith("#"))
                    .join("\n")
                    .trim();
                
                fs.unlinkSync(tempFile);
                resolve(cleanContent);
            } else {
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                reject(new Error(`Editor finalizou com código de erro: ${code}`));
            }
        });

        child.on("error", (err) => {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            reject(err);
        });
    });
}
