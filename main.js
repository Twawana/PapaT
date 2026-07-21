const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");

const BACKEND_PORT = Number(process.env.PAPAT_PORT || process.env.TITUS_PORT || 3847);
const UI_PORT = Number(process.env.PAPAT_UI_PORT || 3000);
const STARTUP_DELAY_MS = Number(process.env.PAPAT_STARTUP_DELAY_MS || 2000);
const BACKEND_READY_TIMEOUT_MS = 30_000;

let serverProcess = null;
let uiServer = null;
let mainWindow = null;
let isQuitting = false;
let pairingCode = null;

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const entry of iface) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return "127.0.0.1";
}

function parseBackendOutput(text) {
  const codeMatch = text.match(/Code:\s*([A-Z0-9]{6})/i);
  if (codeMatch) {
    pairingCode = codeMatch[1].toUpperCase();
  }
}

function logBackend(message) {
  process.stdout.write(`[PapaT Backend] ${message}`);
}

function logBackendError(message) {
  process.stderr.write(`[PapaT Backend] ${message}`);
}

function getHostServerRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "host-server");
  }
  return path.join(__dirname, "host-server");
}

function resolveBackendEntry(hostServerRoot) {
  const distDir = path.join(hostServerRoot, "dist");
  const indexEntry = path.join(distDir, "index.js");
  const serverEntry = path.join(distDir, "server.js");

  if (fs.existsSync(indexEntry)) {
    return indexEntry;
  }
  if (fs.existsSync(serverEntry)) {
    return serverEntry;
  }

  throw new Error(
    app.isPackaged
      ? "PapaT host files are missing. Please reinstall the application."
      : `Backend not built. Run "npm run build:host" first.\nExpected: ${indexEntry}`
  );
}

function resolveNodeRunner() {
  if (app.isPackaged) {
    return {
      command: process.execPath,
      extraEnv: { ELECTRON_RUN_AS_NODE: "1" },
    };
  }

  return {
    command: process.platform === "win32" ? "node.exe" : "node",
    extraEnv: {},
  };
}

function getWorkspaceDir(hostServerRoot) {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "workspace");
  }
  return path.join(hostServerRoot, "workspace");
}

function startBackendServer() {
  const hostServerRoot = getHostServerRoot();
  const backendEntry = resolveBackendEntry(hostServerRoot);
  const workspaceDir = getWorkspaceDir(hostServerRoot);
  const { command, extraEnv } = resolveNodeRunner();

  fs.mkdirSync(workspaceDir, { recursive: true });

  serverProcess = spawn(command, [backendEntry], {
    cwd: hostServerRoot,
    env: {
      ...process.env,
      ...extraEnv,
      PAPAT_PORT: String(BACKEND_PORT),
      TITUS_PORT: String(BACKEND_PORT),
      PAPAT_WORKSPACE: workspaceDir,
      TITUS_WORKSPACE: workspaceDir,
      PAPAT_HOST: "0.0.0.0",
      TITUS_HOST: "0.0.0.0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    parseBackendOutput(text);
    logBackend(text);
  });

  serverProcess.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    parseBackendOutput(text);
    logBackendError(text);
  });

  serverProcess.on("error", (err) => {
    logBackendError(`Failed to start backend: ${err.message}\n`);
  });

  serverProcess.on("exit", (code, signal) => {
    if (!isQuitting) {
      logBackendError(`Backend exited (code=${code ?? "null"}, signal=${signal ?? "null"})\n`);
    }
    serverProcess = null;
  });

  return serverProcess;
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = BACKEND_READY_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const attempt = () => {
      const socket = net.connect({ port, host }, () => {
        socket.end();
        resolve();
      });

      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Backend did not start on port ${port} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function startUiServer() {
  const uiRoot = path.join(__dirname, "desktop-ui");

  uiServer = http.createServer((req, res) => {
    const requestPath = req.url?.split("?")[0] ?? "/";

    if (requestPath === "/api/status") {
      const lanIp = getLanIp();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          lanIp,
          port: BACKEND_PORT,
          pairingCode,
          wsUrl: `ws://${lanIp}:${BACKEND_PORT}`,
          pairingApi: `http://127.0.0.1:${BACKEND_PORT}/api/pairing`,
        })
      );
      return;
    }

    const filePath = path.normalize(
      path.join(uiRoot, requestPath === "/" ? "/index.html" : requestPath)
    );

    if (!filePath.startsWith(uiRoot)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    uiServer.listen(UI_PORT, "127.0.0.1", () => resolve());
    uiServer.on("error", reject);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 780,
    minWidth: 720,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: "PapaT",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.loadURL(`http://127.0.0.1:${UI_PORT}/`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function stopBackendServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(serverProcess.pid), "/f", "/t"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      serverProcess.kill("SIGTERM");
    }
  } catch {
    try {
      serverProcess.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

function stopUiServer() {
  if (uiServer) {
    uiServer.close();
    uiServer = null;
  }
}

async function bootstrap() {
  startBackendServer();
  await startUiServer();

  await Promise.all([
    waitForPort(BACKEND_PORT),
    new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY_MS)),
  ]);

  createMainWindow();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.papat.app");
  }

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(bootstrap).catch((err) => {
    console.error("[PapaT] Startup failed:", err);
    app.quit();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    stopUiServer();
    stopBackendServer();
  });
}
