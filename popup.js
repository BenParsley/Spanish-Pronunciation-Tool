const volumeRangeEl = document.getElementById("volumeRange");
const volumeValueEl = document.getElementById("volumeValue");
const speedRangeEl = document.getElementById("speedRange");
const speedValueEl = document.getElementById("speedValue");
const statusEl = document.getElementById("status");
const genderInputs = Array.from(document.querySelectorAll('input[name="genderMode"]'));

const DEFAULT_SETTINGS = {
  volume: 1,
  genderMode: "both",
  speedMultiplier: 1
};

const SPEED_STEPS = [
  { slider: 0, multiplier: 0.25, label: "25%" },
  { slider: 1, multiplier: 0.5, label: "50%" },
  { slider: 2, multiplier: 0.75, label: "75%" },
  { slider: 3, multiplier: 1, label: "Normal" },
];

function sliderToMultiplier(sliderValue) {
  const step = SPEED_STEPS.find((item) => item.slider === Number(sliderValue));
  return step ? step.multiplier : 1;
}

function multiplierToSlider(multiplier) {
  const step = SPEED_STEPS.find((item) => item.multiplier === Number(multiplier));
  return step ? step.slider : 3;
}

function updateSpeedLabel(multiplier) {
  const step = SPEED_STEPS.find((item) => item.multiplier === Number(multiplier));
  speedValueEl.textContent = step ? step.label : "Normal";
}

function renderStatus(message) {
  statusEl.textContent = message;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 1500);
}

function updateVolumeLabel(value01) {
  const pct = Math.round(value01 * 100);
  volumeValueEl.textContent = `${pct}%`;
}

function getSelectedGenderMode() {
  const selected = genderInputs.find((input) => input.checked);
  return selected ? selected.value : "both";
}

function saveSettings() {
  const next = {
    volume: Number(volumeRangeEl.value) / 100,
    genderMode: getSelectedGenderMode(),
    speedMultiplier: sliderToMultiplier(speedRangeEl.value),
  };

  chrome.storage.sync.set(next, () => {
    if (chrome.runtime.lastError) {
      renderStatus("Could not save settings.");
      return;
    }

    updateVolumeLabel(next.volume);
    updateSpeedLabel(next.speedMultiplier);
    renderStatus("Saved.");
  });
}

function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    const volume = Math.max(0, Math.min(1, Number(settings.volume) || 1));
    const speedMultiplier = [1, 0.75, 0.5, 0.25].includes(Number(settings.speedMultiplier))
      ? Number(settings.speedMultiplier)
      : 1;
    const genderMode =
      settings.genderMode === "male" || settings.genderMode === "female" || settings.genderMode === "both"
        ? settings.genderMode
        : "both";

    volumeRangeEl.value = String(Math.round(volume * 100));
    updateVolumeLabel(volume);
    speedRangeEl.value = String(multiplierToSlider(speedMultiplier));
    updateSpeedLabel(speedMultiplier);

    for (const input of genderInputs) {
      input.checked = input.value === genderMode;
    }
  });
}

volumeRangeEl.addEventListener("input", () => {
  updateVolumeLabel(Number(volumeRangeEl.value) / 100);
});
speedRangeEl.addEventListener("input", () => {
  updateSpeedLabel(sliderToMultiplier(speedRangeEl.value));
});

volumeRangeEl.addEventListener("change", saveSettings);
speedRangeEl.addEventListener("change", saveSettings);
for (const input of genderInputs) {
  input.addEventListener("change", saveSettings);
}

loadSettings();
