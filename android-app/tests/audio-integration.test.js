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

assert.match(native,/void setWorkoutFullscreen\(boolean enabled\)/);
assert.match(native,/View\.SYSTEM_UI_FLAG_IMMERSIVE_STICKY/);
assert.match(native,/entry\.put\("languageTag",voice\.getLocale\(\)\.toLanguageTag\(\)\)/);
assert.match(ui,/AndroidSpeech\.setWorkoutFullscreen\(full\)/);
console.log('Immersive player and voice-preview bridge: PASSED');

const backManifest = fs.readFileSync(path.join(base,'AndroidManifest.xml'),'utf8');
assert.match(backManifest,/android:enableOnBackInvokedCallback="true"/);
assert.match(native,/getOnBackInvokedDispatcher\(\)\.registerOnBackInvokedCallback/);
assert.match(native,/OnBackInvokedDispatcher\.PRIORITY_DEFAULT/);
assert.match(native,/Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.TIRAMISU/);
assert.match(native,/@Override\s+public void onBackPressed\(\)/);
assert.match(native,/window\.onNativeBackRequested && window\.onNativeBackRequested\(\)/);
assert.match(native,/unregisterOnBackInvokedCallback\(backGestureCallback\)/);
assert.match(native,/exitFromSessionsHome\(\)/);
assert.doesNotMatch(native,/onBackPressed\(\)\s*\{\s*super\.onBackPressed/);
console.log('Android native Back callback and safe exit checks: PASSED');

assert.match(ui,/\['randomWalk','Random progression \(up and down\)'\]/);
assert.match(ui,/AndroidSpeech\.startActionWithRandomBpm\(/);
assert.match(ui,/item\.bpmCurve\.join\(','\)/);
assert.match(native,/void startActionWithRandomBpm\(String text, String languageTag/);
assert.match(native,/metronomePlayer\.startRandomWalk\(bpmStart, bpmFinish, curve/);
assert.match(metro,/startRandomWalk\(int bpmStart, int bpmFinish, int\[\] curve/);
assert.match(metro,/randomBpmAt\(randomCurve, elapsedMs\)/);
assert.match(metro,/step < min \|\| step > max/);
assert.match(ui,/Finish BPM is the other boundary, not a required endpoint/);
console.log('Native random BPM curve playback and limits: PASSED');

const rotationManifest = fs.readFileSync(path.join(base,'AndroidManifest.xml'),'utf8');
const changes = rotationManifest.match(/android:configChanges="([^"]+)"/);
assert.ok(changes,'Explicitly handle configuration changes without recreating the Activity');
for (const change of ['orientation','screenSize','smallestScreenSize','screenLayout','keyboardHidden'])
  assert.ok(changes[1].split('|').includes(change),change+' handled in place');
assert.match(native,/import android\.content\.res\.Configuration;/);
assert.match(native,/void onConfigurationChanged\(Configuration newConfig\)/);
assert.match(native,/super\.onConfigurationChanged\(newConfig\)/);
assert.match(native,/webView\.requestLayout\(\)/);
assert.doesNotMatch(native,/void onConfigurationChanged\([\s\S]*?\)[\s\S]*?webView\.loadUrl\(/,
 'Do not reload the workout page after rotation');
console.log('Keep workout state and metronome alive on orientation change: PASSED');
