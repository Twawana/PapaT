import * as vscode from "vscode";
import { handleVscodeCommand, PapaTConnection } from "./connection";

let connection: PapaTConnection | null = null;
let statusBar: vscode.StatusBarItem | null = null;

export function activate(context: vscode.ExtensionContext): void {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBar);

  connection = new PapaTConnection(statusBar, (command) => {
    void handleVscodeCommand(command);
  });
  context.subscriptions.push({ dispose: () => connection?.disconnect() });

  context.subscriptions.push(
    vscode.commands.registerCommand("papat.connect", () => {
      connection?.connect();
    }),
    vscode.commands.registerCommand("papat.disconnect", () => {
      connection?.disconnect();
    }),
    vscode.commands.registerCommand("papat.showStatus", () => {
      const text = statusBar?.text ?? "PapaT";
      void vscode.window.showInformationMessage(text);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      connection?.sendStatus(editor?.document.uri.fsPath ?? null);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      connection?.sendStatus(vscode.window.activeTextEditor?.document.uri.fsPath ?? null);
    })
  );

  const autoConnect = vscode.workspace
    .getConfiguration("papat")
    .get<boolean>("autoConnect", true);

  if (autoConnect) {
    connection.connect();
  } else {
    statusBar.text = "PapaT: offline";
    statusBar.command = "papat.connect";
    statusBar.show();
  }
}

export function deactivate(): void {
  connection?.disconnect();
  connection = null;
  statusBar?.dispose();
  statusBar = null;
}
