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
assert.match(src,/<h3>\\$\\{t.type==='reps'/);
assert.match(src,/<h2>Basics<\/h2>/);
assert.match(src,/<h2>Selection<\/h2>/);
assert.match(src,/<h2>Metronome<\/h2>/);
for(const field of ['action.name','action.ttsName','action.duration.min','action.duration.max','action.exclusive','action.probability','action.weight','action.metronome','action.bpmStart','action.bpmFinish','action.bpmMode']) {
 assert.ok(src.includes("'"+field+"'")||src.includes('"'+field+'"'),field+' field still present');
}
assert.match(html,/\\.settings-panel h2/);
console.log('Beta 3.3.3 grouped configuration settings: PASSED');
