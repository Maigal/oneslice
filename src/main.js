const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

let ffmpegPath = require("ffmpeg-static");
if (app.isPackaged) {
  ffmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
}

try {
  require("electron-reload")(__dirname, {
    electron: require("electron"),
    awaitWriteFinish: true,
  });
} catch (err) {}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow.isVisible()) mainWindow.show();
  });
}

// Allow renderer to request window resize to fit content
ipcMain.on("window:resize-to-content", (_event, size) => {
  if (!mainWindow || !size) return;
  const w = Math.max(320, Math.round(size.width));
  const h = Math.max(240, Math.round(size.height));
  try {
    mainWindow.setContentSize(w, h);
  } catch (e) {}
});

function parseTimeNumber(value, fieldName) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a number >= 0.`);
  }

  return parsed;
}

function validateTimes(options) {
  const start = parseTimeNumber(options.start, "Start");
  const end = parseTimeNumber(options.end, "End");

  if (end <= start) {
    throw new Error("End time must be greater than start time.");
  }

  return { start, end };
}

async function chooseInputFile() {
  const result = await dialog.showOpenDialog({
    title: "Select a video file",
    properties: ["openFile"],
    filters: [
      {
        name: "Video Files",
        extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v"],
      },
    ],
  });

  return result.canceled ? null : result.filePaths[0];
}

async function chooseOutputFile(defaultInputPath) {
  const parsedPath = path.parse(defaultInputPath || "cropped-video.mp4");
  const defaultPath = path.join(
    parsedPath.dir || app.getPath("videos"),
    `${parsedPath.name || "cropped-video"}-cropped${parsedPath.ext || ".mp4"}`,
  );

  const result = await dialog.showSaveDialog({
    title: "Save cropped video as",
    defaultPath,
    filters: [
      {
        name: "Video Files",
        extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v"],
      },
    ],
  });

  return result.canceled ? null : result.filePath;
}

function sliceVideo({ inputPath, outputPath, start, end }) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary was not found.");
  }

  if (!inputPath || !outputPath) {
    throw new Error("Input and output paths are required.");
  }

  const { start: s, end: e } = validateTimes({ start, end });
  const duration = e - s;

  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-ss",
      String(s),
      "-i",
      inputPath,
      "-t",
      String(duration),
      "-c",
      "copy",
      outputPath,
    ];

    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ outputPath, log: stderr.trim() });
        return;
      }

      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}.`));
    });
  });
}

ipcMain.handle("dialog:select-input", async () => chooseInputFile());
ipcMain.handle("dialog:select-output", async (_event, inputPath) =>
  chooseOutputFile(inputPath),
);
ipcMain.handle("video:slice", async (_event, payload) => sliceVideo(payload));

app.whenReady().then(() => {
  createWindow();
  Menu.setApplicationMenu(null);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
