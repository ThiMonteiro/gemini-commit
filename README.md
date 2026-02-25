# 🚀 Gemini Commit (gcommit)

**Automatize suas mensagens de commit usando o poder do Google Gemini 2.5 Flash.**

O `gemini-commit` (ou comando `gcommit`) é uma ferramenta CLI (Command Line Interface) projetada para analisar as alterações locais no seu repositório Git usando `git diff --staged` e gerar mensagens de commit precisas, padronizadas pelo [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), totalmente em **Português Brasileiro (pt-BR)**.

---

## ✨ Recursos

- 🤖 **Inteligência Artificial:** Utiliza a API rápida e acessível do `gemini-2.5-flash` do Google.
- 📦 **Padrão Semântico:** Criação de títulos seguindo à risca a especificação dos Conventional Commits (com emojis apropriados).
- 🧾 **Descrições Detalhadas:** Gera automaticamente o *corpo* da mensagem de commit quando envolvem múltiplos arquivos ou mudanças não-triviais.
- 💬 **Revisão Interativa:** O CLI sempre perguntará se você deseja confirmar a sugestão antes de acionar o `git commit`.

---

## 🛠️ Como Instalar e Configurar

### 1. Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18+ recomendada)
- Git instalado e configurado na sua máquina
- Uma Chave de API do Google Gemini. Adquira a sua gratuitamente no [Google AI Studio](https://aistudio.google.com/).

### 2. Configurando a Chave de API

Para que a ferramenta funcione de qualquer lugar da sua máquina globalmente, defina sua chave de API nas variáveis do sistema.

**Para usuários de Linux/macOs (`bash` ou `zsh`):**

Abra o terminal e adicione a variável ao seu arquivo `.bashrc` ou `.zshrc`:
```bash
echo 'export GEMINI_API_KEY="SUA_CHAVE_AQUI_GERADA_NO_GOOGLE"' >> ~/.bashrc
# E recarregue a configuração (se usar zsh, altere o arquivo):
source ~/.bashrc
```

*Alternativa local:* Se preferir, você também pode criar um arquivo `.env` na raiz do projeto contendo `GEMINI_API_KEY=sua_chave`.

### 3. Instalação (Global)

Como o projeto está publicado localmente por você ou em um NPM, você pode linkar o repositório como pacote global para uso em qualquer pasta:

```bash
# Clone o repositório se ainda não o fez
git clone https://github.com/SeuUsuario/gemini-commit.git
cd gemini-commit

# Instale as dependências e faça build do projeto:
npm install
npm run build

# Linke o pacote globalmente usando o npm
npm link
```
*Agora o comando `gcommit` estará disponível no seu terminal.*

---

## 🚀 Como Usar

O uso do `gemini-commit` é incrivelmente simples.

1. Trabalhe em seu código normalmente.
2. Adicione as alterações que deseja commitar ao *staging area* utilizando o `git add`:

```bash
git add src/index.ts utils/helpers.js
```

3. Geração Automática! Execute o CLI em vez de usar `git commit`:

```bash
# Ou use npm run start se for rodar o código-fonte manualmente
gcommit 
```

### Exemplo de Fluxo

```text
🚀 Analisando alterações em [seu-projeto]...
🤖 Consultando o Gemini para gerar a mensagem de commit...

--- Sugestão do Gemini ---
✨ feat(cli): adiciona suporte ao idioma português

- src/index.ts: modifica instruções de sistema para forçar pt-BR nas respostas da API.
- README.md: adiciona documentação da CLI de comandos.
--------------------------

? Deseja realizar o commit com esta mensagem? › (Y/n)
```

Basta digitar `Y` e apertar Enter e o commit será finalizado com sucesso no seu histórico Git!

---

## ⚠️ Possíveis Erros e Soluções

- `"Nenhuma alteração detectada no stage. Use 'git add' primeiro."`
  **Solução:** O gemini-commit varre apenas arquivos dentro do pacote do `git add`. Lembre-se sempre do *stage*.
- `"GEMINI_API_KEY não encontrada nas variáveis de ambiente."`
  **Solução:** Você não exportou com sucesso a chave para as variáveis de terminal global do PC. Verifique o seu passo 2.

## 🤝 Contribuições

Este projeto foi construído para ajudar na qualidade do código através de commits semânticos perfeitos. Sinta-se à vontade para enviar *pull requests*, adicionar *issues* e melhorarmos essa ferramenta.

Data: 25/02/2026
Autor: Thiago
