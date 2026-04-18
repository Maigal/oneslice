const exportButton = document.getElementById("exportButton");
const preview = document.getElementById("preview");
const previewWrap = document.getElementById("previewWrap");
const dropZoneSelect = document.getElementById("dropZoneSelect");
const selectScreen = document.getElementById("selectScreen");
const editorScreen = document.getElementById("editorScreen");
const backButton = document.getElementById("backButton");
const rangeStart = document.getElementById("rangeStart");
const rangeEnd = document.getElementById("rangeEnd");
const startLabel = document.getElementById("startLabel");
const endLabel = document.getElementById("endLabel");
const timelineSelected = document.querySelector(".timeline-selected");
const thumbStart = document.querySelector(".thumb-start");
const thumbEnd = document.querySelector(".thumb-end");
const timelineWrap = document.querySelector(".timeline-wrapper");

let currentInputPath = "";

function setExporting(isExporting) {
  if (!exportButton) return;
  if (isExporting) {
    if (!exportButton.dataset._label)
      exportButton.dataset._label = exportButton.textContent;
    exportButton.disabled = true;
    exportButton.textContent = "Exporting...";
  } else {
    exportButton.disabled = false;
    if (exportButton.dataset._label) {
      exportButton.textContent = exportButton.dataset._label;
      delete exportButton.dataset._label;
    }
  }
}

function attachFileToPlayer(filePath) {
  const fileUrl = "file:///" + filePath.replace(/\\/g, "/");
  preview.src = fileUrl;
  showEditor();
  currentInputPath = filePath;
}

function showEditor() {
  selectScreen.classList.add("hidden");
  editorScreen.classList.remove("hidden");
  requestWindowResize();
}

function showSelector() {
  editorScreen.classList.add("hidden");
  selectScreen.classList.remove("hidden");
  requestWindowResize();
}

function requestWindowResize() {
  const isSelectorVisible =
    selectScreen && !selectScreen.classList.contains("hidden");
  const size = isSelectorVisible
    ? { width: 640, height: 300 }
    : { width: 720, height: 600 };
  window.oneSliceApi.resizeWindowTo(size);
}

// Format seconds into min:sec.csec (e.g. 1:23.45)
function formatTime(sec) {
  const t = Number(sec) || 0;
  const minutes = Math.floor(t / 60);
  let secondsTotal = t % 60;
  let secondsInt = Math.floor(secondsTotal);
  let centis = Math.round((secondsTotal - secondsInt) * 100);
  if (centis === 100) {
    secondsInt += 1;
    centis = 0;
  }
  if (secondsInt === 60) {
    return `${minutes + 1}:00.00`;
  }
  const secPart = String(secondsInt).padStart(2, "0");
  const centPart = String(centis).padStart(2, "0");
  return `${minutes}:${secPart}.${centPart}`;
}

backButton.addEventListener("click", () => {
  preview.pause();
  preview.src = "";
  showSelector();
});

// Make the large areas clickable to open the file picker (no drag/drop)
dropZoneSelect.addEventListener("click", async () => {
  const selectedPath = await window.oneSliceApi.selectInputFile();
  if (!selectedPath) return;
  attachFileToPlayer(selectedPath);
});

// Do not open the file picker when clicking the preview area; keep select and preview separate

preview.addEventListener("loadedmetadata", () => {
  const dur = preview.duration || 0;
  rangeStart.max = dur;
  rangeEnd.max = dur;
  rangeStart.value = 0;
  rangeEnd.value = dur;
  startLabel.textContent = formatTime(Number(rangeStart.value));
  endLabel.textContent = formatTime(Number(rangeEnd.value));
  updateTimelineSelected();
});

preview.addEventListener("timeupdate", () => {
  const startVal = Number(rangeStart.value) || 0;
  const endVal = Number(rangeEnd.value) || preview.duration || 0;
  if (preview.currentTime >= endVal) {
    preview.currentTime = startVal;
    preview.play();
  }
});

// Timeline handle logic: keep start < end and update labels/visuals
function clampRangeValues() {
  const dur = preview.duration || 0;
  let startVal = Number(rangeStart.value);
  let endVal = Number(rangeEnd.value);
  if (startVal < 0) startVal = 0;
  if (endVal > dur) endVal = dur;
  if (startVal >= endVal) {
    // prevent overlap: if user moves start past end, push the other
    if (this === rangeStart) {
      startVal = Math.max(0, endVal - 0.01);
      rangeStart.value = startVal;
    } else {
      endVal = Math.min(dur, startVal + 0.01);
      rangeEnd.value = endVal;
    }
  }
  startLabel.textContent = formatTime(Number(rangeStart.value));
  endLabel.textContent = formatTime(Number(rangeEnd.value));
  updateTimelineSelected();
}

rangeStart.addEventListener("input", clampRangeValues.bind(rangeStart));
rangeEnd.addEventListener("input", clampRangeValues.bind(rangeEnd));

let activeHandle = null;
let wasPlayingBeforeDrag = false;

if (timelineWrap) timelineWrap.style.pointerEvents = "auto";

function clientXToTime(clientX) {
  const bar = document.querySelector(".timeline-bar") || timelineWrap;
  const rect = bar.getBoundingClientRect();
  const dur = preview.duration || 0;
  // account for visible thumb width so mapping is to thumb center
  const thumbW = 2; // matches CSS thumb width
  const half = thumbW / 2;
  const available = Math.max(1, rect.width - thumbW);
  const pct = Math.min(
    1,
    Math.max(0, (clientX - (rect.left + half)) / available),
  );
  return pct * dur;
}

function pointerDownHandler(e) {
  const dur = preview.duration || 0;
  if (dur === 0) return;
  wasPlayingBeforeDrag = !preview.paused;
  const startVal = Number(rangeStart.value);
  const endVal = Number(rangeEnd.value);

  // pick nearest handle
  const bar = document.querySelector(".timeline-bar") || timelineWrap;
  const rect = bar.getBoundingClientRect();
  const durVal = Math.max(1, preview.duration || 1);
  const thumbW = 2;
  const half = thumbW / 2;
  const available = Math.max(1, rect.width - thumbW);
  const startPx = rect.left + half + (startVal / durVal) * available;
  const endPx = rect.left + half + (endVal / durVal) * available;
  const dsPx = Math.abs(e.clientX - startPx);
  const drPx = Math.abs(e.clientX - endPx);
  activeHandle = dsPx <= drPx ? "start" : "end";

  // if out of bounds jump to the closest boundary when drag starts
  const cur = preview.currentTime || 0;
  if (cur < startVal || cur > endVal) {
    const distStart = Math.abs(cur - startVal);
    const distEnd = Math.abs(cur - endVal);
    const target =
      activeHandle === "end"
        ? endVal
        : distStart <= distEnd
          ? startVal
          : endVal;
    if (preview.duration && preview.readyState >= 1) {
      preview.currentTime = Math.min(target, preview.duration - 0.01);
      if (wasPlayingBeforeDrag) {
        preview.play().catch(() => {});
      } else {
        preview.pause();
      }
    }
  }

  timelineWrap.setPointerCapture(e.pointerId);
}

function pointerMoveHandler(e) {
  if (!activeHandle) return;
  const pointerTime = clientXToTime(e.clientX);
  const dur = preview.duration || 0;
  const clamped = Math.min(Math.max(0, pointerTime), dur);

  if (activeHandle === "start") {
    // prevent start >= end
    const newStart = Math.min(clamped, Number(rangeEnd.value) - 0.01);
    rangeStart.value = Math.max(0, newStart);
  } else if (activeHandle === "end") {
    const newEnd = Math.max(clamped, Number(rangeStart.value) + 0.01);
    rangeEnd.value = Math.min(dur, newEnd);
  }

  clampRangeValues();

  if (activeHandle === "start") {
    const newStart = Number(rangeStart.value) || 0;
    if (preview.duration && preview.readyState >= 1) {
      preview.currentTime = Math.min(
        newStart,
        Math.max(0, preview.duration - 0.01),
      );
      if (wasPlayingBeforeDrag) {
        preview.play().catch(() => {});
      } else {
        preview.pause();
      }
    }
  }

  if (activeHandle === "end") {
    const newEnd = Number(rangeEnd.value) || 0;
    const cur = preview.currentTime || 0;
    if (cur < Number(rangeStart.value) || cur > newEnd) {
      if (preview.duration && preview.readyState >= 1) {
        preview.currentTime = Math.min(
          newEnd,
          Math.max(0, preview.duration - 0.01),
        );
        if (wasPlayingBeforeDrag) {
          preview.play().catch(() => {});
        } else {
          preview.pause();
        }
      }
    }
  }
}

function pointerUpHandler(e) {
  activeHandle = null;
  timelineWrap.releasePointerCapture(e.pointerId);
  wasPlayingBeforeDrag = false;
}

timelineWrap.addEventListener("pointerdown", pointerDownHandler);
window.addEventListener("pointermove", pointerMoveHandler);
window.addEventListener("pointerup", pointerUpHandler);

function updateTimelineSelected() {
  const bar = document.querySelector(".timeline-bar") || timelineWrap;
  const rect = bar.getBoundingClientRect();
  const duration = preview.duration || 1;
  const thumbWidth = 2;
  const half = thumbWidth / 2;
  const available = Math.max(1, rect.width - thumbWidth);
  const start = Number(rangeStart.value);
  const end = Number(rangeEnd.value);
  const leftPx = (start / duration) * available + half;
  const rightPx = (end / duration) * available + half;
  const leftPercent = (leftPx / rect.width) * 100;
  const widthPercent = ((rightPx - leftPx) / rect.width) * 100;
  timelineSelected.style.left = `${leftPercent}%`;
  timelineSelected.style.width = `${Math.max(0, widthPercent)}%`;
  if (thumbStart) thumbStart.style.left = `${leftPercent}%`;
  if (thumbEnd) thumbEnd.style.left = `${(rightPx / rect.width) * 100}%`;
}

function showToast(text, ms = 4000) {
  const toast = document.getElementById("toast");
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), ms);
}

exportButton.addEventListener("click", async () => {
  if (!currentInputPath) return;

  const startTime = Number(rangeStart.value);
  const endTime = Number(rangeEnd.value);

  const out = await window.oneSliceApi.selectOutputFile(currentInputPath);
  if (!out) return;

  setExporting(true);
  try {
    await window.oneSliceApi.sliceVideo({
      inputPath: currentInputPath,
      outputPath: out,
      start: startTime,
      end: endTime,
    });
    setExporting(false);
    showToast("Export finished", 6000);
  } catch (err) {
    setExporting(false);
    console.error(err);
    showToast("Export failed", 5000);
  }
});

window.addEventListener("load", () => {
  requestAnimationFrame(() => requestWindowResize());
});
requestAnimationFrame(() => requestWindowResize());
