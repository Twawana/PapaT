"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const connection_1 = require("./connection");
let connection = null;
let statusBar = null;
function getExtensionConfig() {
    const titus = vscode.workspace.getConfiguration("titus");
    if (titus.get("host") !== undefined || titus.get("port") !== undefined) {
        return titus;
    }
    return vscode.workspace.getConfiguration("papat");
}
function activate(context) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBar);
    connection = new connection_1.TitusConnection(statusBar, (command) => {
        void (0, connection_1.handleVscodeCommand)(command);
    });
    context.subscriptions.push({ dispose: () => connection?.disconnect() });
    context.subscriptions.push(vscode.commands.registerCommand("titus.connect", () => {
        connection?.connect();
    }), vscode.commands.registerCommand("titus.disconnect", () => {
        connection?.disconnect();
    }), vscode.commands.registerCommand("titus.showStatus", () => {
        const text = statusBar?.text ?? "Titus";
        void vscode.window.showInformationMessage(text);
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        connection?.sendStatus(editor?.document.uri.fsPath ?? null);
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        connection?.sendStatus(vscode.window.activeTextEditor?.document.uri.fsPath ?? null);
    }));
    const autoConnect = getExtensionConfig().get("autoConnect", true);
    if (autoConnect) {
        connection.connect();
    }
    else {
        statusBar.text = "Titus: offline";
        statusBar.command = "titus.connect";
        statusBar.show();
    }
}
function deactivate() {
    connection?.disconnect();
    connection = null;
    statusBar?.dispose();
    statusBar = null;
}
//# sourceMappingURL=extension.js.map