import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface GitignoreRule {
    baseDir: string;
    pattern: string;
    isNegation: boolean;
}

export class GitignoreParser {
    private readonly rules: GitignoreRule[] = [];
    private initialized = false;
    private initPromise?: Promise<void>;

    private static readonly ALWAYS_IGNORED_NAMES = new Set([
        '.git',
        'node_modules'
    ]);

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        if (!this.initPromise) {
            this.initPromise = this.loadAllGitignores();
        }

        await this.initPromise;
        this.initialized = true;
    }

    private async loadAllGitignores(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const gitignoreFiles = await vscode.workspace.findFiles('**/.gitignore', '**/{node_modules,.git}/**');

        for (const gitignoreUri of gitignoreFiles) {
            await this.loadGitignoreFile(gitignoreUri.fsPath);
        }
    }

    private async loadGitignoreFile(gitignorePath: string): Promise<void> {
        const baseDir = path.dirname(gitignorePath);

        try {
            const content = await fs.promises.readFile(gitignorePath, 'utf-8');
            this.parseGitignore(content, baseDir);
        } catch {
            // Ignore unreadable .gitignore files
        }
    }

    private parseGitignore(content: string, baseDir: string): void {
        const lines = content.split('\n');

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) {
                continue;
            }

            const isNegation = line.startsWith('!');
            const pattern = isNegation ? line.substring(1) : line;

            if (!pattern) {
                continue;
            }

            this.rules.push({
                baseDir,
                pattern: pattern.replace(/\\/g, '/'),
                isNegation
            });
        }
    }

    isIgnored(filePath: string): boolean {
        const normalizedAbsolute = filePath.replace(/\\/g, '/').toLowerCase();
        const fileName = path.basename(filePath).toLowerCase();

        if (GitignoreParser.ALWAYS_IGNORED_NAMES.has(fileName)) {
            return true;
        }

        let ignored = false;

        for (const rule of this.rules) {
            const baseDir = rule.baseDir.replace(/\\/g, '/').toLowerCase();
            if (!normalizedAbsolute.startsWith(baseDir)) {
                continue;
            }

            const relativePath = normalizedAbsolute.slice(baseDir.length).replace(/^\//, '');
            if (!relativePath) {
                continue;
            }

            if (this.matchesRule(relativePath, rule.pattern.toLowerCase())) {
                ignored = !rule.isNegation;
            }
        }

        return ignored;
    }

    private matchesRule(relativePath: string, pattern: string): boolean {
        const normalizedPattern = pattern.startsWith('/') ? pattern.slice(1) : pattern;

        if (normalizedPattern.endsWith('/')) {
            const dirPattern = normalizedPattern.slice(0, -1);
            return relativePath === dirPattern || relativePath.startsWith(dirPattern + '/');
        }

        if (!normalizedPattern.includes('/')) {
            if (!normalizedPattern.includes('*') && !normalizedPattern.includes('?')) {
                const segments = relativePath.split('/');
                return segments.includes(normalizedPattern);
            }

            const segmentRegex = this.patternToRegex(normalizedPattern);
            const segments = relativePath.split('/');
            return segments.some(segment => segmentRegex.test(segment));
        }

        const fullRegex = this.patternToRegex(normalizedPattern);
        return fullRegex.test(relativePath);
    }

    private patternToRegex(pattern: string): RegExp {
        const escaped = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');

        return new RegExp(`^${escaped}$`);
    }
}
