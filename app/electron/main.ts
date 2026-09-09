import { app, BrowserWindow, ipcMain, Menu, screen } from "electron";
import * as path from "path";
import { registerIpcHandlers } from "./ipc";
import { initHistory, wraithRoot } from "./store";

const isDev = process.env.WRAITH_DEV === "1";

process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("[wraith] uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[wraith] unhandled rejection:", reason);
});

let mainWindow: BrowserWindow | null = null;
let shutdownFn: (() => Promise<void>) | null = null;

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1440, Math.round(screenW * 0.92));
  const height = Math.min(900, Math.round(screenH * 0.92));

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0a0d14",
    show: false,
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    visualEffectState: process.platform === "darwin" ? "active" : undefined,
    backgroundMaterial: process.platform === "win32" ? "acrylic" : undefined,
    transparent: process.platform !== "win32",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.on("maximize", () => win.webContents.send("window:maximized", true));
  win.on("unmaximize", () => win.webContents.send("window:maximized", false));

  return win;
}

function registerWindowControls() {
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggleMaximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  wraithRoot(); // ensure the centralized data folder exists before anything writes to it
  initHistory();

  mainWindow = createWindow();
  registerWindowControls();
  const controller = registerIpcHandlers(() => mainWindow);
  shutdownFn = controller.shutdown;

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("window-all-closed", async () => {
  if (shutdownFn) await shutdownFn();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async (event) => {
  if (shutdownFn) {
    event.preventDefault();
    await shutdownFn();
    shutdownFn = null;
    app.quit();
  }
});
