if (window.__spTranslatorLoaded) {
  // Avoid duplicate listeners when background reinjects this script.
} else {
  window.__spTranslatorLoaded = true;

const PANEL_ID = "sp-translate-panel";

const WINDOW_SIZE_PRESETS = {
  thin: { width: "360px", height: "260px" },
  wide: { width: "640px", height: "320px" },
};

let currentSpeechRate = 1;
let currentVolume = 1;
let blurEnabled = false;
let currentUtterance = null;
let currentSpeechText = "";
let currentSpeechCharIndex = 0;
let currentSpeechDuration = 0;
let currentSpeechStartTime = 0;
let currentSpeechTimer = null;
let progressBarActive = false;
let playToggleBtn = null;
let progressBar = null;
let progressSegments = null;
let progressFill = null;
let progressDot = null;
let progressTime = null;
let speedInput = null;
let speedValue = null;
let volumeInput = null;
let volumeValue = null;
let smoothnessInput = null;
let smoothnessValue = null;
let currentProgressSmoothness = 10;
let output = null;

function getSelectionAnchor(panel) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { x: 20, y: 20 };
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return { x: 20, y: 20 };
  }

  const x = Math.max(12, Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 520));
  const y = Math.max(12, rect.top + window.scrollY - 170);
  return { x, y };
}

function getSpanishVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith("es")) ||
    voices.find((voice) => voice.name.toLowerCase().includes("spanish")) ||
    voices.find((voice) => voice.name.toLowerCase().includes("es")) ||
    null
  );
}

function updateProgressDisplay() {
  if (!progressFill || !progressDot || !progressTime) return;
  const textLength = currentSpeechText.length || 1;
  const percent = currentSpeechDuration ? Math.min(100, Math.max(0, (currentSpeechCharIndex / textLength) * 100)) : 0;
  progressFill.style.width = `${percent}%`;
  progressDot.style.left = `${percent}%`;
  const elapsedSeconds = Math.floor((currentSpeechDuration || 0) * (percent / 100));
  const totalSeconds = Math.floor(currentSpeechDuration || 0);
  const pad = (value) => String(value).padStart(2, "0");
  if (progressTime) {
    progressTime.textContent = `${Math.floor(elapsedSeconds / 60)}:${pad(elapsedSeconds % 60)} / ${Math.floor(totalSeconds / 60)}:${pad(totalSeconds % 60)}`;
  }
}

function startProgressTimer() {
  stopProgressTimer();
  if (!currentSpeechStartTime) {
    currentSpeechStartTime = Date.now();
  }

  const tick = () => {
    if (!currentSpeechDuration || !currentSpeechText) return;
    const elapsed = (Date.now() - currentSpeechStartTime) / 1000;
    const percent = Math.min(1, Math.max(0, elapsed / currentSpeechDuration));
    currentSpeechCharIndex = Math.round(currentSpeechText.length * percent);
    updateProgressDisplay();

    if (percent >= 1) {
      currentSpeechTimer = null;
      progressBarActive = false;
      if (playToggleBtn) playToggleBtn.textContent = "►";
      return;
    }

    currentSpeechTimer = window.requestAnimationFrame(tick);
  };

  currentSpeechTimer = window.requestAnimationFrame(tick);
}

function stopProgressTimer() {
  if (currentSpeechTimer !== null) {
    window.cancelAnimationFrame(currentSpeechTimer);
    currentSpeechTimer = null;
  }
}

function refreshProgressPosition() {
  if (!currentSpeechDuration || !currentSpeechText) return;
  const elapsed = (Date.now() - currentSpeechStartTime) / 1000;
  const percent = Math.min(1, Math.max(0, elapsed / currentSpeechDuration));
  currentSpeechCharIndex = Math.round(currentSpeechText.length * percent);
  updateProgressDisplay();
}

function rebuildProgressSegments(segmentCount) {
  if (!progressSegments) return;
  progressSegments.innerHTML = "";
  const clampedCount = Math.max(1, Math.min(20, segmentCount));
  const segmentWidth = 100 / clampedCount;
  for (let i = 0; i < clampedCount; i += 1) {
    const segment = document.createElement("div");
    segment.style.width = `${segmentWidth}%`;
    segment.style.height = "100%";
    segment.style.background = "rgba(255,255,255,0.08)";
    segment.style.borderRight = i < clampedCount - 1 ? "1px solid rgba(255,255,255,0.08)" : "none";
    progressSegments.appendChild(segment);
  }
}

function seekProgress(clickEvent) {
  if (!progressBar || !currentSpeechText) return;
  const rect = progressBar.getBoundingClientRect();
  const clickX = Math.min(rect.width, Math.max(0, clickEvent.clientX - rect.left));
  const percent = rect.width ? clickX / rect.width : 0;
  const textLength = currentSpeechText.length;
  currentSpeechCharIndex = Math.round(textLength * percent);
  currentSpeechStartTime = Date.now() - (currentSpeechDuration * (currentSpeechCharIndex / Math.max(1, textLength)) * 1000);
  updateProgressDisplay();

  if (typeof window.speechSynthesis !== "undefined" && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    stopProgressTimer();
    progressBarActive = false;
    if (playToggleBtn) playToggleBtn.textContent = "►";
  }
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) {
    return panel;
  }

  panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.style.position = "absolute";
  panel.style.zIndex = "2147483647";
  panel.style.width = "min(500px, calc(100vw - 24px))";
  panel.style.maxWidth = "calc(100vw - 24px)";
  panel.style.minWidth = "320px";
  panel.style.minHeight = "220px";
  panel.style.maxHeight = "calc(100vh - 24px)";
  panel.style.background = "#fffdf9";
  panel.style.border = "1px solid #e8dccd";
  panel.style.borderRadius = "18px";
  panel.style.boxShadow = "0 14px 36px rgba(20, 16, 8, 0.22)";
  panel.style.padding = "14px 14px 94px";
  panel.style.fontFamily = "Segoe UI, Tahoma, sans-serif";
  panel.style.color = "#2a2117";
  panel.style.boxSizing = "border-box";
  panel.style.resize = "both";
  panel.style.overflow = "hidden";
  panel.dataset.autoSpeak = "false";

  panel.innerHTML = `
    <div id="sp-header" style="position:relative; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; cursor:move; user-select:none;">
      <strong style="font-size:15px;">Live Translation</strong>
      <div style="display:flex; gap:8px; align-items:center;">
        <button id="sp-settings-btn" style="border:none; background:transparent; color:#2a2117; font-size:18px; cursor:pointer; line-height:1;">⚙</button>
        <button id="sp-close-btn" style="border:none; background:transparent; color:#2a2117; font-size:18px; cursor:pointer; line-height:1;">×</button>
      </div>
    </div>
    <div id="sp-settings-menu" style="display:none; position:absolute; top:44px; right:14px; width:260px; border:1px solid #e8dccd; border-radius:14px; background:#fff; color:#2a2117; box-shadow:0 12px 30px rgba(0,0,0,0.14); padding:14px; z-index:2147483648;">
      <div id="sp-settings-handle" style="cursor:move; user-select:none; display:flex; justify-content:space-between; align-items:center; gap:8px; margin:-14px -14px 10px; padding:10px 14px 8px; border-bottom:1px solid rgba(232,220,205,0.9); background:rgba(255,255,255,0.95); border-top-left-radius:14px; border-top-right-radius:14px; position:relative; z-index:2;">
        <span style="font-size:12px; font-weight:700; color:#5a4a3f;">Settings</span>
        <span style="font-size:12px; color:#5a4a3f;">⇅</span>
      </div>
      <div style="font-size:12px; font-weight:700; margin-bottom:10px;">View mode</div>
      <label style="display:flex; justify-content:space-between; align-items:center; gap:12px; background:#f6f3ef; border-radius:12px; padding:10px; cursor:pointer;">
        <span style="font-size:12px; color:#5a4a3f;">Advanced</span>
        <input id="sp-mode-toggle" type="checkbox" checked style="width:40px; height:20px; accent-color:#b63e2e; cursor:pointer;" />
        <span style="font-size:12px; color:#5a4a3f;">Simple</span>
      </label>
      <div style="font-size:11px; color:#5a4a3f; margin-top:10px;">Advanced enables full media controls and custom sizing. Simple switches to thin mode with no media controls.</div>
      <div style="margin-top:16px;">
        <div style="font-size:12px; font-weight:700; margin-bottom:10px;">Audio</div>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <label style="font-size:12px; color:#5a4a3f; min-width:50px;">Speed</label>
          <input id="sp-speed" type="range" min="0.2" max="1.0" step="0.1" value="1.0" style="flex:1;" />
          <span id="sp-speed-value" style="font-size:12px; color:#5a4a3f; min-width:36px; text-align:right;">1.0×</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <label style="font-size:12px; color:#5a4a3f; min-width:50px;">Volume</label>
          <input id="sp-volume" type="range" min="0" max="100" step="1" value="100" style="flex:1;" />
          <span id="sp-volume-value" style="font-size:12px; color:#5a4a3f; min-width:36px; text-align:right;">100%</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <label style="font-size:12px; color:#5a4a3f; min-width:50px;">Smoothness</label>
          <input id="sp-smoothness" type="range" min="1" max="20" step="1" value="10" style="flex:1;" />
          <span id="sp-smoothness-value" style="font-size:12px; color:#5a4a3f; min-width:36px; text-align:right;">10</span>
        </div>
      </div>
    </div>
    <div id="sp-body" style="display:flex; flex-direction:column; gap:10px; overflow:hidden;">
      <textarea id="sp-input" placeholder="Enter Spanish text here" style="width:100%; min-height:108px; max-height:calc(100vh - 320px); border:1px solid #e8dccd; border-radius:16px; padding:12px; resize:vertical; font-size:14px; line-height:1.6; background:#fff; box-sizing:border-box; overflow:auto;"></textarea>
      <div id="sp-controls" style="display:grid; gap:10px;">
        <div id="sp-progress-wrapper" style="display:flex; flex-direction:column; gap:6px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <button id="sp-playtoggle-btn" style="width:34px; height:34px; border:none; border-radius:50%; background:#b63e2e; color:#fff; font-size:16px; cursor:pointer;">►</button>
            <div id="sp-progress-bar" style="position:relative; flex:1; height:10px; border-radius:999px; background:#e8dccd; cursor:pointer; overflow:hidden;">
              <div id="sp-progress-segments" style="position:absolute; inset:0; display:grid; grid-template-columns:repeat(10, 1fr); pointer-events:none; z-index:1;"></div>
              <div id="sp-progress-fill" style="position:absolute; left:0; top:0; height:100%; width:0%; background:#b63e2e; transition:width 0.1s linear; z-index:2;"></div>
              <div id="sp-progress-dot" style="position:absolute; top:50%; left:0%; width:14px; height:14px; border-radius:50%; background:#fff; border:2px solid #b63e2e; transform:translate(-50%, -50%); pointer-events:none; z-index:3;"></div>
            </div>
            <span id="sp-progress-time" style="font-size:12px; color:#5a4a3f; min-width:72px; text-align:right;">0:00 / 0:00</span>
          </div>
        </div>
      </div>
    </div>
    <div id="sp-footer" style="position:absolute; left:0; right:0; bottom:0; border-radius:0 0 18px 18px; background:#b63e2e; color:#fff; padding:16px 18px 20px; box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <div style="font-size:11px; letter-spacing:0.24em; text-transform:uppercase; opacity:0.85;">English</div>
        <button id="sp-blur-btn" style="border:none; background:rgba(255,255,255,0.18); color:#fff; border-radius:999px; padding:6px 12px; cursor:pointer; font-size:12px;">Blur</button>
      </div>
      <div id="sp-output" style="margin-top:8px; font-size:14px; line-height:1.6; white-space:pre-wrap; word-break:break-word; max-height:120px; overflow:auto;"></div>
    </div>
    <div id="sp-status" style="font-size:12px; color:#8d3a2b; margin-top:10px; min-height:18px;"></div>
  `;

  document.body.appendChild(panel);

  panel.querySelector("#sp-close-btn")?.addEventListener("click", () => {
    panel?.remove();
  });

  const settingsBtn = panel.querySelector("#sp-settings-btn");
  const settingsMenu = panel.querySelector("#sp-settings-menu");
  const settingsHandle = panel.querySelector("#sp-settings-handle");
  const modeToggle = panel.querySelector("#sp-mode-toggle");
  const controlsSection = panel.querySelector("#sp-controls");
  const blurBtn = panel.querySelector("#sp-blur-btn");

  function applyMode(mode) {
    if (mode === "simple") {
      panel.style.width = WINDOW_SIZE_PRESETS.thin.width;
      panel.style.height = WINDOW_SIZE_PRESETS.thin.height;
      panel.style.resize = "none";
      if (controlsSection) controlsSection.style.display = "none";
      if (blurBtn) blurBtn.style.display = "none";
    } else {
      panel.style.width = "min(500px, calc(100vw - 24px))";
      panel.style.height = "auto";
      panel.style.resize = "both";
      if (controlsSection) controlsSection.style.display = "grid";
      if (blurBtn) blurBtn.style.display = "inline-flex";
    }
  }

  applyMode("advanced");

  modeToggle?.addEventListener("change", () => {
    applyMode(modeToggle.checked ? "advanced" : "simple");
  });

  settingsBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!settingsMenu) return;
    settingsMenu.style.display = settingsMenu.style.display === "none" ? "block" : "none";
  });

  if (settingsHandle && settingsMenu) {
    let settingsDragActive = false;
    let settingsStartX = 0;
    let settingsStartY = 0;
    let menuStartLeft = 0;
    let menuStartTop = 0;

    settingsHandle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (!settingsMenu) return;
      settingsDragActive = true;
      settingsMenu.setPointerCapture(event.pointerId);
      const rect = settingsMenu.getBoundingClientRect();
      menuStartLeft = rect.left;
      menuStartTop = rect.top;
      settingsStartX = event.clientX;
      settingsStartY = event.clientY;

      const onMove = (moveEvent) => {
        if (!settingsDragActive || !settingsMenu) return;
        const deltaX = moveEvent.clientX - settingsStartX;
        const deltaY = moveEvent.clientY - settingsStartY;
        settingsMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - settingsMenu.offsetWidth - 8, menuStartLeft + deltaX))}px`;
        settingsMenu.style.top = `${Math.max(8, Math.min(window.innerHeight - settingsMenu.offsetHeight - 8, menuStartTop + deltaY))}px`;
        settingsMenu.style.right = "auto";
      };

      const onUp = () => {
        settingsDragActive = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  document.addEventListener("click", (event) => {
    if (!settingsMenu || event.target instanceof Node && settingsMenu.contains(event.target)) return;
    if (settingsMenu.style.display === "block") {
      settingsMenu.style.display = "none";
    }
  });

  const header = panel.querySelector("#sp-header");
  header?.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button,select,textarea,label")) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const startOffsetX = event.clientX - rect.left;
    const startOffsetY = event.clientY - rect.top;

    const onMove = (moveEvent) => {
      const maxLeft = window.scrollX + window.innerWidth - panel.offsetWidth - 8;
      const maxTop = window.scrollY + window.innerHeight - panel.offsetHeight - 8;
      const left = Math.max(window.scrollX + 8, Math.min(moveEvent.clientX + window.scrollX - startOffsetX, maxLeft));
      const top = Math.max(window.scrollY + 8, Math.min(moveEvent.clientY + window.scrollY - startOffsetY, maxTop));

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  const input = panel.querySelector("#sp-input");
  input.addEventListener("input", () => translateNow(panel));

  playToggleBtn = panel.querySelector("#sp-playtoggle-btn");
  progressBar = panel.querySelector("#sp-progress-bar");
  progressSegments = panel.querySelector("#sp-progress-segments");
  progressFill = panel.querySelector("#sp-progress-fill");
  progressDot = panel.querySelector("#sp-progress-dot");
  progressTime = panel.querySelector("#sp-progress-time");
  speedInput = panel.querySelector("#sp-speed");
  speedValue = panel.querySelector("#sp-speed-value");
  volumeInput = panel.querySelector("#sp-volume");
  volumeValue = panel.querySelector("#sp-volume-value");
  smoothnessInput = panel.querySelector("#sp-smoothness");
  smoothnessValue = panel.querySelector("#sp-smoothness-value");
  output = panel.querySelector("#sp-output");

  let progressDragActive = false;

  const progressDragMove = (event) => {
    if (!progressDragActive) return;
    seekProgress(event);
  };

  const progressDragEnd = () => {
    progressDragActive = false;
    window.removeEventListener("pointermove", progressDragMove);
    window.removeEventListener("pointerup", progressDragEnd);
  };

  progressBar?.addEventListener("click", seekProgress);
  progressBar?.addEventListener("pointerdown", (event) => {
    if (event.pressure === 0) return;
    event.preventDefault();
    seekProgress(event);
    progressDragActive = true;
    window.addEventListener("pointermove", progressDragMove);
    window.addEventListener("pointerup", progressDragEnd);
  });

  playToggleBtn?.addEventListener("click", () => {
    if (typeof window.speechSynthesis === "undefined") return;
    if (window.speechSynthesis.speaking) {
      refreshProgressPosition();
      window.speechSynthesis.cancel();
      stopProgressTimer();
      playToggleBtn.textContent = "►";
      progressBarActive = false;
      return;
    }

    const text = input?.value.trim() || "";
    if (!text) return;
    speakText(text, currentSpeechCharIndex);
    playToggleBtn.textContent = "❚❚";
  });

  speedInput?.addEventListener("input", () => {
    currentSpeechRate = Math.min(1.0, Math.max(0.2, Number(speedInput.value)));
    if (speedValue) speedValue.textContent = `${currentSpeechRate.toFixed(1)}×`;
    if (typeof window.speechSynthesis !== "undefined" && window.speechSynthesis.speaking) {
      const text = input?.value.trim() || "";
      window.speechSynthesis.cancel();
      speakText(text, currentSpeechCharIndex);
    }
  });

  volumeInput?.addEventListener("input", () => {
    const rawVolume = Number(volumeInput.value);
    currentVolume = Math.min(1, Math.max(0, rawVolume / 100));
    if (volumeValue) volumeValue.textContent = `${Math.round(rawVolume)}%`;
  });

  smoothnessInput?.addEventListener("input", () => {
    currentProgressSmoothness = Math.min(20, Math.max(1, Number(smoothnessInput.value)));
    if (smoothnessValue) smoothnessValue.textContent = `${currentProgressSmoothness}`;
    rebuildProgressSegments(currentProgressSmoothness);
  });

  rebuildProgressSegments(currentProgressSmoothness);

  blurBtn?.addEventListener("click", () => {
    blurEnabled = !blurEnabled;
    if (output) {
      output.style.filter = blurEnabled ? "blur(6px)" : "none";
    }
    blurBtn.textContent = blurEnabled ? "Unblur" : "Blur";
  });

  return panel;
}

function setPanelText(panel, text) {
  const input = panel.querySelector("#sp-input");
  input.value = text;
}

function setPanelStatus(panel, message) {
  const status = panel.querySelector("#sp-status");
  status.textContent = message;
}

function speakText(text, startIndex = 0) {
  if (!text || typeof window.speechSynthesis === "undefined") {
    return;
  }

  currentSpeechText = text;
  currentSpeechCharIndex = Math.min(text.length, Math.max(0, startIndex));
  currentSpeechDuration = Math.max(1, text.length / 15);
  currentSpeechStartTime = Date.now() - (currentSpeechDuration * (currentSpeechCharIndex / Math.max(1, text.length)) * 1000);
  updateProgressDisplay();

  if (currentUtterance) {
    window.speechSynthesis.cancel();
  }
  stopProgressTimer();

  // Keep currentSpeechStartTime aligned with the resume position so the progress pin does not jump.
  currentSpeechStartTime = Date.now() - (currentSpeechDuration * (currentSpeechCharIndex / Math.max(1, text.length)) * 1000);

  const utterance = new SpeechSynthesisUtterance(text.slice(currentSpeechCharIndex));
  utterance.lang = "es-ES";
  const spanishVoice = getSpanishVoice();
  if (spanishVoice) {
    utterance.voice = spanishVoice;
  }
  utterance.rate = currentSpeechRate;
  utterance.volume = currentVolume;
  utterance.onend = () => {
    currentUtterance = null;
    stopProgressTimer();
    progressBarActive = false;
    currentSpeechCharIndex = currentSpeechText.length;
    updateProgressDisplay();
  };
  currentUtterance = utterance;
  progressBarActive = true;
  window.speechSynthesis.speak(utterance);
  startProgressTimer();
}

function translateNow(panel) {
  const source = "es";
  const target = "en";
  const input = panel.querySelector("#sp-input").value.trim();
  const output = panel.querySelector("#sp-output");

  if (!input) {
    output.textContent = "";
    setPanelStatus(panel, "");
    return;
  }

  setPanelStatus(panel, "Translating...");
  chrome.runtime.sendMessage(
    {
      type: "translate_text",
      text: input,
      source,
      target,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        setPanelStatus(panel, "Translation failed.");
        return;
      }

      if (!response?.ok) {
        setPanelStatus(panel, response?.error || "Translation failed.");
        return;
      }

      output.textContent = response.translatedText || "";
      setPanelStatus(panel, "");

      if (panel.dataset.autoSpeak === "true") {
        speakText(input);
        panel.dataset.autoSpeak = "false";
      }
    }
  );
}

function openTranslatePanel(initialText) {
  const panel = ensurePanel();
  panel.dataset.autoSpeak = "true";
  const anchor = getSelectionAnchor();
  panel.style.left = `${anchor.x}px`;
  panel.style.top = `${anchor.y}px`;
  setPanelText(panel, initialText || "");
  translateNow(panel);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "open_translate_box") {
    return;
  }

  openTranslatePanel(message.text || "");
});
}

