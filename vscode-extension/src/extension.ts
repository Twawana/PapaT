import * as vscode from "vscode";
import { handleVscodeCommand, TitusConnection } from "./connection";

let connection: TitusConnection | null = null;
let statusBar: vscode.StatusBarItem | null = null;

function getExtensionConfig(): vscode.WorkspaceConfiguration {
  const titus = vscode.workspace.getConfiguration("titus");
  if (titus.get<string>("host") !== undefined || titus.get<number>("port") !== undefined) {
    return titus;
  }
  return vscode.workspace.getConfiguration("papat");
}

export function activate(context: vscode.ExtensionContext): void {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBar);

  connection = new TitusConnection(statusBar, (command) => {
    void handleVscodeCommand(command);
  });
  context.subscriptions.push({ dispose: () => connection?.disconnect() });

  context.subscriptions.push(
    vscode.commands.registerCommand("titus.connect", () => {
      connection?.connect();
    }),
    vscode.commands.registerCommand("titus.disconnect", () => {
      connection?.disconnect();
    }),
    vscode.commands.registerCommand("titus.showStatus", () => {
      const text = statusBar?.text ?? "Titus";
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

  const autoConnect = getExtensionConfig().get<boolean>("autoConnect", true);

  if (autoConnect) {
    connection.connect();
  } else {
    statusBar.text = "Titus: offline";
    statusBar.command = "titus.connect";
    statusBar.show();
  }
}

export function deactivate(): void {
  connection?.disconnect();
  connection = null;
  statusBar?.dispose();
  statusBar = null;
}
