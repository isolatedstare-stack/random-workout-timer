const assert = require('node:assert/strict');
const M = require('../app/src/main/assets/model.js');
const E = require('../app/src/main/assets/engine.js');
const fixed = n => () => n;
const a = (name,seconds=5) => ({id:name,name,ttsName:'Say '+name,exclusive:false,probability:0,duration:{min:seconds,max:seconds},metronome:false,bpm:120});
const set=(name,type,actions,extra={})=>({id:name,name,type,actions,repetitions:2,sequence:'standard',duration:{min:11,max:11},...extra});
const session = sets=>({id:'session',name:'Test session',sets});
// Standard order: across repetitions, change A B A -> B A only when needed.
const standard = E.createPlan(session([set('standard','reps',[a('A'),a('B'),a('C')],{repetitions:3})]),fixed(.22));
assert.equal(standard.items.length,9);
assert.deepEqual(standard.items.map(x=>x.actionName),['A','B','C','A','B','C','A','B','C']);
const reordered = E.createPlan(session([set('test','reps',[a('A'),a('B')],{repetitions:3,sequence:'standard'})]),fixed(.25));
assert.deepEqual(reordered.items.map(x=>x.actionName),['A','B','A','B','A','B']); // B -> A is already a valid boundary
for(let i=1;i<reordered.items.length;i++)assert.notEqual(reordered.items[i].actionId,reordered.items[i-1].actionId);
// Time-based strict deadline and no consecutive repeats.
const timed=E.createPlan(session([set('time','time',[a('A',5),a('B',5)],{duration:{min:12,max:12}})]),fixed(.2));
assert.equal(timed.totalMs,12000);
assert.deepEqual(timed.items.map(x=>x.durationMs),[5000,5000,2000]);
for(let i=1;i<timed.items.length;i++)assert.notEqual(timed.items[i].actionId,timed.items[i-1].actionId);
// Mutual exclusion: fixed rng selects same option twice, preserving probabilities despite no-alternation preference.
const b=a('B');b.exclusive=true;b.probability=80;const c=a('C');c.exclusive=true;c.probability=20;
const weighted=E.createPlan(session([set('exclusive','reps',[b,c],{repetitions:5})]),fixed(.5));
assert.deepEqual(weighted.items.map(x=>x.actionName),['B','B','B','B','B']);
const normal=a('Always');
const both=E.createPlan(session([set('exclusive','reps',[b,normal,c],{repetitions:4})]),fixed(.3));
for(let i=1;i<both.items.length;i++)assert.notEqual(both.items[i].actionId,both.items[i-1].actionId);
assert.equal(both.items.filter(x=>x.actionName==='Always').length,4);
assert.equal(both.items.filter(x=>x.actionName==='B').length,4);
// Stop/pause/skip and dynamically adjusted totals with mixed sets.
const mixed=E.createPlan(session([set('one','time',[a('A',4),a('B',4)],{duration:{min:9,max:9}}),set('two','reps',[a('C',5)],{repetitions:2})]),fixed(.7));
assert.equal(mixed.totalMs,19000);
const run=E.createRunner(mixed);
run.consume(3000); assert.equal(run.state.elapsedMs,3000);assert.equal(run.remainingMs(),16000);
run.pause();run.consume(4000);assert.equal(run.state.elapsedMs,3000);
run.skipSet();assert.equal(run.state.status,'paused');assert.equal(run.current().setIndex,1);
assert.equal(run.state.effectiveTotalMs,13000);
assert.equal(run.remainingMs(),10000);
run.resume();run.consume(10000);assert.equal(run.state.status,'completed');assert.equal(run.state.elapsedMs,13000);assert.equal(run.state.completedBy,'natural');
const skipAll=E.createRunner(mixed);skipAll.skipSet();skipAll.skipSet();assert.equal(skipAll.state.completedBy,'skip-final-set');
const stop=E.createRunner(mixed);stop.stop();assert.equal(stop.state.status,'stopped');
const skipAction=E.createRunner(mixed);skipAction.consume(1500);skipAction.skipAction();assert.equal(skipAction.state.effectiveTotalMs,mixed.totalMs-2500);
const catchUp=E.createRunner(mixed);catchUp.consume(20000);assert.equal(catchUp.state.elapsedMs,19000);assert.equal(catchUp.state.status,'completed');
// 20k occurrence guard ensures a malformed but otherwise range-valid input cannot hang the phone.
assert.throws(()=>E.createPlan(session([set('huge','reps',[a('A',1)],{repetitions:20001})]),fixed(.1)),/20,000/);
assert.deepEqual(M.validateStore({sessions:[session([set('valid','reps',[a('A')])])]}),[]);
console.log('Stage 2 execution engine tests: PASSED');
