const TRANSLATE_MENU_ID = "translate_selection";

async function openTranslatePanel(tabId, text) {
  try {
    // Inject first to guarantee a receiving listener exists.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (error) {
    console.error("[Spanish Translation] Could not inject translator UI:", error);
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "open_translate_box",
      text,
    });
  } catch (error) {
    console.error("[Spanish Translation] Could not open translator UI after injection:", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: TRANSLATE_MENU_ID,
      title: "Live Translation",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  const text = (info.selectionText || "").trim();
  if (!text) return;

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
      console.error("[Spanish Translation] Translation error:", error);
      sendResponse({ ok: false, error: "Translation failed." });
    });

  return true;
});

