import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export async function openEditor(initialContent: string): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `gcommit-${Date.now()}.txt`);

    fs.writeFileSync(tempFile, initialContent);

    const editor = process.env.EDITOR || process.env.VISUAL || (os.platform() === "win32" ? "notepad" : "nano");

    return new Promise((resolve, reject) => {
        const child = spawn(editor, [tempFile], {
            stdio: "inherit",
            shell: true
        });

        child.on("exit", (code) => {
            if (code === 0) {
                const editedContent = fs.readFileSync(tempFile, "utf8");
                fs.unlinkSync(tempFile);
                resolve(editedContent.trim());
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
