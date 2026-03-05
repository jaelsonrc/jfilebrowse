const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Caminho para o package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');

// Ler package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Função para incrementar versão
function incrementVersion(version) {
    const parts = version.split('.').map(Number);

    // Incrementar patch version (último número)
    parts[2]++;

    // Se patch > 9, incrementa minor e reseta patch
    if (parts[2] > 9) {
        parts[2] = 0;
        parts[1]++;
    }

    // Se minor > 9, incrementa major e reseta minor
    if (parts[1] > 9) {
        parts[1] = 0;
        parts[0]++;
    }

    return parts.join('.');
}

// Incrementar versão
const currentVersion = packageJson.version;
const newVersion = incrementVersion(currentVersion);

console.log(`\n🚀 Preparando release ${currentVersion} → ${newVersion}\n`);

// Atualizar package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`✅ Versão atualizada para ${newVersion}`);

// Compilar TypeScript
console.log('\n📦 Compilando TypeScript...');
try {
    execSync('npm run compile', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    console.log('✅ TypeScript compilado');
} catch (error) {
    console.error('❌ Erro ao compilar TypeScript:', error.message);
    process.exit(1);
}

// Criar pacote VSIX
console.log('\n📦 Criando pacote VSIX...');
try {
    execSync('vsce package --allow-missing-repository', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    console.log(`\n✅ Versão ${newVersion} criada com sucesso!`);
    console.log(`📁 Arquivo: jfilebrowser-${newVersion}.vsix\n`);
} catch (error) {
    console.error('❌ Erro ao criar pacote:', error.message);
    process.exit(1);
}
