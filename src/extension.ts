import * as vscode from 'vscode';
import { JFileBrowserProvider } from './jFileBrowserProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('JFileBrowser extension is now active');

    const provider = new JFileBrowserProvider(context.extensionUri);
    const focusSearchCommand = vscode.commands.registerCommand('jfilebrowser.focusSearch', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.jfilebrowserContainer');

        try {
            await vscode.commands.executeCommand('jfilebrowser.focus');
        } catch {
        }

        provider.focusSearch();
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('jfilebrowser', provider),
        focusSearchCommand
    );
}

export function deactivate() {}
