import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let currentBoardPath: string | null = null;
let isClosingConfirmed = false;

type BoardData = {
  version: number;
  title: string;
  lines: unknown[];
  notes: unknown[];
  shapes: unknown[];
  textBoxes: unknown[];
  savedAt: string;
};

type NewBoardPayload = {
  isDirty: boolean;
  boardData: BoardData;
  isCollaborative?: boolean;
};

async function saveBoardFile(boardData: BoardData, forceSaveAs = false) {
  if (!mainWindow) return { canceled: true };

  if (forceSaveAs || !currentBoardPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: forceSaveAs ? "Save Board As" : "Save Board",
      defaultPath: `${boardData.title || "Untitled Board"}.whiteboard`,
      filters: [{ name: "Whiteboard Files", extensions: ["whiteboard"] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    currentBoardPath = result.filePath;
  }

  await fs.writeFile(
    currentBoardPath,
    JSON.stringify(boardData, null, 2),
    "utf-8",
  );

  return { canceled: false, filePath: currentBoardPath };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 850,
    minHeight: 600,
    backgroundColor: "#111217",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;

  win.on("close", (event) => {
    if (isClosingConfirmed) return;

    event.preventDefault();
    win.webContents.send("app:request-close-state");
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

ipcMain.handle("board:save", async (_event, boardData: BoardData) => {
  return saveBoardFile(boardData);
});

ipcMain.handle("board:save-as", async (_event, boardData: BoardData) => {
  return saveBoardFile(boardData, true);
});

ipcMain.handle("board:load", async () => {
  if (!mainWindow) return { canceled: true };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Load Board",
    properties: ["openFile"],
    filters: [{ name: "Whiteboard Files", extensions: ["whiteboard", "json"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const raw = await fs.readFile(filePath, "utf-8");
  const data = JSON.parse(raw);

  currentBoardPath = filePath;

  return {
    canceled: false,
    filePath,
    data,
  };
});

ipcMain.handle("board:load-from-path", async (_event, filePath: string) => {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);

    currentBoardPath = filePath;

    return {
      canceled: false,
      filePath,
      data,
    };
  } catch {
    return {
      canceled: true,
      error: "Could not load board file.",
    };
  }
});

ipcMain.handle("board:new", async (_event, payload: NewBoardPayload) => {
  if (!mainWindow) return { canceled: true };

  const { isDirty, boardData, isCollaborative } = payload;

  if (!isDirty) {
    currentBoardPath = null;

    return {
      canceled: false,
    };
  }

  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: isCollaborative
      ? ["Save Copy", "Don’t Save", "Cancel"]
      : ["Save", "Don’t Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: isCollaborative ? "Save Collaborative Board?" : "Unsaved Changes",
    message: isCollaborative
      ? "Would you like to save a personal copy of this collaborative board?"
      : "Do you want to save changes to this board?",
    detail: isCollaborative
      ? "This saves the current board to your desktop. The shared room will not be affected."
      : "Your changes will be lost if you don’t save them.",
  });

  if (result.response === 2) {
    return { canceled: true };
  }

  if (result.response === 0) {
    const saveResult = await saveBoardFile(boardData);

    if (saveResult.canceled) {
      return { canceled: true };
    }
  }

  currentBoardPath = null;

  return {
    canceled: false,
  };
});

ipcMain.handle(
  "board:export-png",
  async (_event, payload: { title: string; dataUrl: string }) => {
    if (!mainWindow) return { canceled: true };

    const safeTitle = (payload.title || "Untitled Board")
      .replace(/[<>:"/\\|?*]/g, "")
      .trim();

    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export Board as PNG",
      defaultPath: `${safeTitle || "Untitled Board"}.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const base64Data = payload.dataUrl.replace(/^data:image\/png;base64,/, "");
    await fs.writeFile(result.filePath, Buffer.from(base64Data, "base64"));

    return {
      canceled: false,
      filePath: result.filePath,
    };
  },
);

ipcMain.handle("app:close-response", async (_event, payload) => {
  if (!mainWindow) return;

  const { isDirty, boardData } = payload;

  if (!isDirty) {
    isClosingConfirmed = true;
    mainWindow.close();
    return;
  }

  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Save", "Don’t Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: "Unsaved Changes",
    message: "Do you want to save changes to this board?",
    detail: "Your changes will be lost if you don’t save them.",
  });

  if (result.response === 0) {
    const saveResult = await saveBoardFile(boardData);

    if (!saveResult.canceled) {
      isClosingConfirmed = true;
      mainWindow.close();
    }
  }

  if (result.response === 1) {
    isClosingConfirmed = true;
    mainWindow.close();
  }
});

app.whenReady().then(createWindow);
