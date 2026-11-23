# Random Workout Timer — Android Beta 3.0, Stage 1

## What works now

- Create, edit, duplicate, and delete **sessions**, **sets**, and **actions**.
- Every new session includes one set, and every new set includes one action. You cannot remove the last set/action.
- Session names must be unique; set names must be unique within each session (the editor flags conflicts).
- Configure **reps-based** sets (repetitions, standard/random sequencing) and **time-based** sets (min/max duration).
- Configure actions (name, separately editable TTS name, min/max duration, optional metronome and BPM).
- Configure one weighted mutual-exclusion group per reps-based set. The editor validates at least two members and an exact 100% total.
- Reorder sets/actions using Up/Down buttons and duplicate any hierarchy level.
- Automatically save configuration locally; export/import JSON backups via Android document picker.
- Test action announcements through native Android Text-to-Speech.
- Preview the built-in **bong** completion sound. It is included as a native Android audio resource for later execution integration.

## Not in Stage 1

**The new multi-set workout execution engine is NOT included in this build.** Random execution planning, skip action/set, session/set/action live timers, metronome playback and ducking, and automatic session-end sound playback belong to Stages 2–3. Continue using the validated Android Beta 2.0 for actual workouts.

## Independent installation

Beta 3 Stage 1 uses app ID `com.randomworkout.timer.stage1` and installs **alongside** Beta 2.0. Configurations are stored separately, so old settings won't be migrated automatically. This avoids overwriting your working workout timer.

## Build with GitHub Actions

1. Extract this ZIP on your computer.
2. Copy its **`android-app`** folder to the root of your existing `random-workout-timer` GitHub repository. Preserve file paths and commit changes. Your existing `.github/workflows/android-apk.yml` workflow is reused; do not remove it.
3. Open **Actions → Build Android APK**, then open the successful run, download the `random-workout-timer-android-debug` artifact, extract it, and install `app-debug.apk` on Android.
4. Open **Random Workout Timer · Builder** (separate from the older app).

You can also open `android-app/app/src/main/assets/index.html` in a desktop browser to try the editor. The Android-specific voice, audio playback and native backup dialogs work only inside the APK.

## Configuration backup

From the **My sessions** page, choose **Export JSON** to save a backup file. **Import JSON** first validates the file structure, then asks permission before replacing saved sessions. An import does not affect Beta 2.0. Back up before uninstalling or clearing app data.

## Session completion sound

A local, fixed struck-bowl/bong WAV is bundled in `res/raw/session_end_bong.wav`. The Stage 1 **Preview ending chime** button calls the native `AndroidSpeech.playCompletionSound()` bridge. During execution (Stage 2), call it **once when the session completes naturally or the last set is skipped**; do **not** call it for a manually stopped session.

## Verification

Run `node android-app/tests/model.test.js` for model-level tests. Web UI flows were tested in Chromium. Android compilation and actual native integration must be verified via your GitHub Actions workflow and device.
