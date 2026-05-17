import { app, BrowserWindow } from "electron";

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 850,
    minHeight: 600,
    backgroundColor: "#111217",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
  });

  win.webContents.on("before-input-event", (event, input) => {
    const isDevToolsShortcut =
      input.key.toLowerCase() === "i" &&
      input.shift &&
      (input.meta || input.control);

    if (isDevToolsShortcut) {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }
  });

  win.loadURL("http://localhost:5173");
}

app.whenReady().then(createWindow);
