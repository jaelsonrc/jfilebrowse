import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceNode } from './workspaceNode';

/**
 * Tree data provider for workspace file browser
 */
export class WorkspaceTreeProvider implements vscode.TreeDataProvider<WorkspaceNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<WorkspaceNode | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private rootNodes: WorkspaceNode[] = [];
    private _searchTerm: string = '';

    constructor() {
        this.refresh();
    }

    /**
     * Set the search term for filtering
     */
    setSearchTerm(term: string): void {
        this._searchTerm = term;
        this.refresh();
    }

    /**
     * Get the TreeItem for a node
     */
    getTreeItem(element: WorkspaceNode): vscode.TreeItem {
        return element.getTreeItem();
    }

    /**
     * Get children of a node
     */
    async getChildren(element?: WorkspaceNode): Promise<WorkspaceNode[]> {
        if (!element) {
            // Return root level items
            return this.getFilteredNodes(this.rootNodes);
        }

        // Read directory and return children
        const children = await this.readDirectory(element.resourceUri);
        return this.getFilteredNodes(children);
    }

    /**
     * Refresh the tree
     */
    async refresh(): Promise<void> {
        await this.loadRootNodes();
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Load root nodes from workspace folders
     */
    private async loadRootNodes(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.rootNodes = [];
            return;
        }

        this.rootNodes = workspaceFolders.map(folder =>
            new WorkspaceNode(folder.uri, true)
        );
    }

    /**
     * Read directory contents
     */
    private async readDirectory(uri: vscode.Uri): Promise<WorkspaceNode[]> {
        try {
            const entries = await vscode.workspace.fs.readDirectory(uri);
            const nodes: WorkspaceNode[] = [];

            for (const [name, type] of entries) {
                // Skip hidden files and directories
                if (this.shouldIgnore(name)) {
                    continue;
                }

                const childUri = vscode.Uri.joinPath(uri, name);
                const isDirectory = type === vscode.FileType.Directory;

                nodes.push(new WorkspaceNode(childUri, isDirectory));
            }

            // Sort: directories first, then files, both alphabetically
            return this.sortNodes(nodes);
        } catch (error) {
            console.error(`Error reading directory: ${uri.fsPath}`, error);
            return [];
        }
    }

    /**
     * Filter nodes based on search term
     */
    private getFilteredNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
        if (!this._searchTerm) {
            return nodes;
        }

        return nodes.filter(node => node.matches(this._searchTerm));
    }

    /**
     * Check if a file/directory should be ignored
     */
    private shouldIgnore(name: string): boolean {
        const ignoredPatterns = [
            '.git',
            '.DS_Store',
            'node_modules',
            '.vscode',
            '.vscode-test',
            'out',
            'dist',
            'build',
        ];

        // Check if starts with dot (hidden file)
        if (name.startsWith('.')) {
            return true;
        }

        // Check against ignored patterns
        return ignoredPatterns.some(pattern => name === pattern);
    }

    /**
     * Sort nodes: directories first, then files, both alphabetically
     */
    private sortNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
        return nodes.sort((a, b) => {
            // Directories come first
            if (a.isDirectory && !b.isDirectory) {
                return -1;
            }
            if (!a.isDirectory && b.isDirectory) {
                return 1;
            }

            // Then sort alphabetically
            return a.displayName.localeCompare(b.displayName);
        });
    }
}
