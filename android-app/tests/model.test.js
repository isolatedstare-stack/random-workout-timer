const assert = require('node:assert/strict');
const M = require('../app/src/main/assets/model.js');
const store=M.emptyStore();
const s=M.newSession('Workout');store.sessions.push(s);
assert.equal(s.sets.length,1);
assert.equal(s.sets[0].actions.length,1);
assert.deepEqual(M.validateStore(store),[]);
const t=s.sets[0];
const a=M.newAction('Action B'); const b=M.newAction('Action C');
t.actions.push(a,b);a.exclusive=true;b.exclusive=true;a.probability=24;b.probability=76;
assert.equal(M.validateStore(store).length,0);
a.probability=25;
assert(M.validateStore(store).some(i=>i.message.includes('total exactly 100')));
a.probability=24;
const copied=M.copySession(s,store.sessions);
assert.notEqual(copied.id,s.id);
assert.notEqual(copied.sets[0].id,t.id);
assert.notEqual(copied.sets[0].actions[0].id,t.actions[0].id);
assert.equal(copied.sets[0].actions[1].probability,24);
assert.notEqual(copied.name,s.name);
store.sessions.push(copied);
assert.equal(M.validateStore(store).length,0);
assert(M.move(store.sessions,0,1));
assert.equal(store.sessions[0].id,copied.id);
assert.equal(M.uniqueName('Workout',store.sessions),'Workout (copy 2)');
const imported=M.normalizeImport(JSON.parse(JSON.stringify(store)));
assert.equal(imported.sessions.length,2);
assert.deepEqual(M.validateStore(imported),[]);
assert.notEqual(imported.sessions[0].id,store.sessions[0].id);
assert.throws(()=>M.normalizeImport({schemaVersion:99,sessions:[]}));
assert.throws(()=>M.normalizeImport({schemaVersion:1,sessions:[{name:'X',sets:[]}]}));
t.type='time';t.duration.min=150;t.duration.max=100;
assert(M.validateStore(store).some(i=>i.message.includes('minimum')));
t.duration.max=150;
assert.equal(M.validateStore(store).length,0);
t.actions[0].metronome=true;t.actions[0].bpmStart=900;
assert(M.validateStore(store).some(i=>i.message.includes('BPM')));
t.actions[0].bpmStart=120;t.actions[0].bpm=120;
// Existing schema-v1 backups import with default weights and unchanged fixed BPM.
const legacy=JSON.parse(JSON.stringify(store));
for(const s of legacy.sessions)for(const t of s.sets){delete t.timeSelectionPriority;for(const a of t.actions){delete a.weight;delete a.bpmStart;delete a.bpmFinish;delete a.bpmMode;}}
const migrated=M.normalizeImport(legacy);
assert.equal(migrated.sessions[0].sets[0].timeSelectionPriority,'weights');
assert.equal(migrated.sessions[0].sets[0].actions[0].weight,1);
assert.equal(migrated.sessions[0].sets[0].actions[0].bpmStart,migrated.sessions[0].sets[0].actions[0].bpmFinish);
assert.equal(M.validateStore(migrated).length,0);
const first=migrated.sessions.find(s=>s.sets[0].type==='time').sets[0].actions[0];
first.weight=0;assert(M.validateStore(migrated).some(i=>i.message.includes('weight')));
first.weight=1.5;first.bpmStart=80;first.bpmFinish=120;first.bpmMode='progressive';
assert.equal(M.validateStore(migrated).length,0);
first.bpmFinish=900;assert(M.validateStore(migrated).some(i=>i.message.includes('BPM')));
console.log('Stage 3.2 model tests: PASSED');

{
 const voiceSession=M.newSession('Voice persistence');
 voiceSession.voiceName='example-offline-voice';
 const imported=M.normalizeImport({schemaVersion:1,sessions:[voiceSession]});
 assert.equal(imported.sessions[0].voiceName,'example-offline-voice');
 assert.equal(M.newSession().voiceName,'','New session defaults to system voice');
 const old=JSON.parse(JSON.stringify(voiceSession));delete old.voiceName;
 assert.equal(M.normalizeImport({schemaVersion:1,sessions:[old]}).sessions[0].voiceName,'','Older JSON backups remain compatible');
}

{
 const draft=M.newSession('');
 const t=M.newSet('');
 t.repetitions=null;t.duration={min:null,max:null};
 const a=M.newAction('');a.ttsName='';a.duration={min:null,max:null};
 a.weight=null;a.bpm=null;a.bpmStart=null;a.bpmFinish=null;
 t.actions=[a];draft.sets=[t];
 const reloaded=M.normalizeImport({schemaVersion:1,sessions:[draft]});
 assert.equal(reloaded.sessions[0].name,'');
 assert.equal(reloaded.sessions[0].sets[0].repetitions,null);
 assert.deepEqual(reloaded.sessions[0].sets[0].duration,{min:null,max:null});
 assert.deepEqual(reloaded.sessions[0].sets[0].actions[0].duration,{min:null,max:null});
 assert.equal(reloaded.sessions[0].sets[0].actions[0].weight,null);
 assert.equal(reloaded.sessions[0].sets[0].actions[0].bpmStart,null);
 assert.equal(reloaded.sessions[0].sets[0].actions[0].bpmFinish,null);
 assert(M.validateStore(reloaded).length>0,'Unconfigured drafts cannot start a workout');
}

// Random progression has exactly two values: Start BPM is the initial tempo,
// Finish BPM is the opposite bound, not a required final tempo.
{
 const workout=M.newSession('Random tempo');
 const action=workout.sets[0].actions[0];
 action.metronome=true;action.bpmStart=80;action.bpmFinish=120;action.bpmMode='randomWalk';
 assert.deepEqual(M.validateStore({sessions:[workout]}),[]);
 assert.equal(Object.hasOwn(action,'bpmMin'),false);
 assert.equal(Object.hasOwn(action,'bpmMax'),false);
 let restored=M.normalizeImport({schemaVersion:1,sessions:[workout]});
 let roundtrip=restored.sessions[0].sets[0].actions[0];
 assert.equal(roundtrip.bpmMode,'randomWalk');
 assert.equal(roundtrip.bpmStart,80);
 assert.equal(roundtrip.bpmFinish,120);
 assert.equal(Object.hasOwn(roundtrip,'bpmMin'),false);
 action.bpmStart=120;action.bpmFinish=80;
 assert.deepEqual(M.validateStore({sessions:[workout]}),[],'Descending start and finish are valid bounds');
 action.bpmFinish=120;
 assert(M.validateStore({sessions:[workout]}).some(x=>x.message.includes('two different BPM')),'Zero-width random range is rejected');
 action.bpmFinish=19;
 assert(M.validateStore({sessions:[workout]}).some(x=>x.message.includes('20 to 300')),'Out-of-range BPM rejected');
}
console.log('Random progression two-value model tests: PASSED');
