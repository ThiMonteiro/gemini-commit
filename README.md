# 🚀 Gemini Commit (gcommit)

**Automatize suas mensagens de commit usando o poder do Google Gemini 2.5 Flash.**

O `gemini-commit` (ou comando `gcommit`) é uma ferramenta CLI (Command Line Interface) projetada para analisar as alterações locais no seu repositório Git usando `git diff --staged` e gerar mensagens de commit precisas, padronizadas pelo [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), totalmente em **Português Brasileiro (pt-BR)**.

---

## ✨ Recursos

- 🤖 **Inteligência Artificial:** Utiliza a API rápida e acessível do `gemini-2.5-flash` do Google.
- 📦 **Padrão Semântico:** Criação de títulos seguindo à risca a especificação dos Conventional Commits (com emojis apropriados).
- 🧠 **Perfil de Estilo:** Aprende automaticamente com o seu histórico de commits — vocabulário, escopos e tipos preferidos — e aplica esse estilo nas sugestões.
- 🗂️ **Agrupamento Inteligente:** Em vez de listar arquivo por arquivo, agrupa mudanças por propósito e exibe blocos temáticos como `[Interface]`, `[Assets]` e `[Config]`.
- 🔀 **Dois modos de commit:** Escolha entre `--detailed` (agrupado, técnico) ou `--overview` (resumo de valor entregue).
- 💬 **Revisão Interativa:** O CLI sempre perguntará se você deseja confirmar, editar ou gerar uma nova sugestão antes de acionar o `git commit`.

---

## 🛠️ Como Instalar e Configurar

### 1. Pré-requisitos

- [Node.js](https://nodejs.org/) (versão 18+ recomendada)
- Git instalado e configurado na sua máquina
- Uma Chave de API do Google Gemini. Adquira a sua gratuitamente no [Google AI Studio](https://aistudio.google.com/).

### 2. Configurando a Chave de API

Para que a ferramenta funcione de qualquer lugar da sua máquina globalmente, defina sua chave de API nas variáveis do sistema.

**Para usuários de Linux/macOS (`bash` ou `zsh`):**

```bash
echo 'export GEMINI_API_KEY="SUA_CHAVE_AQUI_GERADA_NO_GOOGLE"' >> ~/.bashrc
# Recarregue a configuração (se usar zsh, altere o arquivo):
source ~/.bashrc
```

*Alternativa local:* Você também pode criar um arquivo `.env` na raiz do projeto contendo `GEMINI_API_KEY=sua_chave`.

### 3. Instalação (Global)

```bash
# Clone o repositório
git clone https://github.com/SeuUsuario/gemini-commit.git
cd gemini-commit

# Instale as dependências e faça o build:
npm install
npm run build

# Linke o pacote globalmente
npm link
```

*Agora o comando `gcommit` estará disponível no seu terminal.*

---

## 🏗️ Estrutura do Projeto

```
src/
├── index.ts               # Ponto de entrada — leitura de args e bootstrap
├── constants/
│   └── prompt.ts          # System instructions das duas modes (DETAILED e OVERVIEW)
├── core/
│   └── CommitEngine.ts    # Loop interativo, exibição e fluxo de decisão
├── services/
│   ├── gemini.ts          # Comunicação com a API Gemini + fallback local
│   └── styleProfile.ts    # Extração e cache do perfil de estilo do desenvolvedor
└── utils/
    └── git.ts             # Operações Git (diff, log, commit, push)
```

---

## 🚀 Como Usar

1. Trabalhe no seu código normalmente.
2. Adicione as alterações ao *staging area*:

```bash
git add src/index.ts utils/helpers.js
```

3. Execute o `gcommit` no lugar do `git commit`:

```bash
gcommit              # modo padrão (detailed)
gcommit --overview   # modo resumido
gcommit --detailed   # modo detalhado explícito
```

---

## 🔀 Modos de Commit

### `--detailed` (padrão)

Agrupa os arquivos modificados por propósito técnico e exibe blocos temáticos. Ideal para PRs, features maiores e refatorações onde o contexto técnico importa.

```
♻️ refactor(core): modulariza geração de commits

[Funcionalidade]
- src/services (2 arquivos): separa lógica de estilo e comunicação com Gemini

[Config]
- tsconfig.json: ajusta paths para nova estrutura de módulos
```

### `--overview`

Foca no valor entregue, sem mencionar arquivos. Ideal para o dia a dia, commits rápidos e situações onde o *o quê foi feito* importa mais do que *como foi feito*.

**Mudança única:**
```
✨ feat(auth): adiciona login com Google

Implementa autenticação OAuth2 via Google com persistência de sessão
e redirecionamento automático após o login.
```

**Mudanças distintas:**
```
🔧 chore(core): ajustes gerais na aplicação

- Corrige crash ao abrir modal em telas pequenas
- Adiciona validação de e-mail no formulário de cadastro
- Atualiza dependências do projeto para versões estáveis
```

---

## 🧠 Perfil de Estilo

Na primeira execução em um repositório, o `gcommit` analisa os últimos 20 commits do `git log` e extrai automaticamente:

- Seus **tipos preferidos** (`✨ feat`, `🐛 fix`, etc.)
- Os **escopos** que você costuma usar (`cli`, `core`, `ui`...)
- O **vocabulário recorrente** nos seus títulos

Esse perfil é salvo em `.gcommit-profile.json` na raiz do projeto e usado como contexto para o Gemini gerar sugestões no seu estilo. O cache é atualizado automaticamente sempre que novos commits são detectados — sem nenhuma ação manual.

> **Nota:** O arquivo `.gcommit-profile.json` é local e está no `.gitignore`. Cada desenvolvedor gera o seu próprio perfil com base no seu histórico.

---

## 💬 Fluxo Interativo

```text
🚀 Projeto: [meu-projeto]
📂 Arquivos staged: 3 · modo: detailed
🧠 Perfil de estilo carregado do cache.
🤖 Consultando o Gemini para gerar a mensagem de commit...

--- Sugestão ---
✨ feat(cli): adiciona dois modos de geração de commit

[Funcionalidade]
- src/services/gemini.ts: implementa seleção de system instruction por modo
- src/core/CommitEngine.ts: exibe modo ativo e repassa contexto ao serviço

[Config]
- src/constants/prompt.ts: adiciona instruções DETAILED e OVERVIEW separadas
----------------

? O que deseja fazer? ›
❯ ✅ Aceitar e Commitar
  🔄 Gerar nova sugestão
  ✏️  Editar mensagem
  ❌ Cancelar
```

---

## ⚠️ Possíveis Erros e Soluções

- **`"Use 'git add' primeiro."`**
  O `gcommit` analisa apenas arquivos no stage. Execute `git add` antes de rodar o comando.

- **`"GEMINI_API_KEY não encontrada."`**
  A variável de ambiente não foi exportada corretamente. Verifique o passo 2 da instalação.

- **`"Limite de requisições do Gemini atingido."`**
  A API retornou 429. O CLI tentará automaticamente até 3 vezes com backoff. Se persistir, aguarde alguns instantes.

- **`"Falha de rede ao contatar o Gemini."`**
  Verifique sua conexão, VPN ou proxy. O CLI usará um fallback local para gerar uma sugestão básica.

---

## 🤝 Contribuições

Sinta-se à vontade para enviar *pull requests*, abrir *issues* e sugerir melhorias.

Data: 25/02/2026
Autor: Thiago Monteiro