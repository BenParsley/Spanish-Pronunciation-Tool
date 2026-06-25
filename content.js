if (window.__spTranslatorLoaded) {
  // Avoid duplicate listeners when background reinjects this script.
} else {
  window.__spTranslatorLoaded = true;

const PANEL_ID = "sp-pronounce-translate-panel";

function isPinned(panel) {
  return panel.dataset.pinned === "true";
}

function setPinned(panel, pinned) {
  panel.dataset.pinned = pinned ? "true" : "false";
  const pinBtn = panel.querySelector("#sp-pin-btn");
  if (!pinBtn) return;
  pinBtn.textContent = pinned ? "Unpin" : "Pin";
  pinBtn.setAttribute("aria-pressed", pinned ? "true" : "false");
}

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

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) {
    return panel;
  }

  panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.style.position = "absolute";
  panel.style.zIndex = "2147483647";
  panel.style.width = "500px";
  panel.style.maxWidth = "calc(100vw - 24px)";
  panel.style.background = "#fffdf9";
  panel.style.border = "1px solid #e8dccd";
  panel.style.borderRadius = "12px";
  panel.style.boxShadow = "0 14px 36px rgba(20, 16, 8, 0.22)";
  panel.style.padding = "10px";
  panel.style.fontFamily = "Segoe UI, Tahoma, sans-serif";
  panel.style.color = "#2a2117";
  panel.dataset.pinned = "false";

  panel.innerHTML = `
    <div id="sp-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; cursor:move; user-select:none;">
      <strong style="font-size:13px;">Live Translation</strong>
      <div style="display:flex; gap:6px; align-items:center;">
        <button id="sp-pin-btn" style="border:1px solid #d7c8b2; background:#fff; border-radius:8px; padding:2px 8px; cursor:pointer;">Pin</button>
        <button id="sp-close-btn" style="border:1px solid #d7c8b2; background:#fff; border-radius:8px; padding:2px 8px; cursor:pointer;">x</button>
      </div>
    </div>
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <div style="display:flex; gap:6px; align-items:center;">
        <label for="sp-source" style="font-size:12px;">From</label>
        <select id="sp-source" style="padding:4px; border:1px solid #d7c8b2; border-radius:8px;">
          <option value="es">Spanish (Panama)</option>
          <option value="en">English</option>
        </select>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <label for="sp-target" style="font-size:12px;">To</label>
        <select id="sp-target" style="padding:4px; border:1px solid #d7c8b2; border-radius:8px;">
          <option value="en">English</option>
          <option value="es">Spanish (Panama)</option>
        </select>
      </div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
      <textarea id="sp-input" style="min-height:96px; border:1px solid #d7c8b2; border-radius:8px; padding:8px; resize:vertical;"></textarea>
      <textarea id="sp-output" readonly style="min-height:96px; border:1px solid #d7c8b2; border-radius:8px; padding:8px; resize:vertical; background:#fff;"></textarea>
    </div>
    <div id="sp-status" style="font-size:12px; color:#8d3a2b; margin-top:6px; min-height:16px;"></div>
  `;

  document.body.appendChild(panel);

  setPinned(panel, false);

  panel.querySelector("#sp-close-btn")?.addEventListener("click", () => {
    panel?.remove();
  });

  panel.querySelector("#sp-pin-btn")?.addEventListener("click", () => {
    setPinned(panel, !isPinned(panel));
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

  const source = panel.querySelector("#sp-source");
  const target = panel.querySelector("#sp-target");
  const input = panel.querySelector("#sp-input");

  function keepDirectionsValid(changed) {
    if (source.value === target.value) {
      if (changed === "source") {
        target.value = source.value === "en" ? "es" : "en";
      } else {
        source.value = target.value === "en" ? "es" : "en";
      }
    }
  }

  source.addEventListener("change", () => {
    keepDirectionsValid("source");
    translateNow(panel);
  });
  target.addEventListener("change", () => {
    keepDirectionsValid("target");
    translateNow(panel);
  });
  input.addEventListener("input", () => translateNow(panel));

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

function translateNow(panel) {
  const source = panel.querySelector("#sp-source").value;
  const target = panel.querySelector("#sp-target").value;
  const input = panel.querySelector("#sp-input").value.trim();
  const output = panel.querySelector("#sp-output");

  if (!input) {
    output.value = "";
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

      output.value = response.translatedText || "";
      setPanelStatus(panel, "");
    }
  );
}

function openTranslatePanel(initialText) {
  const panel = ensurePanel();
  const pinned = isPinned(panel);

  if (!pinned) {
    const anchor = getSelectionAnchor();
    panel.style.left = `${anchor.x}px`;
    panel.style.top = `${anchor.y}px`;
    setPanelText(panel, initialText || "");
    translateNow(panel);
    return;
  }

  // Pinned panels stay where they are and keep current text unless empty.
  const input = panel.querySelector("#sp-input");
  if (!input.value.trim() && initialText) {
    setPanelText(panel, initialText);
    translateNow(panel);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "open_translate_box") {
    return;
  }

  openTranslatePanel(message.text || "");
});

}
