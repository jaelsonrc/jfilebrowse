# Estrutura do Projeto JFileBrowser

Este documento descreve a organização atual do projeto e as configurações de build.

## 📁 Estrutura de Diretórios

```
jfilebrowse/
│
├── src/                          # CÓDIGO FONTE (TypeScript)
│   ├── extension.ts              # Entry point da extensão
│   ├── jFileBrowserProvider.ts   # Provedor principal do webview
│   ├── workspaceTreeProvider.ts  # Gerenciador da árvore
│   ├── workspaceNode.ts          # Model de nós da árvore
│   ├── searchManager.ts          # Lógica de busca com debounce
│   └── gitignoreParser.ts        # Parser de arquivos .gitignore
│
├── media/                        # RECURSOS ESTÁTICOS
│   ├── logo.svg                  # Ícone da activity bar
│   ├── styles.css                # Estilos CSS do webview
│   └── webview.js                # JavaScript do webview
│
├── scripts/                      # SCRIPTS DE BUILD/RELEASE
│   ├── release.js                # Script Node.js (multi-plataforma)
│   └── release.ps1               # Script PowerShell (Windows)
│
├── out/                          # BUILD OUTPUT (GERADO AUTOMATICAMENTE)
│   └── **/*.js, **/*.js.map      # Arquivos compilados do TypeScript
│
├── .vscode/                      # CONFIGURAÇÕES DO VS CODE
│   ├── launch.json               # Configurações de debug
│   ├── tasks.json                # Tasks de build
│   ├── settings.json             # Settings do workspace
│   └── extensions.json           # Extensões recomendadas
│
├── .git/                         # REPOSITÓRIO GIT
├── node_modules/                 # DEPENDÊNCIAS NPM (GERADO)
│
├── package.json                  # MANIFESTO DA EXTENSÃO
├── package-lock.json             # LOCK FILE DO NPM
├── tsconfig.json                 # CONFIGURAÇÃO DO TYPESCRIPT
│
├── .gitignore                    # ARQUIVOS IGNORADOS PELO GIT
├── .vscodeignore                 # ARQUIVOS IGNORADOS NO PACOTE VSIX
│
├── README.md                     # DOCUMENTAÇÃO PRINCIPAL
├── CHANGELOG.md                  # HISTÓRICO DE MUDANÇAS
├── SCRIPTS.md                    # DOCUMENTAÇÃO DOS SCRIPTS
├── PROJECT_STRUCTURE.md          # ESTE ARQUIVO
│
├── LICENSE.md                    # LICENÇA MIT
└── release.bat                   # ATALHO PARA O SCRIPT DE RELEASE
```

## 🔧 Configuração de Build

### TypeScript → JavaScript

**Entrada:** `src/` (TypeScript)
**Saída:** `out/` (JavaScript + Source Maps)

**Comando:**
```bash
npm run compile
```

**Watch mode:**
```bash
npm run watch
```

### Empacotamento (.vsix)

**Entrada:** Arquivos compilados + recursos
**Saída:** `jfilebrowser-X.X.X.vsix` (na raiz)

**Comando:**
```bash
npm run release
```

## 📦 Arquivos Incluídos no Pacote .vsix

O arquivo `.vscodeignore` controla o que entra no pacote:

### ✅ INCLUÍDOS:
- `out/` - Código JavaScript compilado
- `media/` - Recursos estáticos (logo, CSS, JS)
- `package.json` - Manifesto
- `README.md` - Documentação

### ❌ EXCLUÍDOS:
- `src/` - Código fonte TypeScript
- `node_modules/` - Dependências de desenvolvimento
- `.git/` - Controle de versão
- `.vscode/` - Configurações de desenvolvimento
- `scripts/` - Scripts de build
- `*.ts, *.map` - Arquivos TypeScript e source maps
- `out/**/*.map` - Source maps (opcional, pode ser incluído para debug)

## 🎯 Fluxo de Desenvolvimento

### 1. Desenvolvimento
```bash
# Terminal 1: Watch mode
npm run watch

# VS Code: Pressione F5 para debug
```

### 2. Testes
- Abra o Extension Development Host (F5)
- Teste a funcionalidade
- Verifique o console para erros

### 3. Build
```bash
npm run compile
```

### 4. Release
```bash
npm run release
```

Isso cria `jfilebrowser-X.X.X.vsix` na raiz do projeto.

## 📋 Controle de Versão

### O que está no Git:
- ✅ Código fonte em `src/`
- ✅ Recursos em `media/`
- ✅ Scripts em `scripts/`
- ✅ Configurações (`.vscode/`, `tsconfig.json`, etc.)
- ✅ Documentação (`.md`)
- ✅ `.gitignore`, `.vscodeignore`

### O que NÃO está no Git:
- ❌ `out/` - Build output (regenerado sempre)
- ❌ `node_modules/` - Dependências (regenerado com npm install)
- ❌ `*.vsix` - Pacotes de release (regenerado com npm run release)
- ❌ Arquivos do sistema (`.DS_Store`, `Thumbs.db`)

## 🚀 Publicação

### Instalar Localmente
```bash
code --install-extension jfilebrowser-X.X.X.vsix
```

### Publicar no Marketplace
```bash
# Primeiro, criar o Personal Access Token no VS Code Marketplace
# Depois:
vsce publish
```

## 📝 Próximos Passos

1. **Testar** - Execute `npm run compile` e pressione F5
2. **Desenvolver** - Faça suas alterações em `src/`
3. **Commit** - Commit apenas o código fonte
4. **Release** - Execute `npm run release` quando pronto

## 🔗 Arquivos Importantes

| Arquivo | Propósito |
|---------|-----------|
| [package.json](package.json) | Manifesto da extensão, dependências, scripts |
| [tsconfig.json](tsconfig.json) | Configuração do compilador TypeScript |
| [.gitignore](.gitignore) | Arquivos ignorados pelo Git |
| [.vscodeignore](.vscodeignore) | Arquivos ignorados no pacote .vsix |
| [README.md](README.md) | Documentação principal |
| [CHANGELOG.md](CHANGELOG.md) | Histórico de versões |
| [SCRIPTS.md](SCRIPTS.md) | Documentação dos scripts de build |
