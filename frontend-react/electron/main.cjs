const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  shell,
  ipcMain,
} = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow = null;
let tray = null;
const children = [];

// ── Backend process launcher ────────────────────────────────────────────────

function startProcess(name, cmd, args, cwd) {
  try {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: "pipe",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    proc.stdout?.on("data", (d) =>
      console.log(`[${name}]`, d.toString().trim()),
    );
    proc.stderr?.on("data", (d) =>
      console.warn(`[${name}]`, d.toString().trim()),
    );
    proc.on("exit", (code) => console.log(`[${name}] exited:`, code));
    children.push(proc);
    console.log(`[Electron] Started ${name} (pid ${proc.pid})`);
    return proc;
  } catch (e) {
    console.warn(`[Electron] Could not start ${name}:`, e.message);
    return null;
  }
}

function startBackends() {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "backend-resources")
    : path.join(__dirname, "..", "..");

  // WebRTC Signaling Server (Node.js — port 8001)
  const serverDir = path.join(root, "WebRTC", "server");
  if (fs.existsSync(path.join(serverDir, "server.js"))) {
    startProcess("WebRTC", "node", ["server.js"], serverDir);
  }

  // Python FastAPI Backend (port 8000)
  const backendDir = path.join(root, "backend");
  const venvUvicorn =
    process.platform === "win32"
      ? path.join(root, ".venv", "Scripts", "uvicorn.exe")
      : path.join(root, ".venv", "bin", "uvicorn");
  const uvicorn = fs.existsSync(venvUvicorn)
    ? venvUvicorn
    : process.platform === "win32"
      ? "uvicorn.exe"
      : "uvicorn";
  if (fs.existsSync(path.join(backendDir, "main.py"))) {
    startProcess(
      "Backend",
      uvicorn,
      ["main:app", "--host", "127.0.0.1", "--port", "8000"],
      backendDir,
    );
  }

  // WhatsApp Agent (Node.js — port 3001)
  const waDir = path.join(root, "whatsapp-agent");
  if (fs.existsSync(path.join(waDir, "index.js"))) {
    startProcess("WhatsApp", "node", ["index.js"], waDir);
  }
}

// ── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#09090b",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#09090b",
      symbolColor: "#a1a1aa",
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, "icon.png"),
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("close", (e) => {
    if (tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Tray ─────────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, "icon.png");
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(img);
  tray.setToolTip("Family Safety Monitor");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Paneli Aç",
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: "separator" },
      {
        label: "Çıkış",
        click: () => {
          tray = null;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// ── Health polling ────────────────────────────────────────────────────────────

function pingUrl(url) {
  return new Promise((resolve) => {
    const { net } = require("electron");
    const req = net.request(url);
    req.on("response", () => resolve(true));
    req.on("error", () => resolve(false));
    req.end();
  });
}

async function waitForBackends(timeoutMs = 20000) {
  const services = [
    { name: "Backend", url: "http://127.0.0.1:8000/health" },
    { name: "WebRTC", url: "http://127.0.0.1:8001/api/diagnostics" },
    { name: "WhatsApp", url: "http://127.0.0.1:3001/health" },
  ];
  const deadline = Date.now() + timeoutMs;
  const ready = new Set();

  console.log("[Electron] Waiting for backends…");
  while (Date.now() < deadline && ready.size < services.length) {
    await new Promise((r) => setTimeout(r, 1000));
    for (const svc of services) {
      if (ready.has(svc.name)) continue;
      const ok = await pingUrl(svc.url);
      if (ok) {
        console.log(`[Electron] ✅ ${svc.name} ready`);
        ready.add(svc.name);
      }
    }
  }
  const missing = services.filter((s) => !ready.has(s.name)).map((s) => s.name);
  if (missing.length)
    console.warn("[Electron] ⚠️  Timed out waiting for:", missing.join(", "));
  return missing;
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("open:external", (_, url) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      return shell.openExternal(url);
    }
  });

  startBackends();
  await waitForBackends(20000);
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  children.forEach((p) => {
    try {
      p.kill();
    } catch (_) {}
  });
});
