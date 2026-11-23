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
const timed=E.createPlan(session([set('time','time',[a('A',5),a('B',5)],{duration:{min:12,max:12},timeSelectionPriority:'avoidRepeat'})]),fixed(.2));
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
// Weighted time-based draws with weight priority can repeat.
const wA={...a('W-A',4),weight:1}, wB={...a('W-B',4),weight:2}, wC={...a('W-C',4),weight:1};
const weightsFirst=set('weighted-time','time',[wA,wB,wC],{duration:{min:16,max:16},timeSelectionPriority:'weights'});
const wplan=E.createPlan(session([weightsFirst]),fixed(.3));
assert.deepEqual(wplan.items.map(i=>i.actionName),['W-B','W-B','W-B','W-B']);
assert.deepEqual(E.createPlan(session([weightsFirst]),fixed(.9)).items.map(i=>i.actionName),['W-C','W-C','W-C','W-C']);
const avoid=set('avoid','time',[wA,wB],{duration:{min:16,max:16},timeSelectionPriority:'avoidRepeat'});
const avoidPlan=E.createPlan(session([avoid]),fixed(.9));
assert.deepEqual(avoidPlan.items.map(i=>i.actionName),['W-B','W-A','W-B','W-A']);
// Static BPM is chosen once per occurrence. Progressive uses the full nominal duration.
const staticAction={...a('static',10),metronome:true,bpmStart:80,bpmFinish:120,bpmMode:'static'};
const staticPlan=E.createPlan(session([set('static','reps',[staticAction],{repetitions:2})]),fixed(.5));
assert.deepEqual(staticPlan.items.map(i=>i.bpm),[100,100]);
assert.equal(E.bpmAtElapsed(staticPlan.items[0],9000),100);
const ramp={...a('ramp',60),metronome:true,bpmStart:80,bpmFinish:120,bpmMode:'progressive'};
const rampItem=E.createPlan(session([set('short','time',[ramp],{duration:{min:10,max:10}})]),fixed(.5)).items[0];
assert.equal(rampItem.durationMs,10000);
assert.equal(rampItem.plannedDurationMs,60000);
assert.equal(E.bpmAtElapsed(rampItem,0),80);
assert.equal(E.bpmAtElapsed(rampItem,10000),86);
assert.equal(E.bpmAtElapsed(rampItem,59000),120);
const downItem=E.createPlan(session([set('down','reps',[{...ramp,bpmStart:120,bpmFinish:80}],{repetitions:1})]),fixed(.5)).items[0];
assert.equal(E.bpmAtElapsed(downItem,59000),80);
console.log('Stage 3.2 engine tests: PASSED');

// Random progression is precomputed for each occurrence. Both bounds are the
// existing Start and Finish values; a seeded walk can change direction.
{
 const randomAction={...a('random-walk',24),metronome:true,bpmStart:80,bpmFinish:95,bpmMode:'randomWalk'};
 const plan=E.createPlan(session([set('walk','reps',[randomAction],{repetitions:2})]),fixed(.2));
 assert.equal(plan.items.length,2);
 for(const item of plan.items){
   assert.equal(item.bpmMode,'randomWalk');
   assert.equal(item.bpmStart,80);
   assert.equal(item.bpmFinish,95);
   assert.equal(item.bpmCurve[0],80);
   assert.deepEqual(item.bpmCurve.slice(0,3),[80,83,80]);
   assert(item.bpmCurve.every(bpm=>bpm>=80&&bpm<=95),'Curve never crosses boundaries');
   assert.equal(E.bpmAtElapsed(item,0),80);
   assert.equal(E.bpmAtElapsed(item,3999),80);
   assert.equal(E.bpmAtElapsed(item,4000),83);
   assert.equal(E.bpmAtElapsed(item,8000),80);
 }
 const reverse={...randomAction,bpmStart:95,bpmFinish:80};
 const reverseItem=E.createPlan(session([set('reverse','reps',[reverse])]),fixed(.2)).items[0];
 assert.equal(reverseItem.bpmCurve[0],95);
 assert(reverseItem.bpmCurve.every(bpm=>bpm>=80&&bpm<=95),'Reverse-bound curve remains safe');
 const cut=E.createPlan(session([set('cut','time',[randomAction],{duration:{min:10,max:10}})]),fixed(.2)).items[0];
 assert.equal(cut.durationMs,10000);
 assert.equal(cut.plannedDurationMs,24000);
 assert.deepEqual(cut.bpmCurve,[80,83,80]);
 assert.equal(E.bpmAtElapsed(cut,8000),80);
 const shorter={...randomAction,duration:{min:3,max:3}};
 const shortItem=E.createPlan(session([set('short','reps',[shorter])]),fixed(.2)).items[0];
 assert.deepEqual(shortItem.bpmCurve,[80],'No new step before the 4-second interval');
 for(const [start,finish] of [[20,300],[300,20],[80,82]]) {
   const curve=E.randomBpmCurve(start,Math.min(start,finish),Math.max(start,finish),160000,fixed(.6));
   assert.equal(curve[0],start);
   assert(curve.every(bpm=>bpm>=Math.min(start,finish)&&bpm<=Math.max(start,finish)));
 }
 assert.throws(()=>E.randomBpmCurve(100,100,100,8000,fixed(.4)),/Invalid/);
}
console.log('Random progression curve and runtime BPM tests: PASSED');
