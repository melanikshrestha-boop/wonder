/**
 * Wonder Base — always-on-top desktop panel.
 * Loads the same habit widget as http://127.0.0.1:5173/?widget=1
 * Stays above other windows and follows you across Spaces.
 */
const { app, BrowserWindow, shell } = require("electron");

const WIDGET_URL = process.env.WONDER_WIDGET_URL || "http://127.0.0.1:5173/?widget=1";
const FULL_URL = process.env.WONDER_URL || "http://127.0.0.1:5173/";

/** @type {BrowserWindow | null} */
let win = null;

function createWindow() {
  const { screen } = require("electron");
  const display = screen.getPrimaryDisplay().workArea;
  const width = 380;
  const height = Math.min(720, display.height - 40);
  const x = display.x + display.width - width - 16;
  const y = display.y + Math.max(20, Math.floor((display.height - height) / 2));

  win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 300,
    minHeight: 400,
    title: "Wonder · Base",
    backgroundColor: "#050505",
    alwaysOnTop: true,
    fullscreenable: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Float above normal apps; show on every desktop / fullscreen edge
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setVisibleOnAllWorkspaces(true);

  win.loadURL(WIDGET_URL);

  win.webContents.setWindowOpenHandler(({ url }) => {
    // "Open full Wonder" links leave the widget and open the system browser
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    win = null;
  });
}

// Single instance — re-focus if launched again
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    app.quit();
  });
}
