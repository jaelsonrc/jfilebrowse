# JFileBrowser

Uma extensão do VS Code que exibe os arquivos do workspace com uma busca integrada para filtrar por nomes de arquivos e pastas.

## 🎯 Funcionalidades

- ✅ **Nova Sidebar** com visualização em árvore de arquivos e pastas
- ✅ **Busca Integrada** - Filtra apenas por nomes de arquivos/pastas (não busca conteúdo)
- ✅ **Busca em Tempo Real** - Resultados atualizados enquanto você digita
- ✅ **Double-click** para abrir arquivos no editor
- ✅ **Ícones** para diferentes tipos de arquivo
- ✅ **Filtro Automático** - Ignora `.git`, `node_modules`, `.vscode`, etc.
- ✅ **Suporte a .gitignore** - Respeita as regras do seu arquivo .gitignore

## 🚀 Como Usar

### Instalação

#### Desenvolvimento
1. Abra este projeto no VS Code
2. Pressione **F5** para abrir o **Extension Development Host**
3. A extensão será carregada automaticamente

#### Produção
```bash
# Instalar o vsce globalmente (se ainda não tiver)
npm install -g @vscode/vsce

# Compilar e criar pacote
npm run compile
vsce package

# Instalar a extensão
code --install-extension jfilebrowser-*.vsix
```

### Atalhos

| Atalho | Ação |
|--------|------|
| `Ctrl+Alt+P` | Focar na busca do JFileBrowser |

### Usando a Busca

1. Clique no ícone do JFileBrowser na activity bar
2. Digite o nome do arquivo ou pasta que procura
3. A árvore será filtrada em tempo real mostrando apenas resultados correspondentes
4. Double-click em um arquivo para abri-lo no editor

## 📂 Estrutura do Projeto

```
jfilebrowse/
├── src/                          # Código fonte TypeScript
│   ├── extension.ts              # Entry point da extensão
│   ├── jFileBrowserProvider.ts   # Provedor principal do navegador
│   ├── workspaceTreeProvider.ts  # Gerenciador da árvore de arquivos
│   ├── workspaceNode.ts          # Nó da árvore (arquivo/pasta)
│   ├── searchManager.ts          # Gerenciador de busca com debounce
│   └── gitignoreParser.ts        # Parser de .gitignore
├── media/                        # Recursos estáticos
│   ├── logo.svg                  # Ícone da activity bar
│   ├── styles.css                # Estilos do webview
│   └── webview.js                # JavaScript do webview
├── scripts/                      # Scripts de build/release
│   ├── release.js                # Script Node.js para release
│   └── release.ps1               # Script PowerShell para release
├── docs/                         # Documentação adicional
│   ├── CHANGELOG.md              # Histórico de versões
│   ├── SCRIPTS.md                # Documentação dos scripts
│   └── PROJECT_STRUCTURE.md      # Estrutura detalhada
├── out/                          # Arquivos compilados (gerado automaticamente)
├── .vscode/                      # Configurações do VS Code
├── package.json                  # Manifesto da extensão
├── tsconfig.json                 # Configuração TypeScript
├── .gitignore                    # Arquivos ignorados pelo Git
├── .vscodeignore                 # Arquivos ignorados no pacote VSIX
└── README.md                     # Este arquivo
```

## 🔧 Desenvolvimento

### Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run compile` | Compila TypeScript para a pasta `out/` |
| `npm run watch` | Modo watch (recompila automaticamente) |
| `npm run release` | Cria nova versão e pacote .vsix |
| `npm run package` | Mesmo que release |

### Fluxo de Desenvolvimento

1. Faça suas alterações em `src/`
2. Execute `npm run compile` (ou `npm run watch`)
3. Pressione F5 para testar no Extension Development Host
4. Quando pronto, execute `npm run release` para criar o pacote

### Scripts de Release

#### Script PowerShell (Windows) - RECOMENDADO
```powershell
.\scripts\release.ps1
```

Este script:
- ✅ Verifica se Node.js, npm e vsce estão instalados
- ✅ Verifica se todos os arquivos necessários existem
- ✅ Instala dependências se necessário
- ✅ Testa compilação TypeScript
- ✅ Incrementa a versão automaticamente
- ✅ Compila TypeScript
- ✅ Cria pacote .vsix

#### Script Node.js (Multi-plataforma)
```bash
npm run release
```

## 📝 Características da Busca

- **Case-insensitive**: `Teste` encontra `teste.ts`, `TESTE.ts`, etc.
- **Match Parcial**: `test` encontra `myTestFile.ts`, `test-component.tsx`, etc.
- **Preserva Ancestrais**: Se um arquivo dentro de uma pasta combina, a pasta também é mostrada
- **Suporte a .gitignore**: Arquivos e pastas ignorados pelo .gitignore não aparecem na busca

## 🎨 Personalização

### Filtrar Mais Pastas/Arquivos

Edite `src/workspaceTreeProvider.ts` e adicione mais padrões à lista `ignoredPatterns`:

```typescript
const ignoredPatterns = [
    '.git',
    '.DS_Store',
    'node_modules',
    // Adicione mais aqui...
];
```

Ou use um arquivo `.gitignore` no seu projeto - a extensão respeitará suas regras.

## 🐛 Troubleshooting

### Extensão não aparece
1. Verifique se você tem um workspace aberto (não apenas um arquivo)
2. A sidebar só aparece quando `workspaceFolderCount > 0`
3. Verifique se o TypeScript foi compilado (`npm run compile`)

### Arquivos não são listados
1. Verifique o **Output** panel do VS Code (selecione "Extension Host")
2. Procure por mensagens de erro ou log

### Erro ao criar pacote .vsix
```bash
# Instale o vsce globalmente
npm install -g @vscode/vsce

# Depois tente novamente
npm run release
```

## 📦 Build e Publicação

### Criar uma Release
```bash
npm run release
```

O pacote `.vsix` será criado na raiz do projeto com o nome `jfilebrowser-VERSION.vsix`.

### Publicar no Marketplace
```bash
vsce publish
```

## 📖 Documentação Adicional

- **[CHANGELOG.md](docs/CHANGELOG.md)** - Histórico de versões e mudanças
- **[SCRIPTS.md](docs/SCRIPTS.md)** - Documentação completa dos scripts de build/release
- **[PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)** - Estrutura detalhada do projeto

## 📄 Licença

MIT

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues e pull requests.
