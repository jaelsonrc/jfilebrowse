import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Represents a file or folder node in the workspace tree
 */
export class WorkspaceNode {
    private readonly _displayName: string;

    constructor(
        public readonly resourceUri: vscode.Uri,
        public readonly isDirectory: boolean,
        public readonly children: WorkspaceNode[] = []
    ) {
        this._displayName = this.getDisplayName();
    }

    private getDisplayName(): string {
        return path.basename(this.resourceUri.fsPath);
    }

    get displayName(): string {
        return this._displayName;
    }

    /**
     * Convert this node to a VS Code TreeItem
     */
    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            this.resourceUri,
            this.isDirectory
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        treeItem.id = this.resourceUri.toString();

        // Set command to open file on click
        if (!this.isDirectory) {
            treeItem.command = {
                command: 'workspaceExplorer.openFile',
                title: 'Open File',
                arguments: [this.resourceUri]
            };
        }

        // Use standard ThemeIcon which respects the user's active file icon theme
        treeItem.iconPath = this.isDirectory ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File;

        return treeItem;
    }

    /**
     * Check if this node matches the search term
     */
    matches(searchTerm: string): boolean {
        if (!searchTerm) {
            return true;
        }

        const name = this.displayName.toLowerCase();

        // Direct match in name
        if (name.includes(searchTerm)) {
            return true;
        }

        // If directory, check if any descendant matches
        if (this.isDirectory && this.children) {
            return this.children.some(child => this.matchesRecursive(searchTerm, child));
        }

        return false;
    }

    /**
     * Recursive helper for matching descendants
     */
    private matchesRecursive(searchTerm: string, node: WorkspaceNode): boolean {
        const name = node.displayName.toLowerCase();

        if (name.includes(searchTerm)) {
            return true;
        }

        if (node.isDirectory && node.children) {
            return node.children.some(child => this.matchesRecursive(searchTerm, child));
        }

        return false;
    }
}
