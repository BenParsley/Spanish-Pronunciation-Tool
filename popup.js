/**
 * Popup Script — Spanish Live Translation Extension
 *
 * Displays the extension version from the manifest. The popup is an
 * informational page showing usage instructions and keyboard shortcuts.
 *
 * @file popup.js
 */

(function initPopup() {
  const versionEl = document.getElementById("version");
  if (versionEl) {
    const manifest = chrome.runtime.getManifest();
    if (manifest?.version) {
      versionEl.textContent = `v${manifest.version}`;
    }
  }

  const speedSlider = document.getElementById("speed-slider");
  const speedValue = document.getElementById("speed-value");
  const volumeSlider = document.getElementById("volume-slider");
  const volumeValue = document.getElementById("volume-value");
  const autoplayToggle = document.getElementById("autoplay-toggle");
  const themeColorPicker = document.getElementById("theme-color-picker");

  if (speedSlider && speedValue && volumeSlider && volumeValue) {
    // Load initial values from storage
    chrome.storage.local.get(["speechRate", "speechVolume", "autoPlay", "themeColor"], (res) => {
      if (autoplayToggle) {
        autoplayToggle.checked = res.autoPlay !== undefined ? res.autoPlay : true;
      }
      
      const rate = res.speechRate !== undefined ? res.speechRate : 1.0;
      const vol = res.speechVolume !== undefined ? res.speechVolume : 100;
      
      speedSlider.value = rate;
      speedValue.textContent = `${Number(rate).toFixed(1)}×`;
      
      volumeSlider.value = vol;
      volumeValue.textContent = `${Math.round(vol)}%`;
      
      if (themeColorPicker && res.themeColor) {
        themeColorPicker.value = res.themeColor;
        document.documentElement.style.setProperty("--primary", res.themeColor);
      }
    });

    speedSlider.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      speedValue.textContent = `${val.toFixed(1)}×`;
      chrome.storage.local.set({ speechRate: val });
    });

    volumeSlider.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      volumeValue.textContent = `${Math.round(val)}%`;
      chrome.storage.local.set({ speechVolume: val });
    });

    if (autoplayToggle) {
      autoplayToggle.addEventListener("change", (e) => {
        chrome.storage.local.set({ autoPlay: e.target.checked });
      });
    }

    if (themeColorPicker) {
      themeColorPicker.addEventListener("input", (e) => {
        const val = e.target.value;
        document.documentElement.style.setProperty("--primary", val);
        chrome.storage.local.set({ themeColor: val });
      });
    }
  }
})();
