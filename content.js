/**
 * Spanish Live Translation — Content Script
 *
 * Injects a floating translation panel into host pages using Shadow DOM
 * isolation. Highlighted Spanish text is translated to English in real-time
 * and can be read aloud via the Web Speech API.
 *
 * @file content.js
 */

if (window.__spTranslatorLoaded) {
  // Avoid duplicate listeners when background reinjects this script.
} else {
  window.__spTranslatorLoaded = true;

/* ============================================================
   Constants
   ============================================================ */

const PANEL_ID = "sp-translate-panel";
const HOST_ID = "sp-translate-host";

/* ============================================================
   Icons & UI Constants
   ============================================================ */

const ICON_PLAY = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
const ICON_REPLAY = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;

function setPlayState(btn, state) {
  if (!btn) return;
  btn.dataset.state = state;
  if (state === "play") btn.innerHTML = ICON_PLAY;
  if (state === "pause") btn.innerHTML = ICON_PAUSE;
  if (state === "replay") btn.innerHTML = ICON_REPLAY;
}

/* ============================================================
   Speech & Playback State
   ============================================================ */

/** @type {number} Current speech rate (0.2–1.0). */
let currentSpeechRate = 1;

/** @type {number} Current volume (0–1). */
let currentVolume = 1;

/** @type {boolean} Whether the English output is blurred. */
let blurEnabled = true;

/** @type {SpeechSynthesisUtterance|null} Active utterance reference. */
let currentUtterance = null;

/** @type {string} Full text being spoken. */
let currentSpeechText = "";

/** @type {number} Character index the playback has reached. */
let currentSpeechCharIndex = 0;

/** @type {number} Estimated total duration of the current utterance (seconds). */
let currentSpeechDuration = 0;

/** @type {number} Timestamp (ms) when playback started/resumed. */
let currentSpeechStartTime = 0;

/** @type {number|null} requestAnimationFrame handle for progress updates. */
let currentSpeechTimer = null;

/** @type {boolean} Whether the progress bar animation loop is running. */
let progressBarActive = false;

/** @type {number} Number of visual segments in the progress bar. */
let currentProgressSmoothness = 10;

/** @type {boolean} Whether audio should auto-play on open. */
let currentAutoPlay = true;

/** @type {string} Current theme accent color. */
let currentThemeColor = "#961414";
/** @type {string} Computed dark shade for gradients. */
let currentThemeColorDark = darkenHex("#961414", 15);

/** Helper to darken a hex color by a percentage (0-100) */
function darkenHex(hex, percent) {
  hex = hex.replace(/^\s*#|\s*$/g, '');
  if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
  let r = parseInt(hex.substr(0, 2), 16),
      g = parseInt(hex.substr(2, 2), 16),
      b = parseInt(hex.substr(4, 2), 16);
  r = Math.floor(r * (100 - percent) / 100);
  g = Math.floor(g * (100 - percent) / 100);
  b = Math.floor(b * (100 - percent) / 100);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToRgba(hex, alpha) {
  hex = hex.replace(/^\s*#|\s*$/g, '');
  if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
  let r = parseInt(hex.substr(0, 2), 16),
      g = parseInt(hex.substr(2, 2), 16),
      b = parseInt(hex.substr(4, 2), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyThemeColorToPanel() {
  if (shadowRoot) {
    const panelEl = shadowRoot.getElementById(PANEL_ID);
    if (panelEl) {
      panelEl.style.setProperty("--sp-accent", currentThemeColor);
      panelEl.style.setProperty("--sp-accent-dark", currentThemeColorDark);
      panelEl.style.setProperty("--sp-accent-hover", currentThemeColorDark);
      panelEl.style.setProperty("--sp-accent-glow", hexToRgba(currentThemeColor, 0.35));
    }
  }
}

// Sync audio settings from extension popup
chrome.storage.local.get(["speechRate", "speechVolume", "autoPlay", "themeColor"], (res) => {
  if (res.speechRate !== undefined) currentSpeechRate = res.speechRate;
  if (res.speechVolume !== undefined) currentVolume = res.speechVolume;
  if (res.autoPlay !== undefined) currentAutoPlay = res.autoPlay;
  if (res.themeColor) {
    currentThemeColor = res.themeColor;
    currentThemeColorDark = darkenHex(currentThemeColor, 15);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.speechRate) currentSpeechRate = changes.speechRate.newValue;
    if (changes.speechVolume) currentVolume = changes.speechVolume.newValue;
    if (changes.autoPlay) currentAutoPlay = changes.autoPlay.newValue;
    if (changes.themeColor) {
      currentThemeColor = changes.themeColor.newValue;
      currentThemeColorDark = darkenHex(currentThemeColor, 15);
      applyThemeColorToPanel();
    }
    
    // If speaking, restart to apply new audio settings
    if (typeof window.speechSynthesis !== "undefined" && window.speechSynthesis.speaking &&
        (changes.speechRate || changes.speechVolume)) {
      if (shadowRoot) {
        const input = shadowRoot.querySelector("#sp-input");
        const text = input?.textContent.trim() || "";
        window.speechSynthesis.cancel();
        if (text) {
          // Restart playback from current position
          speakText(text, currentSpeechCharIndex);
        }
      }
    }
  }
});

/* ============================================================
   Cached DOM References (set when panel is created)
   ============================================================ */

/** @type {HTMLButtonElement|null} */
let playToggleBtn = null;
/** @type {HTMLDivElement|null} */
let progressBar = null;
/** @type {HTMLDivElement|null} */
let progressSegments = null;
/** @type {HTMLDivElement|null} */
let progressFill = null;
/** @type {HTMLDivElement|null} */
let progressDot = null;
/** @type {HTMLSpanElement|null} */
let progressTime = null;
/** @type {HTMLInputElement|null} */
let speedInput = null;
/** @type {HTMLSpanElement|null} */
let speedValue = null;
/** @type {HTMLInputElement|null} */
let volumeInput = null;
/** @type {HTMLSpanElement|null} */
let volumeValue = null;
/** @type {HTMLInputElement|null} */
let smoothnessInput = null;
/** @type {HTMLSpanElement|null} */
let smoothnessValue = null;
/** @type {HTMLDivElement|null} */
let outputEl = null;
/** @type {ShadowRoot|null} */
let shadowRoot = null;

/* ============================================================
   Utility Functions
   ============================================================ */

/**
 * Computes an ideal screen position for the panel near the user's
 * current text selection.
 * @returns {{ x: number, y: number }} Absolute page coordinates.
 */
function getSelectionAnchor() {
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

/**
 * Finds the best available Spanish voice for speech synthesis.
 * @returns {SpeechSynthesisVoice|null}
 */
function getSpanishVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("es")) ||
    voices.find((v) => v.name.toLowerCase().includes("spanish")) ||
    voices.find((v) => v.name.toLowerCase().includes("es")) ||
    null
  );
}

/**
 * Pads a number to two digits.
 * @param {number} value
 * @returns {string}
 */
function pad(value) {
  return String(value).padStart(2, "0");
}

/* ============================================================
   Progress Bar Engine
   ============================================================ */

/** Updates the visual state of the progress bar, scrub dot, and time display. */
function updateProgressDisplay() {
  if (!progressFill || !progressDot || !progressTime) return;

  const textLength = currentSpeechText.length || 1;
  const percent = currentSpeechDuration
    ? Math.min(100, Math.max(0, (currentSpeechCharIndex / textLength) * 100))
    : 0;

  progressFill.style.width = `${percent}%`;
  progressDot.style.left = `${percent}%`;

  const elapsedSeconds = Math.floor((currentSpeechDuration || 0) * (percent / 100));
  const totalSeconds = Math.floor(currentSpeechDuration || 0);

  progressTime.textContent =
    `${Math.floor(elapsedSeconds / 60)}:${pad(elapsedSeconds % 60)} / ` +
    `${Math.floor(totalSeconds / 60)}:${pad(totalSeconds % 60)}`;

  // Highlight predicted spoken word (sliding line)
  if (shadowRoot) {
    const input = shadowRoot.querySelector("#sp-input");
    if (input) {
      const words = input.querySelectorAll(".sp-word");
      const predictLine = input.querySelector("#sp-predict-line");
      
      if (progressBarActive && percent < 100 && predictLine) {
        let activeIndex = -1;
        for (let i = 0; i < words.length; i++) {
          const start = parseInt(words[i].dataset.start, 10);
          const end = parseInt(words[i].dataset.end, 10);
          if (currentSpeechCharIndex >= start && currentSpeechCharIndex <= end) {
            activeIndex = i;
            break;
          }
        }
        if (activeIndex === -1) {
          for (let i = 0; i < words.length; i++) {
            const start = parseInt(words[i].dataset.start, 10);
            if (currentSpeechCharIndex < start) {
              activeIndex = i;
              break;
            }
          }
        }

        if (activeIndex !== -1) {
          let startIndex = Math.max(0, activeIndex - 1);
          let endIndex = Math.min(words.length - 1, activeIndex + 1);
          
          const activeWord = words[activeIndex];
          while (startIndex < activeIndex && words[startIndex].offsetTop !== activeWord.offsetTop) {
            startIndex++;
          }
          while (endIndex > activeIndex && words[endIndex].offsetTop !== activeWord.offsetTop) {
            endIndex--;
          }
          
          const startWord = words[startIndex];
          const endWord = words[endIndex];
          
          const left = startWord.offsetLeft;
          const width = (endWord.offsetLeft + endWord.offsetWidth) - left;
          const top = activeWord.offsetTop + activeWord.offsetHeight;
          
          predictLine.style.transform = `translate(${left}px, ${top}px)`;
          predictLine.style.width = `${width}px`;
          predictLine.style.opacity = "1";
        } else {
          predictLine.style.opacity = "0";
        }
      } else if (predictLine) {
        predictLine.style.opacity = "0";
      }
    }
  }
}

/**
 * Starts the requestAnimationFrame loop that drives the progress bar.
 * Automatically stops itself when playback reaches 100%.
 */
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
      if (playToggleBtn) setPlayState(playToggleBtn, "replay");
      if (progressDot) progressDot.classList.remove("sp-active");
      return;
    }

    currentSpeechTimer = window.requestAnimationFrame(tick);
  };

  currentSpeechTimer = window.requestAnimationFrame(tick);
}

/** Cancels the progress animation loop. */
function stopProgressTimer() {
  if (currentSpeechTimer !== null) {
    window.cancelAnimationFrame(currentSpeechTimer);
    currentSpeechTimer = null;
  }
}

/** Recalculates the current progress position from wall-clock time. */
function refreshProgressPosition() {
  if (!currentSpeechDuration || !currentSpeechText) return;

  const elapsed = (Date.now() - currentSpeechStartTime) / 1000;
  const percent = Math.min(1, Math.max(0, elapsed / currentSpeechDuration));
  currentSpeechCharIndex = Math.round(currentSpeechText.length * percent);
  updateProgressDisplay();
}

/**
 * Rebuilds the decorative segment dividers inside the progress bar.
 * @param {number} segmentCount Number of segments (1–20).
 */
function rebuildProgressSegments(segmentCount) {
  if (!progressSegments) return;

  progressSegments.innerHTML = "";
  const clamped = Math.max(1, Math.min(10, segmentCount));
  progressSegments.style.gridTemplateColumns = `repeat(${clamped}, 1fr)`;

  for (let i = 0; i < clamped; i++) {
    const seg = document.createElement("div");
    seg.className = "sp-progress-segment";
    progressSegments.appendChild(seg);
  }
}

/**
 * Seeks the progress bar to the position the user clicked.
 * Stops active speech so the user must press play to resume.
 * @param {PointerEvent|MouseEvent} clickEvent
 */
function seekProgress(clickEvent) {
  if (!progressBar || !currentSpeechText) return;

  const rect = progressBar.getBoundingClientRect();
  const clickX = Math.min(rect.width, Math.max(0, clickEvent.clientX - rect.left));
  const percent = rect.width ? clickX / rect.width : 0;
  const textLength = currentSpeechText.length;

  currentSpeechCharIndex = Math.round(textLength * percent);
  currentSpeechStartTime =
    Date.now() - currentSpeechDuration * (currentSpeechCharIndex / Math.max(1, textLength)) * 1000;
  updateProgressDisplay();

  if (typeof window.speechSynthesis !== "undefined" && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    stopProgressTimer();
    progressBarActive = false;
    if (playToggleBtn) setPlayState(playToggleBtn, "play");
    if (progressDot) progressDot.classList.remove("sp-active");
  }
}

/** Resets all progress state. Called when new text is loaded. */
function resetProgress(text = "") {
  stopProgressTimer();
  if (typeof window.speechSynthesis !== "undefined" && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }

  currentSpeechText = text;
  currentSpeechCharIndex = 0;
  currentSpeechDuration = text ? Math.max(1, text.length / 15) : 0;
  currentSpeechStartTime = 0;
  currentUtterance = null;
  progressBarActive = false;

  if (playToggleBtn) setPlayState(playToggleBtn, "play");
  if (progressDot) progressDot.classList.remove("sp-active");
  updateProgressDisplay();
}

/* ============================================================
   Speech Synthesis
   ============================================================ */

/**
 * Speaks the given text aloud in Spanish, optionally resuming from
 * a character offset.
 * @param {string} text  Full text to speak.
 * @param {number} [startIndex=0] Character index to resume from.
 */
function speakText(text, startIndex = 0) {
  if (!text || typeof window.speechSynthesis === "undefined") return;

  currentSpeechText = text;
  currentSpeechCharIndex = Math.min(text.length, Math.max(0, startIndex));
  currentSpeechDuration = Math.max(1, text.length / 15);

  // Align start time so the progress bar matches the resume position.
  currentSpeechStartTime =
    Date.now() - currentSpeechDuration * (currentSpeechCharIndex / Math.max(1, text.length)) * 1000;

  updateProgressDisplay();

  if (currentUtterance) {
    window.speechSynthesis.cancel();
  }
  stopProgressTimer();

  const utterance = new SpeechSynthesisUtterance(text.slice(currentSpeechCharIndex));
  utterance.lang = "es-ES";

  const spanishVoice = getSpanishVoice();
  if (spanishVoice) utterance.voice = spanishVoice;

  utterance.rate = currentSpeechRate;
  utterance.volume = currentVolume;

  utterance.onend = () => {
    currentUtterance = null;
    stopProgressTimer();
    progressBarActive = false;
    currentSpeechCharIndex = currentSpeechText.length;
    updateProgressDisplay();
    if (playToggleBtn) playToggleBtn.textContent = "↻";
    if (progressDot) progressDot.classList.remove("sp-active");
  };

  currentUtterance = utterance;
  progressBarActive = true;
  if (progressDot) progressDot.classList.add("sp-active");
  window.speechSynthesis.speak(utterance);
  startProgressTimer();
}

/* ============================================================
   Panel HTML Template
   ============================================================ */

/**
 * Returns the panel's inner HTML using CSS class names instead of
 * inline styles. All styling lives in panel.css.
 * @returns {string}
 */
function getPanelHTML() {
  return `
    <div class="sp-header" id="sp-header" style="justify-content: flex-end;">
      <div class="sp-header-actions">
        <button class="sp-header-btn" id="sp-close-btn" title="Close (Esc)">✕</button>
      </div>
    </div>

    <div class="sp-body" id="sp-body">
      <div class="sp-input-label">Spanish · Source</div>
      <div class="sp-input" id="sp-input" data-placeholder="Highlight text on the page to translate…"></div>
      <div class="sp-controls">
        <button class="sp-play-btn" id="sp-playtoggle-btn" disabled title="Play / Pause" data-state="play">${ICON_PLAY}</button>
        <div class="sp-progress-bar" id="sp-progress-bar">
          <div class="sp-progress-track">
            <div class="sp-progress-segments" id="sp-progress-segments"></div>
            <div class="sp-progress-fill" id="sp-progress-fill"></div>
          </div>
          <div class="sp-progress-dot" id="sp-progress-dot"></div>
        </div>
        <span class="sp-progress-time" id="sp-progress-time">0:00 / 0:00</span>
      </div>
    </div>

    <div class="sp-status" id="sp-status">
      <span class="sp-status-dot"></span>
      <span class="sp-status-text"></span>
    </div>

    <div class="sp-footer">
      <div class="sp-footer-header">
        <span class="sp-footer-label">English</span>
        <div class="sp-footer-actions">
          <button class="sp-footer-btn" id="sp-blur-btn">👁 Unblur</button>
        </div>
      </div>
      <div class="sp-output sp-blurred" id="sp-output"></div>
      <div class="sp-show-more" id="sp-show-more" style="display: none;">
        <div class="sp-show-more-line"></div>
      </div>
    </div>
  `;
}

/* ============================================================
   Panel Creation & Shadow DOM
   ============================================================ */

/**
 * Creates the panel (if it doesn't exist) inside a Shadow DOM host
 * to isolate styles from the host page. Returns the panel element
 * inside the shadow root.
 * @returns {HTMLDivElement} The .sp-panel element.
 */
function ensurePanel() {
  let host = document.getElementById(HOST_ID);
  if (host && host.shadowRoot) {
    const existing = host.shadowRoot.getElementById(PANEL_ID);
    if (existing) return existing;
  }

  // Create shadow host
  host = document.createElement("div");
  host.id = HOST_ID;
  host.style.position = "absolute";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "0";
  host.style.height = "0";
  host.style.overflow = "visible";
  host.style.zIndex = "2147483647";
  document.body.appendChild(host);

  shadowRoot = host.attachShadow({ mode: "open" });

  // Inject stylesheet
  const cssURL = chrome.runtime.getURL("panel.css");
  const linkEl = document.createElement("link");
  linkEl.rel = "stylesheet";
  linkEl.href = cssURL;
  shadowRoot.appendChild(linkEl);

  // Create panel
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = "sp-panel";
  panel.dataset.autoSpeak = "false";
  panel.setAttribute("tabindex", "-1");
  panel.innerHTML = getPanelHTML();
  shadowRoot.appendChild(panel);
  
  applyThemeColorToPanel();

  // ── Wire up event listeners ─────────────────────────────

  const $ = (sel) => panel.querySelector(sel);

  // Close button
  $("#sp-close-btn")?.addEventListener("click", () => closePanel());

  // Panel drag via header
  const header = $("#sp-header");
  header?.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;

    const rect = panel.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const onMove = (ev) => {
      const maxLeft = window.scrollX + window.innerWidth - panel.offsetWidth - 8;
      const maxTop = window.scrollY + window.innerHeight - panel.offsetHeight - 8;
      panel.style.left = `${Math.max(window.scrollX + 8, Math.min(ev.clientX + window.scrollX - offsetX, maxLeft))}px`;
      panel.style.top = `${Math.max(window.scrollY + 8, Math.min(ev.clientY + window.scrollY - offsetY, maxTop))}px`;
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  // Show more toggle
  const showMoreBtn = $("#sp-show-more");
  showMoreBtn?.addEventListener("click", () => {
    const output = $("#sp-output");
    if (output) {
      output.classList.add("sp-expanded");
      showMoreBtn.style.display = "none";
    }
  });

  // Cache DOM refs
  const input = $("#sp-input");
  playToggleBtn = $("#sp-playtoggle-btn");

  // Word click listener for individual TTS
  input?.addEventListener("click", (e) => {
    const target = e.target;
    if (target.classList.contains("sp-word")) {
      // Highlight word
      const allWords = input.querySelectorAll(".sp-word");
      allWords.forEach(w => w.classList.remove("sp-highlighted"));
      target.classList.add("sp-highlighted");

      // Speak just this word without affecting main progress
      if (typeof window.speechSynthesis !== "undefined") {
        const utterance = new SpeechSynthesisUtterance(target.textContent);
        utterance.lang = "es-ES";
        const spanishVoice = getSpanishVoice();
        if (spanishVoice) utterance.voice = spanishVoice;
        utterance.rate = currentSpeechRate;
        utterance.volume = currentVolume;
        
        utterance.onend = () => {
          target.classList.remove("sp-highlighted");
        };
        window.speechSynthesis.speak(utterance);
      }
    }
  });
  progressBar = $("#sp-progress-bar");
  progressSegments = $("#sp-progress-segments");
  progressFill = $("#sp-progress-fill");
  progressDot = $("#sp-progress-dot");
  progressTime = $("#sp-progress-time");
  outputEl = $("#sp-output");

  const blurBtn = $("#sp-blur-btn");

  // Progress bar interaction — click + drag to seek
  let progressDragActive = false;

  const progressDragMove = (ev) => {
    if (!progressDragActive) return;
    seekProgress(ev);
  };

  const progressDragEnd = () => {
    progressDragActive = false;
    window.removeEventListener("pointermove", progressDragMove);
    window.removeEventListener("pointerup", progressDragEnd);
  };

  progressBar?.addEventListener("click", seekProgress);
  progressBar?.addEventListener("pointerdown", (e) => {
    if (e.pressure === 0) return;
    e.preventDefault();
    seekProgress(e);
    progressDragActive = true;
    window.addEventListener("pointermove", progressDragMove);
    window.addEventListener("pointerup", progressDragEnd);
  });

  // Play / Pause
  playToggleBtn?.addEventListener("click", () => {
    if (typeof window.speechSynthesis === "undefined") return;

    // If button shows Pause, stop playback
    if (playToggleBtn.dataset.state === "pause") {
      refreshProgressPosition();
      window.speechSynthesis.cancel();
      stopProgressTimer();
      setPlayState(playToggleBtn, "play");
      progressBarActive = false;
      if (progressDot) progressDot.classList.remove("sp-active");
      return;
    }

    // Otherwise, we want to play
    const text = input?.textContent.trim() || "";
    if (!text) return;
    
    // Always clear any buggy stalled speech
    window.speechSynthesis.cancel();
    
    if (currentSpeechCharIndex >= text.length || playToggleBtn.dataset.state === "replay") {
      currentSpeechCharIndex = 0;
    }
    
    speakText(text, currentSpeechCharIndex);
    setPlayState(playToggleBtn, "pause");
  });
  rebuildProgressSegments(currentProgressSmoothness);

  // Blur toggle
  blurBtn?.addEventListener("click", () => {
    blurEnabled = !blurEnabled;
    if (outputEl) outputEl.classList.toggle("sp-blurred", blurEnabled);
    if (blurBtn) blurBtn.textContent = blurEnabled ? "👁 Unblur" : "👁 Blur";
  });



  // Focus the panel for keyboard events
  panel.focus();

  // Track dimensions dynamically
  const dimensionsValue = $("#sp-dimensions-value");
  if (dimensionsValue) {
    const resizeObserver = new ResizeObserver(() => {
      dimensionsValue.textContent = `${panel.offsetWidth} × ${panel.offsetHeight}`;
    });
    resizeObserver.observe(panel);
  }

  return panel;
}

/* ============================================================
   Panel Helpers
   ============================================================ */

/**
 * Sets the source text in the panel input.
 * @param {HTMLDivElement} panel
 * @param {string} text
 */
function setPanelText(panel, text) {
  const input = panel.querySelector("#sp-input");
  if (input) {
    input.innerHTML = "";
    if (text) {
      let currentIndex = 0;
      const tokens = text.split(/(\s+)/);
      tokens.forEach(token => {
        if (/\S/.test(token)) {
          const span = document.createElement("span");
          span.className = "sp-word";
          span.dataset.start = currentIndex;
          span.dataset.end = currentIndex + token.length;
          span.textContent = token;
          input.appendChild(span);
        } else {
          input.appendChild(document.createTextNode(token));
        }
        currentIndex += token.length;
      });
      
      const predictLine = document.createElement("div");
      predictLine.id = "sp-predict-line";
      predictLine.className = "sp-predict-line";
      input.appendChild(predictLine);
    }
  }

  // Preload time estimation for UI
  currentSpeechText = text || "";
  currentSpeechCharIndex = 0;
  if (currentSpeechText) {
    currentSpeechDuration = Math.max(1, currentSpeechText.length / 15);
  } else {
    currentSpeechDuration = 0;
  }
  updateProgressDisplay();

  // Enable/disable play button based on content
  if (playToggleBtn) playToggleBtn.disabled = !text.trim();
}

/**
 * Displays a status message below the audio controls.
 * @param {HTMLDivElement} panel
 * @param {string} message
 */
function setPanelStatus(panel, message) {
  const statusEl = panel.querySelector("#sp-status");
  const textEl = statusEl?.querySelector(".sp-status-text");

  if (textEl) textEl.textContent = message;
  if (statusEl) {
    statusEl.classList.toggle("sp-active", !!message);
  }
}

/**
 * Closes and removes the panel, stopping any active speech.
 */
function closePanel() {
  if (typeof window.speechSynthesis !== "undefined" && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  stopProgressTimer();
  resetProgress("");

  const host = document.getElementById(HOST_ID);
  if (host) host.remove();

  // Clear cached refs
  shadowRoot = null;
  playToggleBtn = null;
  progressBar = null;
  progressSegments = null;
  progressFill = null;
  progressDot = null;
  progressTime = null;
  speedInput = null;
  speedValue = null;
  volumeInput = null;
  volumeValue = null;
  smoothnessInput = null;
  smoothnessValue = null;
  outputEl = null;
}

/* ============================================================
   Translation
   ============================================================ */

/**
 * Sends the panel's source text to the background script for
 * translation and displays the result.
 * @param {HTMLDivElement} panel
 */
function translateNow(panel) {
  const source = "es";
  const target = "en";
  const input = panel.querySelector("#sp-input")?.textContent.trim() || "";
  const output = panel.querySelector("#sp-output");

  if (!input) {
    if (output) output.textContent = "";
    setPanelStatus(panel, "");
    return;
  }

  // Reset playback when new text is loaded
  resetProgress(input);

  setPanelStatus(panel, "Translating…");

  chrome.runtime.sendMessage(
    { type: "translate_text", text: input, source, target },
    (response) => {
      if (chrome.runtime.lastError) {
        setPanelStatus(panel, "Translation failed.");
        return;
      }

      if (!response?.ok) {
        setPanelStatus(panel, response?.error || "Translation failed.");
        return;
      }

      if (output) {
        output.textContent = response.translatedText || "";
        output.classList.remove("sp-expanded"); // Reset expansion state
        
        // Wait for render to check overflow
        requestAnimationFrame(() => {
          const showMoreContainer = panel.querySelector("#sp-show-more");
          if (showMoreContainer) {
            // Check if scrollHeight is significantly larger than clientHeight
            if (output.scrollHeight > output.clientHeight + 2) {
              showMoreContainer.style.display = "flex";
            } else {
              showMoreContainer.style.display = "none";
            }
          }
        });
      }
      setPanelStatus(panel, "");

      // Enable play button now that we have text
      if (playToggleBtn) playToggleBtn.disabled = !input;

      if (panel.dataset.autoSpeak === "true") {
        speakText(input);
        panel.dataset.autoSpeak = "false";
      }
    }
  );
}

/* ============================================================
   Public Entry Point
   ============================================================ */

/**
 * Opens (or re-uses) the translation panel, positions it near the
 * current selection, and kicks off a translation.
 * @param {string} initialText Spanish text to translate.
 */
function openTranslatePanel(initialText) {
  const panel = ensurePanel();
  panel.dataset.autoSpeak = currentAutoPlay ? "true" : "false";
  const anchor = getSelectionAnchor();
  panel.style.left = `${anchor.x}px`;
  panel.style.top = `${anchor.y}px`;
  setPanelText(panel, initialText || "");
  translateNow(panel);
}

/* ============================================================
   Message Listener — background script sends selected text
   ============================================================ */

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "open_translate_box") return;
  openTranslatePanel(message.text || "");
});

/* ============================================================
   Live Selection Listener — updates panel as user highlights
   ============================================================ */

let selectionTimeout;

document.addEventListener("selectionchange", () => {
  const host = document.getElementById(HOST_ID);
  if (!host || !host.shadowRoot) return;

  const panel = host.shadowRoot.getElementById(PANEL_ID);
  if (!panel) return;

  if (selectionTimeout) clearTimeout(selectionTimeout);

  selectionTimeout = setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    // Ignore selections inside our own shadow host
    const range = selection.getRangeAt(0);
    if (host.contains(range.commonAncestorContainer)) return;

    const input = panel.querySelector("#sp-input");
    if (input && input.textContent !== selectedText) {
      setPanelText(panel, selectedText);
      translateNow(panel);
    }
  }, 200);
});

} // end guard
