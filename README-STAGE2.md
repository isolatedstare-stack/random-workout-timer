# Random Workout Timer — Android Beta 3.0, Stage 2

## Data migration from the Stage 1 Builder

The new Stage 2 app is a **separate Android package** (`com.randomworkout.timer.stage2`) so the installed Stage 1 Builder, and its local session data, remain untouched.

1. In the installed Stage 1 Builder, open **Backup & sound → Export JSON**, choose a known folder such as Downloads, and save the file.
2. Install the Stage 2 APK from the GitHub Actions artifact ZIP.
3. Open the new **Random Workout Timer S2**, tap **Import JSON**, select the saved file and confirm the replacement.
4. Verify that your session names, sets, actions and probabilities appear in the new app **before** deleting anything from Stage 1.

Session backups remain schema version 1. Stage 1 JSON imports directly without transformation or manual re-entry.

**Important:** The GitHub workflow currently signs debug APKs using runners' debug keys. Signatures can differ between builds, preventing in-place updates. Keep a JSON backup before any future reinstall. A stable private signing key managed through GitHub Secrets is the correct long-term solution; never publish signing keys into the public repo.

## Stage 2 runtime

- Validates configuration before starting.
- Asks to show or hide all time displays for each session.
- Resolves weighted exclusive action choices, sequence order, random time ranges and strict time-based set deadlines before starting.
- Preserves the randomized plan throughout execution and pause/resume.
- Announces actions through Android's native TTS. Set transitions and repetitions are silent.
- Supports Pause, Resume (repeats current instruction), Skip Action, Skip Set, Stop.
- Skips shorten effective session/set duration; they do not regenerate the plan.
- One session completion bong on natural completion or a final skip; manual Stop is silent.
- Uses a monotonic elapsed-time clock; on-device testing is still required for prolonged locked-screen timing.

Stage 3 will add metronome playback, native ducking, audio polish and comprehensive Android device validation.

## Safety limits

A single generated plan is capped at 20,000 action occurrences or 7 days of planned duration to avoid memory exhaustion. These limits are reported as errors, never silently truncating a session.
