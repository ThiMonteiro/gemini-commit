import { GoogleGenerativeAI } from "@google/generative-ai";
import chalk from "chalk";
import { execFileSync, execSync } from "child_process";
import "dotenv/config";
import prompts from "prompts";

const SYSTEM_INSTRUCTIONS = `
Atue como um Especialista em Git e Desenvolvimento de Software Sênior. Sua tarefa é gerar mensagens de commit impecáveis baseadas no diff fornecido.
**Responda SEMPRE E EXCLUSIVAMENTE em Português Brasileiro (pt-BR).**

### 🔒 PADRÃO OBRIGATÓRIO
- Utilize estritamente o padrão **Conventional Commits**.
- Sempre escreva no **MODO IMPERATIVO**: (✅ adiciona, corrige, remove | ❌ adicionando, corrigido).
- **NUNCA** finalize o título com ponto final.
- Máximo de **50 caracteres no título**.

### ✨ EMOJIS OBRIGATÓRIOS (Antes do tipo)
Selecione o emoji correto baseado na mudança:
- ✨ feat: Nova funcionalidade
- 🐛 fix: Correção de bug
- 📝 docs: Documentação
- ♻️ refactor: Refatoração sem alterar comportamento
- ✅ test: Testes
- 🔧 chore: Manutenção, configs, tarefas internas
- ⚡ perf: Performance
- 🎡 ci: Integração contínua
- 🏗️ build: Build, dependências ou bundler
- 💄 style: Estilo visual (sem lógica)

### 🧾 CORPO DO COMMIT
Se o diff envolver múltiplos arquivos ou lógica não trivial, gere um corpo seguindo:
- Estrutura: <emoji> <tipo>(<escopo>): <título curto> [linha em branco] - <arquivo>: descrição técnica.
- Liste os arquivos ou módulos impactados.
- Descreva O QUÊ foi feito e o PORQUÊ técnico.
- Utilize frases curtas, objetivas e técnicas.
- **PROIBIDO**: Termos genéricos como "ajuste" ou "melhoria".
- **PROIBIDO**: Repetir o título no corpo.

Responda APENAS com o texto final da mensagem, sem markdown e sem nenhuma palavra adicional.
`;

function getStagedDiff(): string | null {
    try {
        const diff = execSync("git diff --staged").toString().trim();
        return diff || null;
    } catch {
        return null;
    }
}

async function getCommitSuggestion(apiKey: string, diff: string): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_INSTRUCTIONS
    });

    const prompt = `Gere a mensagem de commit para o seguinte diff (limite de 5000 chars):\n\n${diff.substring(0, 5000)}`;
    const result = await model.generateContent(prompt);

    return result.response.text().trim();
}

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error(chalk.red("❌ Erro: GEMINI_API_KEY não encontrada nas variáveis de ambiente. Certifique-se de configurar no .bashrc ou .env"));
        process.exit(1);
    }

    let projectName = "";
    try {
        const gitConfig = execSync("git config --get remote.origin.url").toString();
        projectName = gitConfig.split("/").pop()?.split(".")[0] || "Projeto Local";
    } catch (error) {
        projectName = "Projeto Local";
    }

    const diff = getStagedDiff();
    if (!diff) {
        console.log(chalk.yellow("⚠️ Nenhuma alteração detectada no stage. Use 'git add' primeiro."));
        return;
    }

    console.log(chalk.blue(`🚀 Analisando alterações em [${projectName}]...`));
    console.log(chalk.cyan("🤖 Consultando o Gemini para gerar a mensagem de commit..."));

    try {
        const commitMessage = await getCommitSuggestion(apiKey, diff);

        console.log(chalk.gray("\n--- Sugestão do Gemini ---"));
        console.log(chalk.white(commitMessage));
        console.log(chalk.gray("--------------------------\n"));

        const { confirm } = await prompts({
            type: "toggle",
            name: "confirm",
            message: "Deseja realizar o commit com esta mensagem?",
            initial: true,
            active: "Sim",
            inactive: "Não"
        });

        if (confirm) {
            execFileSync("git", ["commit", "-m", commitMessage], { stdio: "inherit" });
            console.log(chalk.bold.green("✅ Commit realizado com sucesso!"));
        } else {
            console.log(chalk.yellow("Commit cancelado. Você pode editar os arquivos ou tentar novamente."));
        }

    } catch (error) {
        console.error(chalk.red("❌ Erro ao conectar com o Gemini ou processar o diff:"), error);
    }
}

main();
