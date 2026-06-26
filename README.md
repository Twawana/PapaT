# PapaT — Phone-as-PC Terminal

PapaT turns your phone into a remote coding environment. All computation runs on your PC; the phone is the interface.

## Architecture

```
mobile/          React Native (Expo) app — code editor, file explorer, terminal
host-server/     Node.js WebSocket server — executes JS and manages workspace files on your PC
```

The PC workspace (`PAPAT_WORKSPACE`) is the source of truth. The mobile **Files** tab lists, reads, edits, and deletes files on your PC in real time.

## Quick Start

### 1. Start the PC Host Server

```bash
cd host-server
npm install ws
npm start
```

The server listens on `ws://0.0.0.0:3847` by default.

Find your PC's local IP (e.g. `192.168.1.42`):

- **Windows:** `ipconfig`
- **macOS/Linux:** `ifconfig` or `ip addr`

### 2. Start the Mobile App

```bash
cd mobile
npm install
npx expo start
```

- Scan the QR code with **Expo Go** on your phone (same Wi-Fi as PC)
- Enter your PC's IP address in the connection bar
- Tap **Connect**
- **Code** tab — write JavaScript and tap **Run**
- **Files** tab — browse, edit, create, and delete files in your PC workspace

### 3. Test from CLI (optional)

```bash
cd host-server
node scripts/test-client.js
```

## Environment Variables (Host)

| Variable | Default | Description |
|----------|---------|-------------|
| `PAPAT_PORT` | `3847` | WebSocket port |
| `PAPAT_HOST` | `0.0.0.0` | Bind address |
| `PAPAT_WORKSPACE` | `./workspace` | File root + execution working directory |
| `PAPAT_EXEC_TIMEOUT` | `30000` | Max execution time (ms) |
| `PAPAT_MAX_FILE_SIZE` | `512000` | Max file read/write size (bytes) |
| `PAPAT_COMMAND_TIMEOUT` | `60000` | Max shell command time (ms) |
| `PAPAT_LLM_PROVIDER` | `cursor` | Agent backend: `cursor` (logged-in Cursor CLI) or `openai` |
| `PAPAT_CURSOR_MODEL` | `auto` | Cursor model (`auto`, `composer-2.5`, etc.) |
| `CURSOR_API_KEY` | — | Optional Cursor API key (otherwise uses `agent login` session) |
| `OPENAI_API_KEY` | — | OpenAI API key (only if `PAPAT_LLM_PROVIDER=openai`) |
| `PAPAT_LLM_MODEL` | `gpt-4o-mini` | OpenAI model when using OpenAI provider |
| `PAPAT_AGENT_MAX_TURNS` | `15` | Max tool-calling loops per message (OpenAI provider only) |

## VS Code Integration (MVP 7)

PapaT connects **directly to VS Code** through a companion extension. When linked:

- Your phone shows **VS Code linked** in the connection bar
- **Open in VS Code** switches the workspace without launching a new window
- Saving a file from the phone **opens it in VS Code** on your PC
- The **Files** tab can push any file to your open editor

### Install the VS Code extension

1. Start the PapaT host on your PC (`host-server`)
2. Build the extension:
   ```bash
   cd vscode-extension
   npm install
   npm run build
   ```
3. In VS Code: **Run and Debug** → **Launch Extension** (or install the `.vsix` after packaging)
4. The status bar shows **PapaT: connected** when linked to `ws://127.0.0.1:3847`

Extension settings (`papat.host`, `papat.port`, `papat.autoConnect`) are in VS Code Settings.

## AI Agent (MVP 4)

The **Agent** tab sends messages to your PC host, which runs the **Cursor CLI** (`agent`) using your logged-in Cursor account. That gives you the same smart agent as Cursor on desktop — file edits, shell commands, debugging, and more.

### One-time setup on your PC

1. Install the Cursor CLI (if you don't have `agent` yet):

   **Windows PowerShell:**
   ```powershell
   irm 'https://cursor.com/install?win32=true' | iex
   ```

2. Log in with your Cursor account:
   ```bash
   agent login
   ```

3. Rebuild and start the host:
   ```bash
   cd host-server && npm run build && npm start
   ```

Optional: set `CURSOR_API_KEY` instead of `agent login` for automation. To use OpenAI instead, set `PAPAT_LLM_PROVIDER=openai` and `OPENAI_API_KEY`.

## File System Protocol (MVP 2)

All paths are relative to `PAPAT_WORKSPACE`. The mobile app syncs on demand (list/read/write/delete over WebSocket).

| Client message | Server response |
|----------------|-----------------|
| `fs_list` | `fs_list_result` with `entries[]` |
| `fs_read` | `fs_read_result` with `content` |
| `fs_write` | `fs_write_result` |
| `fs_delete` | `fs_delete_result` |
| `fs_mkdir` | `fs_mkdir_result` |

## Development Phases

- [x] **MVP 1** — WebSocket connection, JS execution, terminal output
- [x] **MVP 2** — File system (read/write/list/delete)
- [x] **MVP 2b** — Open projects in Cursor/VS Code, browse PC folders, recent folders
- [ ] **MVP 3** — Mobile code editor enhancements
- [x] **MVP 4** — AI agent with tool calling
- [ ] **MVP 5** — Python + multi-language
- [ ] **MVP 6** — Auth & QR pairing
- [x] **MVP 7** — VS Code extension (direct WebSocket bridge)

## License

MIT
