const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.join(__dirname, '../app/src/main');
const ui = fs.readFileSync(path.join(base,'assets/app.js'),'utf-8');
const native = fs.readFileSync(path.join(base,'java/com/randomworkout/timer/MainActivity.java'),'utf-8');
const metro = fs.readFileSync(path.join(base,'java/com/randomworkout/timer/MetronomePlayer.java'),'utf-8');
const manifest = fs.readFileSync(path.join(base,'AndroidManifest.xml'),'utf-8');
assert.match(ui,/AndroidSpeech\.startAction\(item\.ttsName,'system',Boolean\(item\.metronome\),Number\(item\.bpmStart\)\|\|120/);
assert.match(ui,/function nativeStop\(\).*AndroidSpeech\.stop\(\)/);
assert.match(native,/void startAction\(String text, String languageTag, boolean useMetronome,/);
assert.match(native,/haltActionAudio\(\);\s*if \(useMetronome\) metronomePlayer\.start\(bpmStart, bpmFinish, progressive/);
assert.match(native,/metronomePlayer\.setDucked\(true\)/);
assert.match(native,/metronomePlayer\.setDucked\(false\)/);
assert.match(native,/releaseSessionWakeLock\(\)/);
assert.match(metro,/AudioTrack\.MODE_STREAM/);
assert.match(metro,/AudioTrack\.WRITE_BLOCKING/);
assert.match(metro,/NORMAL_VOLUME \* 0\.20f/);
assert.match(manifest,/android\.permission\.WAKE_LOCK/);
console.log('Stage 3 Android audio integration checks: PASSED');

assert.match(ui,/data-do=\"test-metronome\"/);
assert.match(native,/void testMetronome\(int bpm\)/);

assert.match(metro,/bpmAt\(int start, int finish, boolean progressive/);
assert.match(metro,/plannedDurationMs, elapsedMs/);
assert.match(ui,/set\.timeSelectionPriority/);
assert.match(ui,/action\.weight/);

// Regression guard: destructive session/set operations must require confirmation
// before modifying the stored hierarchy. Cancel must leave the data unchanged.
const deleteSession = ui.match(/if\(cmd==='delete-session'\)\{[^\n]+/);
const deleteSet = ui.match(/if\(cmd==='delete-set'\)\{[^\n]+/);
assert.ok(deleteSession, 'Session delete handler exists');
assert.ok(deleteSet, 'Set delete handler exists');
assert.match(deleteSession[0], /!confirm\(/, 'Session deletion requires confirmation');
assert.match(deleteSet[0], /!confirm\(/, 'Set deletion requires confirmation');
assert.ok(deleteSession[0].indexOf('!confirm(') < deleteSession[0].indexOf('store.sessions='),
  'Session confirmation precedes destructive mutation');
assert.ok(deleteSet[0].indexOf('!confirm(') < deleteSet[0].indexOf('s.sets='),
  'Set confirmation precedes destructive mutation');
assert.match(deleteSession[0], /cannot be undone/i);
assert.match(deleteSet[0], /cannot be undone/i);
console.log('Session and set deletion confirmation guards: PASSED');

assert.match(native,/String availableVoices\(\)/);
assert.match(native,/void setPreferredVoice\(String voiceName\)/);
assert.match(native,/voice\.isNetworkConnectionRequired\(\)/);
assert.match(native,/tts\.setVoice\(chosen\)/);
assert.match(ui,/session\(\)\?\.voiceName\|\|''/);
console.log('Session-scoped offline TTS voices: PASSED');
