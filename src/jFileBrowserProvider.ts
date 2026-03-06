import * as vscode from 'vscode';
import * as path from 'path';
import { GitignoreParser } from './gitignoreParser';

interface TreeNode {
    name: string;
    uri: string;
    path: string;
    type: 'file' | 'folder';
    children?: TreeNode[];
}

interface FlatEntry {
    id: string;
    uri: string;
    name: string;
    path: string;
    dir: string;
    type: 'file' | 'folder';
    searchKey: string;
}

export class JFileBrowserProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'jfilebrowser';

    private _view?: vscode.WebviewView;
    private _pendingFocusSearch = false;
    private _compareSourceUri?: vscode.Uri;
    private gitignoreParser: GitignoreParser;
    private _entryIdCounter = 0;
    private _activeEditorListener?: vscode.Disposable;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this.gitignoreParser = new GitignoreParser();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'openFile':
                    await this.openFile(data.uri);
                    break;
                case 'contextAction':
                    await this.handleContextAction(data);
                    break;
                case 'ready':
                    await this.loadAllFiles();
                    if (this._pendingFocusSearch) {
                        this._view?.webview.postMessage({ type: 'focusSearch' });
                        this._pendingFocusSearch = false;
                    }
                    break;
            }
        });

        this._activeEditorListener?.dispose();
        this._activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
            this.postActiveFile(editor);
        });

        webviewView.onDidDispose(() => {
            this._activeEditorListener?.dispose();
            this._activeEditorListener = undefined;
        });
    }

    private async openFile(uri: string) {
        try {
            const fileUri = vscode.Uri.parse(uri);
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${error}`);
        }
    }

    private async loadAllFiles() {
        try {
            await this.gitignoreParser.initialize();
            const { tree, flatEntries } = await this.scanWorkspace();

            this._view?.webview.postMessage({
                type: 'fileTree',
                tree: tree,
                flatFiles: flatEntries
            });

            this.postCompareSourceState();
            this.postActiveFile(vscode.window.activeTextEditor);
        } catch (error) {
            console.error('Error loading files:', error);
        }
    }

    private async handleContextAction(data: {
        action?: string;
        uri?: string;
        path?: string;
        entryType?: 'file' | 'folder';
    }) {
        if (!data.action || !data.uri || !data.entryType) {
            return;
        }

        const targetUri = vscode.Uri.parse(data.uri);

        try {
            switch (data.action) {
                case 'open':
                    await this.openUri(targetUri);
                    break;
                case 'openToSide':
                    await this.openUri(targetUri, vscode.ViewColumn.Beside);
                    break;
                case 'revealInOs':
                    await this.revealInOs(targetUri);
                    break;
                case 'revealInExplorer':
                    await vscode.commands.executeCommand('revealInExplorer', targetUri);
                    break;
                case 'openInTerminal':
                    this.openInTerminal(targetUri, data.entryType);
                    break;
                case 'copyPath':
                    await vscode.env.clipboard.writeText(targetUri.fsPath);
                    break;
                case 'copyRelativePath':
                    await vscode.env.clipboard.writeText(data.path || this.getRelativePath(targetUri));
                    break;
                case 'rename':
                    await this.renameEntry(targetUri);
                    await this.loadAllFiles();
                    break;
                case 'duplicate':
                    await this.duplicateEntry(targetUri, data.entryType);
                    await this.loadAllFiles();
                    break;
                case 'delete':
                    await this.deleteEntry(targetUri, data.entryType);
                    await this.loadAllFiles();
                    break;
                case 'selectForCompare':
                    this._compareSourceUri = targetUri;
                    this.postCompareSourceState();
                    vscode.window.setStatusBarMessage(`Selected for compare: ${path.basename(targetUri.fsPath)}`, 2500);
                    break;
                case 'compareWithSelected':
                    await this.compareWithSelected(targetUri);
                    break;
                case 'clearCompareSelection':
                    this._compareSourceUri = undefined;
                    this.postCompareSourceState();
                    break;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`JFileBrowser: ${message}`);
        }
    }

    private postActiveFile(editor?: vscode.TextEditor) {
        const uri = editor?.document.uri;
        if (uri?.scheme !== 'file') {
            this._view?.webview.postMessage({
                type: 'activeFileChanged',
                uri: undefined
            });
            return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder || this.gitignoreParser.isIgnored(uri.fsPath)) {
            this._view?.webview.postMessage({
                type: 'activeFileChanged',
                uri: undefined
            });
            return;
        }

        this._view?.webview.postMessage({
            type: 'activeFileChanged',
            uri: uri.toString()
        });
    }

    private postCompareSourceState() {
        this._view?.webview.postMessage({
            type: 'compareSourceChanged',
            uri: this._compareSourceUri?.toString()
        });
    }

    private async scanWorkspace(): Promise<{ tree: TreeNode[]; flatEntries: FlatEntry[] }> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return { tree: [], flatEntries: [] };
        }

        const tree: TreeNode[] = [];
        const flatEntries: FlatEntry[] = [];

        for (const folder of workspaceFolders) {
            const children = await this.readDirectoryTree(folder.uri, flatEntries);
            tree.push(...children);
        }

        return {
            tree: this.sortNodes(tree),
            flatEntries: flatEntries.sort((a, b) => a.path.localeCompare(b.path))
        };
    }

    private async readDirectoryTree(uri: vscode.Uri, flatEntries: FlatEntry[]): Promise<TreeNode[]> {
        let entries: [string, vscode.FileType][];

        try {
            entries = await vscode.workspace.fs.readDirectory(uri);
        } catch (error) {
            console.error('Error reading directory:', uri.fsPath, error);
            return [];
        }

        const nodes: TreeNode[] = [];

        for (const [name, fileType] of entries) {
            const childUri = vscode.Uri.joinPath(uri, name);

            if (this.gitignoreParser.isIgnored(childUri.fsPath)) {
                continue;
            }

            const relativePath = this.getRelativePath(childUri).replace(/\\/g, '/');
            const type: 'file' | 'folder' = fileType === vscode.FileType.Directory ? 'folder' : 'file';
            const id = `entry-${++this._entryIdCounter}`;

            const node: TreeNode = {
                name,
                uri: childUri.toString(),
                path: relativePath,
                type
            };

            flatEntries.push({
                id,
                uri: childUri.toString(),
                name,
                path: relativePath,
                dir: path.posix.dirname(relativePath),
                type,
                searchKey: this.buildSearchKey(relativePath, childUri.fsPath, name)
            });

            if (type === 'folder') {
                node.children = await this.readDirectoryTree(childUri, flatEntries);
            }

            nodes.push(node);
        }

        return this.sortNodes(nodes);
    }

    private sortNodes(nodes: TreeNode[]): TreeNode[] {
        return nodes.sort((a, b) => {
            if (a.type === 'folder' && b.type === 'file') return -1;
            if (a.type === 'file' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });
    }

    private getRelativePath(uri: vscode.Uri): string {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
            return path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
        }
        return uri.fsPath;
    }

    private buildSearchKey(relativePath: string, absolutePath: string, name: string): string {
        const relSlash = relativePath.replace(/\\/g, '/').toLowerCase();
        const relBackslash = relSlash.replace(/\//g, '\\');
        const absBackslash = absolutePath.toLowerCase();
        const absSlash = absBackslash.replace(/\\/g, '/');
        const lowerName = name.toLowerCase();

        return `${relBackslash} ${relSlash} ${absBackslash} ${absSlash} ${lowerName}`;
    }

    public focusSearch(): void {
        this._pendingFocusSearch = true;

        if (this._view) {
            this._view.show(false);
            this._view.webview.postMessage({ type: 'focusSearch' });
            this._pendingFocusSearch = false;
        }
    }

    private async openUri(uri: vscode.Uri, viewColumn?: vscode.ViewColumn) {
        const stat = await vscode.workspace.fs.stat(uri);

        if (stat.type === vscode.FileType.Directory) {
            await vscode.commands.executeCommand('revealInExplorer', uri);
            return;
        }

        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, {
            preview: false,
            viewColumn
        });
    }

    private async revealInOs(uri: vscode.Uri) {
        try {
            await vscode.commands.executeCommand('revealFileInOS', uri);
        } catch {
            const target = await vscode.workspace.fs.stat(uri).then(stat =>
                stat.type === vscode.FileType.Directory ? uri : vscode.Uri.file(path.dirname(uri.fsPath))
            );
            await vscode.env.openExternal(target);
        }
    }

    private openInTerminal(uri: vscode.Uri, entryType: 'file' | 'folder') {
        const cwd = entryType === 'folder' ? uri.fsPath : path.dirname(uri.fsPath);
        const terminal = vscode.window.createTerminal({
            name: `JFileBrowser: ${path.basename(cwd) || cwd}`,
            cwd
        });

        terminal.show();
    }

    private async renameEntry(uri: vscode.Uri) {
        const currentName = path.basename(uri.fsPath);
        const parentUri = vscode.Uri.file(path.dirname(uri.fsPath));

        const nextName = await vscode.window.showInputBox({
            title: 'Rename',
            prompt: 'Enter a new name',
            value: currentName,
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Name is required.';
                }

                if (/[\\/]/.test(value)) {
                    return 'Name cannot contain path separators.';
                }

                return undefined;
            }
        });

        if (!nextName || nextName === currentName) {
            return;
        }

        const targetUri = vscode.Uri.joinPath(parentUri, nextName);
        if (await this.uriExists(targetUri)) {
            throw new Error(`'${nextName}' already exists.`);
        }

        await vscode.workspace.fs.rename(uri, targetUri, { overwrite: false });
    }

    private async duplicateEntry(uri: vscode.Uri, entryType: 'file' | 'folder') {
        const parentUri = vscode.Uri.file(path.dirname(uri.fsPath));
        const originalName = path.basename(uri.fsPath);
        const targetUri = await this.createUniqueDuplicateUri(parentUri, originalName, entryType);

        await vscode.workspace.fs.copy(uri, targetUri, { overwrite: false });
    }

    private async deleteEntry(uri: vscode.Uri, entryType: 'file' | 'folder') {
        const label = path.basename(uri.fsPath);
        const detail = entryType === 'folder'
            ? 'The folder will be moved to the recycle bin when available.'
            : 'The file will be moved to the recycle bin when available.';
        const confirmed = await vscode.window.showWarningMessage(
            `Delete '${label}'?`,
            {
                modal: true,
                detail
            },
            'Delete'
        );

        if (confirmed !== 'Delete') {
            return;
        }

        try {
            await vscode.workspace.fs.delete(uri, {
                recursive: entryType === 'folder',
                useTrash: true
            });
        } catch {
            await vscode.workspace.fs.delete(uri, {
                recursive: entryType === 'folder',
                useTrash: false
            });
        }
    }

    private async compareWithSelected(targetUri: vscode.Uri) {
        if (!this._compareSourceUri) {
            vscode.window.showWarningMessage('Select a file for compare first.');
            return;
        }

        if (this._compareSourceUri.toString() === targetUri.toString()) {
            vscode.window.showWarningMessage('Select a different file to compare.');
            return;
        }

        const left = this._compareSourceUri;
        const title = `${path.basename(left.fsPath)} ↔ ${path.basename(targetUri.fsPath)}`;
        await vscode.commands.executeCommand('vscode.diff', left, targetUri, title);
    }

    private async createUniqueDuplicateUri(
        parentUri: vscode.Uri,
        originalName: string,
        entryType: 'file' | 'folder'
    ): Promise<vscode.Uri> {
        const parsed = path.parse(originalName);
        const baseName = entryType === 'folder' ? originalName : parsed.name;
        const extension = entryType === 'folder' ? '' : parsed.ext;

        for (let index = 0; index < 1000; index++) {
            const suffix = index === 0 ? ' copy' : ` copy ${index + 1}`;
            const candidateName = `${baseName}${suffix}${extension}`;
            const candidateUri = vscode.Uri.joinPath(parentUri, candidateName);

            if (!(await this.uriExists(candidateUri))) {
                return candidateUri;
            }
        }

        throw new Error('Could not generate a duplicate name.');
    }

    private async uriExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.js')
        );

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JFileBrowser</title>
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div class="search-container">
        <svg class="search-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
        <input type="text" class="search-input" id="searchInput" placeholder="Search files..." autocomplete="off" spellcheck="false"/>
        <button class="search-clear" id="clearSearch" type="button" title="Clear search" aria-label="Clear search">×</button>
    </div>
    <div class="results-container" id="results">
        <div class="loading">Loading files...</div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
