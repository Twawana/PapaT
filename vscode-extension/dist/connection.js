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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TitusConnection = void 0;
exports.handleVscodeCommand = handleVscodeCommand;
const vscode = __importStar(require("vscode"));
const ws_1 = __importDefault(require("ws"));
const protocol_1 = require("./protocol");
const EXTENSION_VERSION = "0.5.0";
const RECONNECT_MS = 3000;
class TitusConnection {
    statusBar;
    onCommand;
    socket = null;
    reconnectTimer = null;
    intentionalClose = false;
    connected = false;
    constructor(statusBar, onCommand) {
        this.statusBar = statusBar;
        this.onCommand = onCommand;
    }
    connect() {
        const titus = vscode.workspace.getConfiguration("titus");
        const legacy = vscode.workspace.getConfiguration("papat");
        const host = titus.get("host") ?? legacy.get("host", "127.0.0.1");
        const port = titus.get("port") ?? legacy.get("port", 3847);
        const url = `ws://${host}:${port}`;
        this.intentionalClose = false;
        this.updateStatus("connecting", `Connecting to ${url}`);
        const socket = new ws_1.default(url);
        this.socket = socket;
        socket.on("open", () => {
            this.connected = true;
            this.updateStatus("connecting", `Titus: connecting (${host}:${port})`);
        });
        socket.on("message", (data) => {
            const message = (0, protocol_1.parseServerMessage)(data.toString("utf-8"));
            if (!message) {
                return;
            }
            if (message.type === "auth_required") {
                this.register();
                this.updateStatus("connected", `Titus: connected (${host}:${port})`);
                return;
            }
            if (message.type === "connected") {
                this.register();
                this.updateStatus("connected", `Titus: connected (${host}:${port})`);
                return;
            }
            if (message.type === "vscode_command") {
                this.onCommand(message);
            }
        });
        socket.on("close", () => {
            this.connected = false;
            this.socket = null;
            if (this.intentionalClose) {
                this.updateStatus("disconnected", "Titus: disconnected");
                return;
            }
            this.updateStatus("connecting", "Titus: reconnecting...");
            this.scheduleReconnect();
        });
        socket.on("error", () => {
            this.updateStatus("error", "Titus: host unreachable");
        });
    }
    disconnect() {
        this.intentionalClose = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.socket?.close();
        this.socket = null;
        this.connected = false;
        this.updateStatus("disconnected", "Titus: disconnected");
    }
    isConnected() {
        return this.connected && this.socket?.readyState === ws_1.default.OPEN;
    }
    sendStatus(activeFile) {
        this.send({
            type: "vscode_status",
            activeFile: activeFile ?? null,
            workspaceFolders: this.getWorkspaceFolders(),
        });
    }
    register() {
        this.send({
            type: "vscode_register",
            workspaceFolders: this.getWorkspaceFolders(),
            extensionVersion: EXTENSION_VERSION,
        });
        this.sendStatus(vscode.window.activeTextEditor?.document.uri.fsPath ?? null);
    }
    send(message) {
        if (!this.socket || this.socket.readyState !== ws_1.default.OPEN) {
            return;
        }
        this.socket.send((0, protocol_1.serializeClientMessage)(message));
    }
    getWorkspaceFolders() {
        return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    }
    scheduleReconnect() {
        if (this.reconnectTimer || this.intentionalClose) {
            return;
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, RECONNECT_MS);
    }
    updateStatus(state, text) {
        this.statusBar.text = text;
        this.statusBar.tooltip = "Titus phone bridge";
        this.statusBar.command = "titus.showStatus";
        if (state === "connected") {
            this.statusBar.backgroundColor = undefined;
            this.statusBar.color = undefined;
        }
        else if (state === "error") {
            this.statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        }
        else {
            this.statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        }
        this.statusBar.show();
    }
}
exports.TitusConnection = TitusConnection;
async function handleVscodeCommand(message) {
    const uri = vscode.Uri.file(message.path);
    switch (message.command) {
        case "open_file": {
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document, { preview: false });
            break;
        }
        case "open_folder": {
            let isDirectory = false;
            try {
                const stat = await vscode.workspace.fs.stat(uri);
                isDirectory = stat.type === vscode.FileType.Directory;
            }
            catch {
                return;
            }
            if (!isDirectory) {
                return;
            }
            const alreadyOpen = (vscode.workspace.workspaceFolders ?? []).some((folder) => folder.uri.fsPath.toLowerCase() === uri.fsPath.toLowerCase());
            if (alreadyOpen) {
                await vscode.commands.executeCommand("revealInExplorer", uri);
                return;
            }
            await vscode.commands.executeCommand("vscode.openFolder", uri, false);
            break;
        }
        case "reveal":
            await vscode.commands.executeCommand("revealInExplorer", uri);
            break;
    }
}
//# sourceMappingURL=connection.js.map