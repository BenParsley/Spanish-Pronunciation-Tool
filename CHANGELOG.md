# Changelog

## Unreleased

### Fixed
- Removed broken `Pronounce` option from the GUI and kept only live translation.
- Enforced Spanish-only source text and Spanish→English translation flow.
- Fixed invalid `content.js` function scope and removed malformed duplicate code blocks.
- Corrected runtime errors including illegal return statements and missing braces.
- Ensured `content.js` passes syntax checks with `node --check`.
- Stopped audio playback when the progress pin is moved, preserving the selected location.
- Fixed play/pause behavior so the progress pin does not jump back to the start.
- Added separate settings drag handle so the settings menu can move independently from the main live translation panel.

### Added
- Added a smoothness slider in settings for progress bar visual control.
- Implemented `requestAnimationFrame` for progress updates to improve pin movement smoothness.
- Added dynamic progress bar segments controlled by smoothness settings.
- Added independent drag support for the settings container.

### Changed
- Migrated progress timer from `setInterval` to `requestAnimationFrame` for 60fps updates.
- Refactored playback resume logic to calculate `currentSpeechStartTime` properly.
- Added progress pin seek logic that updates the current speech index and stops playback immediately.
