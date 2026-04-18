const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("oneSliceApi", {
  selectInputFile: () => ipcRenderer.invoke("dialog:select-input"),
  selectOutputFile: (inputPath) =>
    ipcRenderer.invoke("dialog:select-output", inputPath),
  sliceVideo: (payload) => ipcRenderer.invoke("video:slice", payload),
  resizeWindowTo: (size) => ipcRenderer.send("window:resize-to-content", size),
});
