#!/usr/bin/env pwsh

# ============================================================================
# Script de Release - JFileBrowser VS Code Extension
# Faz checagem, compilação, teste e gera nova versão automaticamente
# ============================================================================

# Cores para output
$ErrorActionPreference = "Stop"

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Success {
    param([string]$Message)
    Write-ColorOutput "✅ $Message" "Green"
}

function Write-Error {
    param([string]$Message)
    Write-ColorOutput "❌ $Message" "Red"
}

function Write-Warning {
    param([string]$Message)
    Write-ColorOutput "⚠️  $Message" "Yellow"
}

function Write-Info {
    param([string]$Message)
    Write-ColorOutput "ℹ️  $Message" "Cyan"
}

function Write-Step {
    param([string]$Message)
    Write-ColorOutput "`n🔄 $Message" "Magenta"
}

# ============================================================================
# FUNÇÕES DE CHECAGEM
# ============================================================================

function Test-NodeInstalled {
    Write-Step "Verificando Node.js..."
    try {
        $nodeVersion = node --version
        Write-Success "Node.js instalado: $nodeVersion"
        return $true
    } catch {
        Write-Error "Node.js não está instalado ou não está no PATH"
        return $false
    }
}

function Test-NpmInstalled {
    Write-Step "Verificando npm..."
    try {
        $npmVersion = npm --version
        Write-Success "npm instalado: $npmVersion"
        return $true
    } catch {
        Write-Error "npm não está instalado ou não está no PATH"
        return $false
    }
}

function Test-VsceInstalled {
    Write-Step "Verificando vsce..."
    try {
        $vsceVersion = vsce --version
        Write-Success "vsce instalado: $vsceVersion"
        return $true
    } catch {
        Write-Warning "vsce não está instalado"
        Write-Info "Instalando vsce..."
        try {
            npm install -g @vscode/vsce
            Write-Success "vsce instalado com sucesso"
            return $true
        } catch {
            Write-Error "Falha ao instalar vsce"
            return $false
        }
    }
}

function Test-RequiredFiles {
    Write-Step "Verificando arquivos necessários..."

    $requiredFiles = @(
        "package.json",
        "tsconfig.json",
        "src/extension.ts",
        "src/jFileBrowserProvider.ts",
        "src/gitignoreParser.ts",
        "media/webview.js",
        "media/styles.css"
    )

    $allExist = $true
    foreach ($file in $requiredFiles) {
        if (Test-Path $file) {
            Write-Success "Encontrado: $file"
        } else {
            Write-Error "Faltando: $file"
            $allExist = $false
        }
    }

    return $allExist
}

function Test-Dependencies {
    Write-Step "Verificando dependências..."

    if (-not (Test-Path "node_modules")) {
        Write-Info "node_modules não encontrado. Instalando dependências..."
        try {
            npm install
            Write-Success "Dependências instaladas"
        } catch {
            Write-Error "Falha ao instalar dependências"
            return $false
        }
    } else {
        Write-Success "Dependências já instaladas"
    }

    return $true
}

function Test-TypeScriptCompilation {
    Write-Step "Testando compilação TypeScript..."

    try {
        $output = npm run compile 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "TypeScript compilado sem erros"
            return $true
        } else {
            Write-Error "Erros de compilação TypeScript:"
            Write-Host $output
            return $false
        }
    } catch {
        Write-Error "Erro ao compilar TypeScript"
        return $false
    }
}

# ============================================================================
# FUNÇÕES DE VERSÃO
# ============================================================================

function Get-CurrentVersion {
    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    return $packageJson.version
}

function Increment-Version {
    param([string]$CurrentVersion)

    $parts = $CurrentVersion.Split('.')
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]

    $patch++
    if ($patch -gt 9) {
        $patch = 0
        $minor++
    }

    if ($minor -gt 9) {
        $minor = 0
        $major++
    }

    return "$major.$minor.$patch"
}

function Update-Version {
    param([string]$NewVersion)

    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    $packageJson.version = $NewVersion

    $packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json"
    Write-Success "Versão atualizada para $NewVersion"
}

# ============================================================================
# FUNÇÕES DE COMPILAÇÃO E PACOTE
# ============================================================================

function Invoke-Compile {
    Write-Step "Compilando TypeScript..."

    try {
        $output = npm run compile 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Compilação concluída"
            return $true
        } else {
            Write-Error "Erros na compilação:"
            Write-Host $output
            return $false
        }
    } catch {
        Write-Error "Erro ao compilar"
        return $false
    }
}

function Invoke-RunTests {
    Write-Step "Executando testes..."

    # Verifica se existe script de teste
    $packageJson = Get-Content "package.json" | ConvertFrom-Json

    if ($packageJson.scripts.PSObject.Properties.Name -contains "test") {
        try {
            $output = npm test 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Testes passaram"
                return $true
            } else {
                Write-Warning "Alguns testes falharam:"
                Write-Host $output
                return $false
            }
        } catch {
            Write-Error "Erro ao executar testes"
            return $false
        }
    } else {
        Write-Info "Nenhum script de teste encontrado, pulando..."
        return $true
    }
}

function Invoke-CreatePackage {
    Write-Step "Criando pacote VSIX..."

    try {
        $output = vsce package --allow-missing-repository 2>&1
        if ($LASTEXITCODE -eq 0) {
            # Extrair nome do arquivo do output
            if ($output -match "jfilebrowser-([\d.]+)\.vsix") {
                $vsixFile = "jfilebrowser-$($Matches[1]).vsix"
                Write-Success "Pacote criado: $vsixFile"

                # Verificar se o arquivo existe
                if (Test-Path $vsixFile) {
                    $fileSize = (Get-Item $vsixFile).Length / 1KB
                    Write-Info "Tamanho: $([math]::Round($fileSize, 2)) KB"
                }
            }
            return $true
        } else {
            Write-Error "Erro ao criar pacote:"
            Write-Host $output
            return $false
        }
    } catch {
        Write-Error "Exceção ao criar pacote"
        return $false
    }
}

# ============================================================================
# FUNÇÕES DE LIMPEZA
# ============================================================================

function Invoke-Cleanup {
    Write-Step "Limpando arquivos temporários..."

    # Remove pasta out se existir
    if (Test-Path "out") {
        Remove-Item -Recurse -Force "out"
        Write-Success "Pasta 'out' removida"
    }

    # Remove arquivos .vsix antigos (opcional)
    $oldVsixFiles = Get-ChildItem -Filter "*.vsix" | Where-Object { $_.Name -ne "jfilebrowser-$NewVersion.vsix" }
    if ($oldVsixFiles) {
        Write-Info "Encontrados $($oldVsixFiles.Count) pacote(s) antigo(s)"
        # Não remove por segurança, apenas informa
    }
}

# ============================================================================
# RELATÓRIO FINAL
# ============================================================================

function Show-Report {
    param(
        [string]$OldVersion,
        [string]$NewVersion,
        [bool]$Success
    )

    Write-Host "`n" -NoNewline
    Write-Host "=" * 60 -ForegroundColor Cyan
    Write-Host "`n📦 RELATÓRIO DE RELEASE - JFileBrowser` -ForegroundColor Magenta
    Write-Host "`n" -NoNewline
    Write-Host "=" * 60 -ForegroundColor Cyan

    if ($Success) {
        Write-Host "`n✅ Release criado com sucesso!`n" -ForegroundColor Green

        Write-Host "Detalhes:" -ForegroundColor White
        Write-Host "  Versão anterior: $OldVersion" -ForegroundColor Gray
        Write-Host "  Nova versão:     $NewVersion" -ForegroundColor Green
        Write-Host "  Arquivo:         jfilebrowser-$NewVersion.vsix" -ForegroundColor Cyan

        Write-Host "`nComandos para instalar:" -ForegroundColor White
        Write-Host "  code --install-extension jfilebrowser-$NewVersion.vsix`n" -ForegroundColor Yellow
    } else {
        Write-Host "`n❌ Release falhou`n" -ForegroundColor Red
        Write-Host "Por favor, corrija os erros acima e tente novamente.`n" -ForegroundColor Yellow
    }
}

# ============================================================================
# SCRIPT PRINCIPAL
# ============================================================================

function Invoke-Release {
    Write-Host "`n" -NoNewline
    Write-Host "=" * 60 -ForegroundColor Cyan
    Write-Host "`n🚀 SCRIPT DE RELEASE - JFileBrowser Extension" -ForegroundColor Magenta
    Write-Host "`n" -NoNewline
    Write-Host "=" * 60 -ForegroundColor Cyan

    $scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
    Set-Location $scriptPath

    # Fase 1: Verificações
    Write-Host "`n📋 FASE 1: VERIFICAÇÕES" -ForegroundColor Cyan

    $checks = @(
        { Name = "Node.js"; Test = { Test-NodeInstalled } },
        { Name = "npm"; Test = { Test-NpmInstalled } },
        { Name = "vsce"; Test = { Test-VsceInstalled } },
        { Name = "Arquivos"; Test = { Test-RequiredFiles } },
        { Name = "Dependências"; Test = { Test-Dependencies } }
    )

    $allChecksPass = $true
    foreach ($check in $checks) {
        if (-not (& $check.Test)) {
            Write-Error "Falha na verificação: $($check.Name)"
            $allChecksPass = $false
        }
    }

    if (-not $allChecksPass) {
        Write-Host "`n❌ Verificações falharam. Abortando.`n" -ForegroundColor Red
        return $false
    }

    # Fase 2: Compilação de teste
    Write-Host "`n🔨 FASE 2: COMPILAÇÃO DE TESTE" -ForegroundColor Cyan

    if (-not (Test-TypeScriptCompilation)) {
        Write-Host "`n❌ Compilação falhou. Abortando.`n" -ForegroundColor Red
        return $false
    }

    # Fase 3: Atualização de versão
    Write-Host "`n📌 FASE 3: ATUALIZAÇÃO DE VERSÃO" -ForegroundColor Cyan

    $currentVersion = Get-CurrentVersion
    Write-Info "Versão atual: $currentVersion"

    $newVersion = Increment-Version $currentVersion
    Write-Info "Nova versão:  $newVersion"

    Update-Version $newVersion
    $global:NewVersion = $newVersion

    # Fase 4: Compilação final
    Write-Host "`n🔨 FASE 4: COMPILAÇÃO FINAL" -ForegroundColor Cyan

    if (-not (Invoke-Compile)) {
        Write-Host "`n❌ Compilação falhou. Abortando.`n" -ForegroundColor Red
        return $false
    }

    # Fase 5: Testes
    Write-Host "`n🧪 FASE 5: TESTES" -ForegroundColor Cyan

    $testsPass = Invoke-RunTests

    # Fase 6: Criação do pacote
    Write-Host "`n📦 FASE 6: CRIAÇÃO DO PACOTE" -ForegroundColor Cyan

    if (-not (Invoke-CreatePackage)) {
        Write-Host "`n❌ Criação do pacote falhou. Abortando.`n" -ForegroundColor Red
        return $false
    }

    # Relatório final
    Show-Report -OldVersion $currentVersion -NewVersion $newVersion -Success $true

    return $true
}

# Executar script principal
try {
    $success = Invoke-Release
    exit $(if ($success) { 0 } else { 1 })
} catch {
    Write-Error "Erro inesperado: $($_.ToString())"
    exit 1
}
