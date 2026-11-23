const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');
assert.match(src, /function breadcrumbs\(level\)/);
for (const nav of ['nav-home','nav-session','nav-set']) {
  assert.match(src,new RegExp("data-do=\\\""+nav+"\\\""));
  assert.match(src,new RegExp("if\\(cmd==='"+nav+"'\\)"));
}
for (const command of ['new-set-reps','new-set-time']) assert.match(src,new RegExp(command));
assert.match(src,/if\(cmd==='new-set-time'\)t\.type='time'/);
assert.match(src,/class="card-menu"/);
assert.match(src,/class="card-controls"/);
assert.match(html,/\.breadcrumbs\{/);
assert.match(html,/\.card-menu>summary/);
for (const [what, mutation] of [['delete-session','store.sessions='],['delete-set','s.sets=']]) {
  const line=src.split('\n').find(x=>x.includes("if(cmd==='"+what+"')"));
  assert.ok(line,what+' handler exists');
  assert.ok(line.includes("!confirm("),what+' confirms deletion');
  assert.ok(line.indexOf('!confirm(')<line.indexOf(mutation),what+' confirms before mutation');
}
console.log('Beta 3.3 configuration UX regression tests: PASSED');

const UX=require('../app/src/main/assets/ux.js');
assert.equal(UX.isBackSwipe(250,100,130,110),true,'swipe left navigates');
assert.equal(UX.isBackSwipe(130,100,250,100),false,'swipe right does not navigate');
assert.equal(UX.isBackSwipe(250,100,130,250),false,'vertical scroll does not navigate');
assert.equal(UX.isBackSwipe(250,100,195,100),false,'small touches do not navigate');
assert.deepEqual([UX.insertionIndex([20,60,100],0),UX.insertionIndex([20,60,100],80),UX.insertionIndex([20,60,100],999)],[0,2,3]);
const items=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
assert.equal(UX.moveById(items,'a',3),true);
assert.deepEqual(items.map(x=>x.id),['b','c','d','a']);
assert.equal(UX.moveById(items,'a',1),true);
assert.deepEqual(items.map(x=>x.id),['b','a','c','d']);
assert.equal(UX.moveById(items,'a',1),false);
assert.equal(UX.moveById(items,'missing',0),false);
assert.match(html,/id="appMenu"/);
assert.match(html,/data-do="export"/);
assert.match(html,/data-do="import"/);
assert.match(html,/data-do="test-end"/);
assert.match(html,/src="ux.js"/);
assert.doesNotMatch(html,/Stage 3\.3 · Sessions, metronome & native voice/);
assert.doesNotMatch(html,/Create sessions, configure sets/);
assert.match(src,/data-drag-handle="set"/);
assert.match(src,/data-drag-handle="action"/);
assert.match(src,/function endDrag\(cancelled=false\)/);
assert.match(src,/UX\.isBackSwipe/);
assert.match(src,/UX\.moveById/);
console.log('Beta 3.3 swipe, drag, and menu tests: PASSED');

assert.doesNotMatch(src,/data-do="move-\$\{group\}"/,'Up/Down buttons removed from card menus');
assert.doesNotMatch(src,/cmd\?\.startsWith\('move-'\)/,'Obsolete move button handler removed');
assert.match(src,/aria-keyshortcuts="ArrowUp ArrowDown"/,'Drag handles have keyboard support');
assert.match(src,/addEventListener\('keydown'/,'Keyboard reorder handler installed');
assert.match(src,/UX\.moveById\(items,id,next\)/,'Keyboard reorder uses the same saved order');

assert.match(src,/<h2>Set details<\/h2>/);
assert.ok(src.includes("<h3>\${t.type==='reps'"),'Set-specific rules heading exists');
assert.match(src,/<h2>Basics<\/h2>/);
assert.match(src,/<h2>Selection<\/h2>/);
assert.match(src,/<h2>Metronome<\/h2>/);
for(const field of ['action.name','action.ttsName','action.duration.min','action.duration.max','action.exclusive','action.probability','action.weight','action.metronome','action.bpmStart','action.bpmFinish','action.bpmMode']) {
 assert.ok(src.includes("'"+field+"'")||src.includes('"'+field+'"'),field+' field still present');
}
assert.ok(html.includes('.settings-panel h2'));
console.log('Beta 3.3.3 grouped configuration settings: PASSED');

assert.match(src,/value="\$\{esc\(val\)\}"/,'Existing fields retain their real saved values');
assert.match(src,/class="grid range-grid"/,'Numeric ranges are paired');
assert.match(html,/\.card-menu>\.menu-actions\{position:absolute/,'Menu overlays instead of shifting the card layout');
assert.match(html,/\.range-grid\{display:grid;grid-template-columns:repeat\(2/,'Paired fields stay in two columns');
assert.match(src,/addEventListener\('touchmove'/,'Swipe monitored while moving');
assert.match(src,/detectBackSwipe\(e.touches\[0\],e\)/,'Swipe recognized before touchend');
assert.doesNotMatch(src,/<h3>Voice announcement<\/h3>/,'Redundant voice heading removed');
assert.match(src,/field\('Voice announcement','action.ttsName'/);
assert.match(src,/field\('Session voice','session.voiceName'/);
assert.match(src,/AndroidSpeech\.availableVoices/);
assert.match(src,/AndroidSpeech\.setPreferredVoice/);
assert.equal(UX.isBackSwipe(200,100,123,108),true,'Short deliberate swipe left triggers');
console.log('Beta 3.3.4 UX improvements: PASSED');

assert.match(src,/M\.newSession\(''\)/,'New session opens with blank name');
assert.match(src,/M\.newSet\(''\)/,'New set opens with blank name');
assert.match(src,/M\.newAction\(''\)/,'New action opens with blank name');
assert.match(src,/t\.repetitions=null;t\.duration\.min=null;t\.duration\.max=null/,'New set numeric entries are empty');
assert.match(src,/a\.weight=null;a\.bpm=null;a\.bpmStart=null;a\.bpmFinish=null/,'New action numeric entries are empty');
assert.match(src,/data-do="preview-session-voice"/,'Voice sample playback control is available');
assert.match(src,/if\(voiceChanged\)previewSessionVoice\(\)/,'Voice change triggers a sample');
assert.match(src,/language\.toLowerCase\(\)\.startsWith\('el'\)/,'Greek voice preview uses Greek sample');
assert.match(src,/class="workout-screen"/,'Player fills the workout view');
assert.match(src,/id="actionCountdown"/,'Large countdown is displayed');
assert.match(src,/id="actionProgress"/,'Visual action progress is displayed');
assert.match(src,/id="sessionClock"/,'Session clock remains available');
assert.match(src,/id="setClock"/,'Set clock remains available');
assert.match(src,/document\.body\.classList\.toggle\('workout-mode',full\)/,'Full-screen styling is toggled');
assert.match(html,/\.workout-action\{font-size:clamp\(/,'Action name uses large responsive fonts');
assert.match(html,/\.workout-countdown\{font-size:clamp\(/,'Countdown uses large responsive fonts');
console.log('Beta 3.3.5 full-screen player, form persistence, voice preview: PASSED');

// Native Back uses the same editor hierarchy without exiting immediately.
assert.match(src,/window\.onNativeBackRequested=\(\)=>handleGestureBack\(true\)/);
assert.match(src,/function handleGestureBack\(fromNative=false\)/);
assert.match(src,/now-lastGestureBackAt<700/,'System Back and touch swipe are deduplicated');
assert.match(src,/handleGestureBack\(false\)/,'Center swipes use the same Back handler');
assert.match(src,/if\(route\.screen==='action'\)go\('set'/);
assert.match(src,/else if\(route\.screen==='set'\)go\('session'/);
assert.match(src,/else if\(route\.screen==='session'\|\|route\.screen==='prestart'\)go\('home'/);
assert.match(src,/playCommand\('stop-session'\)/,'Back during workout requires Stop confirmation');
assert.match(src,/confirm\('Exit Random Workout Timer\?'\)/,'Exiting Home requires explicit confirmation');
console.log('Native back hierarchy and safety checks: PASSED');
