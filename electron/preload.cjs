const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("whiteboardAPI", {
  saveBoard: (boardData) => ipcRenderer.invoke("board:save", boardData),
  saveBoardAs: (boardData) => ipcRenderer.invoke("board:save-as", boardData),
  loadBoard: () => ipcRenderer.invoke("board:load"),
  loadBoardFromPath: (filePath) =>
    ipcRenderer.invoke("board:load-from-path", filePath),
  newBoard: (payload) => ipcRenderer.invoke("board:new", payload),
  exportBoardAsPng: (payload) =>
    ipcRenderer.invoke("board:export-png", payload),

  onRequestCloseState: (callback) => {
    const listener = () => callback();
    ipcRenderer.removeAllListeners("app:request-close-state");
    ipcRenderer.on("app:request-close-state", listener);
  },

  respondToCloseRequest: (payload) =>
    ipcRenderer.invoke("app:close-response", payload),
});
