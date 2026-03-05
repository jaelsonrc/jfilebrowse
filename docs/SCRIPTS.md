# Scripts de Release - JFileBrowser

## 📋 Scripts Disponíveis

### 1. Script PowerShell (Windows) - RECOMENDADO

**Arquivo:** `scripts/release.ps1`

Script completo que faz **verificação, teste, compilação e gera nova versão** automaticamente.

**Como usar:**
```powershell
# Entrar na pasta do projeto
cd c:\Projetos\jfilebrowse

# Executar o script
.\scripts\release.ps1
```

**Ou com PowerShell:**
```powershell
cd c:\Projetos\jfilebrowse
pwsh -File scripts/release.ps1
```

**O que o script faz:**
- ✅ Verifica se Node.js, npm e vsce estão instalados
- ✅ Verifica se todos os arquivos necessários existem
- ✅ Instala dependências se necessário
- ✅ Testa compilação TypeScript
- ✅ Incrementa a versão automaticamente
- ✅ Compila TypeScript
- ✅ Executa testes (se houver)
- ✅ Cria pacote .vsix
- ✅ Gera relatório final

**Saída do script:**
```
============================================================
🚀 SCRIPT DE RELEASE - JFileBrowser Extension
============================================================

📋 FASE 1: VERIFICAÇÕES
🔄 Verificando Node.js...
✅ Node.js instalado: v20.x.x
...

✅ Release criado com sucesso!

Detalhes:
  Versão anterior: 0.2.8
  Nova versão:     0.2.9
  Arquivo:         jfilebrowser-0.2.9.vsix
```

---

### 2. Script Node.js (Multi-plataforma)

**Arquivo:** `scripts/release.js`

**Como usar:**
```bash
cd c:/Projetos/jfilebrowse
npm run release
```

**O que o script faz:**
- ✅ Lê a versão atual do package.json
- ✅ Incrementa automaticamente a versão (patch version)
- ✅ Atualiza o package.json com a nova versão
- ✅ Compila TypeScript
- ✅ Cria pacote .vsix usando vsce

---

## 🛠️ Comandos npm Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run release` | Gera nova versão automaticamente (mesmo que package) |
| `npm run package` | Mesmo que release |
| `npm run compile` | Apenas compila TypeScript para pasta `out/` |
| `npm run watch` | Modo desenvolvimento (watch mode) |

---

## 📋 Fluxo de Release Completo

### Opção 1: Script PowerShell (Completo)
```powershell
cd c:\Projetos\jfilebrowse
.\scripts\release.ps1
```

### Opção 2: Script Node.js
```bash
cd c:\Projetos\jfilebrowse
npm run release
```

### Opção 3: Manual
```bash
cd c:\Projetos\jfilebrowse

# 1. Compilar
npm run compile

# 2. Criar pacote (versão manual)
vsce package --allow-missing-repository
```

---

## 📁 Estrutura de Build

### Entrada
- **Código fonte:** `src/` (TypeScript)
- **Configuração:** `tsconfig.json`

### Saída
- **Arquivos compilados:** `out/` (JavaScript + source maps)
- **Pacote final:** `jfilebrowser-X.X.X.vix` (na raiz)

### Arquivos incluídos no pacote .vsix
O arquivo `.vscodeignore` controla o que entra no pacote:
- ✅ **Inclui:** `out/`, `media/`, `package.json`, `README.md`
- ❌ **Exclui:** `src/`, `node_modules/`, `.git/`, scripts de dev

---

## ⚠️ Solução de Problemas

### PowerShell: "Execution Policy"
Se der erro de execução de scripts:
```powershell
# Temporariamente (sessão atual)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Ou executar assim:
pwsh -ExecutionPolicy Bypass -File scripts/release.ps1
```

### vsce não encontrado
```bash
npm install -g @vscode/vsce
```

### Erro de compilação TypeScript
```bash
# Limpar cache e reinstalar dependências
rm -rf node_modules out
npm install

# Recompilar
npm run compile
```

### Erro: "Cannot find module"
```bash
# Instalar dependências
npm install
```

---

## 🔧 Configuração de Build

### TypeScript (tsconfig.json)
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",           // Pasta de saída
    "rootDir": "src",          // Pasta de origem
    "sourceMap": true,         // Source maps para debug
    "strict": true             // Modo estrito
  }
}
```

### Package.json (scripts)
```json
{
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "release": "node scripts/release.js"
  }
}
```

---

## 📦 Após Release

O pacote `.vsix` será criado na raiz do projeto.

### Instalar localmente
```bash
code --install-extension jfilebrowser-X.X.X.vsix
```

### Pelo VS Code
1. `Ctrl+Shift+X` (Extensions)
2. `...` > "Install from VSIX..."
3. Selecione o arquivo `.vsix`

### Publicar no Marketplace
```bash
vsce publish
```

---

## 📝 Observações

- A versão é incrementada automaticamente no formato `MAJOR.MINOR.PATCH`
- O script incrementa apenas o **PATCH** (último número)
- Se precisar mudar versão major ou minor, edite `package.json` manualmente
- Source maps são incluídos para facilitar debug
- Arquivos na pasta `out/` não devem ser commitados no Git
