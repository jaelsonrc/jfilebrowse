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

            this.postActiveFile(vscode.window.activeTextEditor);
        } catch (error) {
            console.error('Error loading files:', error);
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
