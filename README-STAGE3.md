# Random Workout Timer — Beta 3.0 Stage 3

This APK installs **alongside** Stage 2.1 (`com.randomworkout.timer.stage3`).

## What's added
- Native sample-accurate repeating metronome using Android `AudioTrack` static PCM loops; 20–300 BPM per action.
- Automatic ducking to 20% metronome volume while native action announcements play.
- Metronome stops on pause, skip, stop and session completion. On resume it restarts the beat alongside the spoken action name.
- Limited active-session partial wake lock for more reliable screen-off operation, released on pause, stop, completion and Activity destruction.
- Stage 1/Stage 2 JSON session backups remain compatible; import your Stage 2.1 backup into Stage 3.

## What still needs checking on the actual Android phone
- Audibility/tone of the metronome, ducking at speech start/end, pause/resume and skip boundaries.
- Locked-screen accuracy with BPM audio running.
- Audio behavior with Bluetooth headphones, interruptions, incoming calls and low-power modes (not guaranteed).

## Signing
The GitHub workflow supports an optional **persistent signing keystore**, configured as repository Secrets:
`RWT_SIGNING_KEYSTORE_B64`, `RWT_KEYSTORE_PASSWORD`, `RWT_KEY_ALIAS`, `RWT_KEY_PASSWORD`.
Never store a keystore or its passwords in this **public** GitHub repository.
When the secrets are missing, the APK is debug-signed with an ephemeral GitHub runner key, so it cannot update in-place across separate builds. This still needs one-time setup; do not claim persistent signing is active until the secrets are configured and tested.
