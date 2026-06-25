const MENU_ID = "speak_spanish";
const TRANSLATE_MENU_ID = "translate_selection";
const TTS_MODE = "chrome-tts-es-mx";
const DEFAULT_SETTINGS = {
  volume: 1,
  genderMode: "both",
  speedMultiplier: 1
};

function getVoiceGender(voice) {
  const gender = (voice.gender || "").toLowerCase();
  const name = (voice.voiceName || "").toLowerCase();
  if (gender.includes("male") || /\bmale\b|\bhombre\b|\bmascul/.test(name)) {
    return "male";
  }
  if (gender.includes("female") || /\bfemale\b|\bmujer\b|\bfemen/.test(name)) {
    return "female";
  }
  return "unknown";
}

function pickVoiceForEsMx(voices, genderMode) {
  const targetGender =
    genderMode === "male" || genderMode === "female"
      ? genderMode
      : Math.random() < 0.5
        ? "male"
        : "female";
  const esMx = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("es-mx"));
  const esAny = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("es"));
  const candidates = esMx.length ? esMx : esAny;
  const genderMatches = candidates.filter((v) => getVoiceGender(v) === targetGender);
  const pool = genderMatches.length ? genderMatches : candidates;

  if (!pool.length) {
    return { voice: null, targetGender, resolvedGender: "unknown" };
  }

  const voice = pool[Math.floor(Math.random() * pool.length)];
  return { voice, targetGender, resolvedGender: getVoiceGender(voice) };
}

function speakSpanish(text) {
  if (TTS_MODE !== "chrome-tts-es-mx") {
    console.warn(`[Spanish Pronunciation] Unsupported mode: ${TTS_MODE}. Using chrome-tts-es-mx.`);
  }

  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    const genderMode = settings.genderMode === "male" || settings.genderMode === "female"
      ? settings.genderMode
      : "both";
    const volume = Math.max(0, Math.min(1, Number(settings.volume) || 1));
    const speedMultiplier = [1, 0.75, 0.5, 0.25].includes(Number(settings.speedMultiplier))
      ? Number(settings.speedMultiplier)
      : 1;
    const rate = 0.85 * speedMultiplier;

    chrome.tts.getVoices((voices) => {
      const { voice, targetGender, resolvedGender } = pickVoiceForEsMx(voices, genderMode);
      console.log(
        `[Spanish Pronunciation] mode=chrome-tts-es-mx genderMode=${genderMode} targetGender=${targetGender} resolvedGender=${resolvedGender} volume=${volume} speedMultiplier=${speedMultiplier} rate=${rate} voice=${voice?.voiceName || "default"}`
      );

      chrome.tts.speak(text, {
        lang: "es-MX",
        voiceName: voice?.voiceName,
        rate,
        volume,
        onEvent(e) {
          if (e.type === "error") {
            console.error("[TTS error]", e);
          }
        },
      });
    });
  });
}

async function openTranslatePanel(tabId, text) {
  try {
    // Inject first to guarantee a receiving listener exists.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (error) {
    console.error("[Spanish Pronunciation] Could not inject translator UI:", error);
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "open_translate_box",
      text,
    });
  } catch (error) {
    console.error("[Spanish Pronunciation] Could not open translator UI after injection:", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (existing) => {
    const next = {
      volume: typeof existing.volume === "number" ? existing.volume : DEFAULT_SETTINGS.volume,
      genderMode:
        existing.genderMode === "male" || existing.genderMode === "female" || existing.genderMode === "both"
          ? existing.genderMode
          : DEFAULT_SETTINGS.genderMode,
      speedMultiplier: [1, 0.75, 0.5, 0.25].includes(Number(existing.speedMultiplier))
        ? Number(existing.speedMultiplier)
        : DEFAULT_SETTINGS.speedMultiplier,
    };
    chrome.storage.sync.set(next);
  });

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Pronounce in Spanish",
      contexts: ["selection"],
    });

    chrome.contextMenus.create({
      id: TRANSLATE_MENU_ID,
      title: "Translate Selection",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  const text = (info.selectionText || "").trim();
  if (!text) return;

  if (info.menuItemId === MENU_ID) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (t) => console.log(`[Spanish Pronunciation] Captured and speaking: "${t}"`),
      args: [text],
    });
    speakSpanish(text);
    return;
  }

  if (info.menuItemId === TRANSLATE_MENU_ID) {
    openTranslatePanel(tab.id, text);
  }
});

async function translateWithGoogle(text, source, target) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", source);
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Translate request failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.[0]) ? data[0].map((chunk) => chunk?.[0] || "").join("") : "";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "translate_text") {
    return;
  }

  const text = typeof message.text === "string" ? message.text.trim() : "";
  const source = message.source === "es" ? "es" : "en";
  const target = message.target === "en" ? "en" : "es";

  if (!text) {
    sendResponse({ ok: true, translatedText: "" });
    return;
  }

  translateWithGoogle(text, source, target)
    .then((translatedText) => sendResponse({ ok: true, translatedText }))
    .catch((error) => {
      console.error("[Spanish Pronunciation] Translation error:", error);
      sendResponse({ ok: false, error: "Translation failed." });
    });

  return true;
});

