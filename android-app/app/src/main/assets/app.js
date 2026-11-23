/* Random Workout Timer Stage 3.2 — offline sessions, native audio and execution. */
(() => {
 'use strict';
 const M=window.RWTModel, E=window.RWTEngine, $=s=>document.querySelector(s), STORAGE='rwt-v3-sessions-v1';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let store=M.emptyStore();
 try {const saved=JSON.parse(localStorage.getItem(STORAGE)||'null'); if(saved) store=M.normalizeImport(saved);} catch(e){console.error('Session load failed',e);}
 let route={screen:'home',sessionId:null,setId:null,actionId:null};
 let runner=null,showTimes=true,lastTick=0,timerHandle=null,announcedIndex=-1,completionPlayed=false;
 const session=()=>store.sessions.find(s=>s.id===route.sessionId);
 const set=()=>session()?.sets.find(s=>s.id===route.setId);
 const action=()=>set()?.actions.find(a=>a.id===route.actionId);
 const issuesFor=(loc,id)=>M.validateStore(store).filter(x=>x[loc]===id);
 const issueHTML=items=>items.map(i=>`<div class="issue" role="status">${esc(i.message)}</div>`).join('');
 function toast(msg,bad=false){const n=$('#toast'); n.textContent=msg;n.className='show'+(bad?' bad':''); clearTimeout(toast.timer); toast.timer=setTimeout(()=>n.className='',4000);}
 function save(){try{localStorage.setItem(STORAGE,JSON.stringify(store));$('#saveStatus').textContent='Saved locally';return true;}catch(e){$('#saveStatus').textContent='Save failed';toast('Could not save on this device: '+e.message,true);return false;}}
 function go(screen,sessionId=null,setId=null,actionId=null){route={screen,sessionId,setId,actionId}; render();window.scrollTo(0,0);}
 function count(s){return s.sets.reduce((sum,t)=>sum+t.actions.length,0)}
 function opts(options,selected){return options.map(([v,name])=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(name)}</option>`).join('')}
 function field(label,path,val,kind='text',meta=''){
  if(kind==='select')return `<label class="field"><span>${esc(label)}</span><select data-field="${path}">${opts(meta,val)}</select></label>`;
  return `<label class="field"><span>${esc(label)}</span><input data-field="${path}" type="${kind}" value="${esc(val)}" ${kind==='number'?'inputmode="numeric" ':''}${meta}></label>`;
 }
 function nameField(label,path,val){return field(label,path,val,'text','maxlength="180" required')}
 function numberField(label,path,val,min,max){return field(label,path,val,'number',`min="${min}" max="${max}" step="1"`)}
 function statusChip(items){return `<span class="pill ${items.length?'warn':''}">${items.length?'Needs attention · '+items.length:'Ready'}</span>`}
 function actionButtons(list,index,group,id,allowDelete=true){return `<div class="actions">
 <button class="secondary icon" data-do="move-${group}" data-id="${id}" data-dir="-1" ${index===0?'disabled':''} aria-label="Move up">↑ Up</button>
 <button class="secondary icon" data-do="move-${group}" data-id="${id}" data-dir="1" ${index===list.length-1?'disabled':''} aria-label="Move down">↓ Down</button>
 <button class="secondary icon" data-do="copy-${group}" data-id="${id}">Duplicate</button>
 <button class="danger icon" data-do="delete-${group}" data-id="${id}" ${!allowDelete?'disabled title="At least one is required"':''}>Delete</button></div>`}
 function home(){return `<section class="panel"><div class="row between wrap"><div><h2>My sessions</h2><p class="muted small">${store.sessions.length} saved session${store.sessions.length===1?'':'s'}</p></div><button data-do="new-session">+ New session</button></div>
 ${store.sessions.length?store.sessions.map(s=>{const issues=issuesFor('sessionId',s.id);return `<article class="card"><div class="row between top"><div class="flex"><div class="card-title">${esc(s.name)||'<i>Unnamed session</i>'}</div><div class="card-meta">${s.sets.length} set${s.sets.length===1?'':'s'} · ${count(s)} action${count(s)===1?'':'s'}</div></div>${statusChip(issues)}</div><div class="actions"><button data-do="start-setup" data-id="${s.id}" ${issues.length?'disabled title="Resolve configuration issues first"':''}>Start</button><button class="secondary" data-do="open-session" data-id="${s.id}">Edit session</button><button class="secondary" data-do="copy-session" data-id="${s.id}">Duplicate</button><button class="danger" data-do="delete-session" data-id="${s.id}">Delete</button></div></article>`}).join(''):'<div class="empty">No sessions yet. Create your first session to begin.</div>'}
 </section><section class="panel"><h2>Backup & sound</h2><p class="muted small">Export your sessions to JSON or import a previous backup. Importing replaces the existing sessions after confirmation.</p><div class="actions"><button class="secondary" data-do="export">Export JSON</button><button class="secondary" data-do="import">Import JSON</button><button class="ghost" data-do="test-end">Preview ending chime</button></div><p class="hint">The completion chime is included now. It plays once after a completed session, including when the final set is skipped. Manual Stop stays silent.</p></section>`}
 function sessionPage(){const s=session();if(!s)return home();const issues=issuesFor('sessionId',s.id);return `<div class="back"><button class="ghost" data-do="back">← All sessions</button></div><section class="panel"><div class="row between"><h2>Session settings</h2>${statusChip(issues)}</div>${nameField('Session name','session.name',s.name)}<p class="hint">Names must be unique across sessions.</p>${issueHTML(issues.filter(x=>!x.setId))}</section>
 <section class="panel"><div class="row between wrap"><h2>Sets <span class="tag">${s.sets.length}</span></h2><button data-do="new-set">+ Add set</button></div><p class="muted small">Sets execute in the order listed. Use Up/Down to reorder them.</p>
 ${s.sets.map((t,i)=>{const localIssues=issues.filter(x=>x.setId===t.id);return `<article class="card"><div class="row between top"><div class="flex"><div class="card-title">${i+1}. ${esc(t.name)}</div><div class="card-meta">${t.type==='reps'?'Reps-based · '+t.repetitions+' repetitions':'Time-based · '+t.duration.min+'–'+t.duration.max+'s'} · ${t.actions.length} action${t.actions.length===1?'':'s'}</div></div>${statusChip(localIssues)}</div><div class="actions"><button data-do="open-set" data-id="${t.id}">Edit set</button></div>${actionButtons(s.sets,i,'set',t.id,s.sets.length>1)}</article>`}).join('')}</section>`}
 function setPage(){const s=session(),t=set();if(!s||!t)return home();const issues=issuesFor('setId',t.id),group=t.actions.filter(a=>a.exclusive);return `<div class="back"><button class="ghost" data-do="back">← ${esc(s.name)}</button></div><section class="panel"><div class="row between"><h2>Set settings</h2>${statusChip(issues)}</div>
 ${nameField('Set name','set.name',t.name)}
 ${field('Set type','set.type',t.type,'select',[['reps','Reps-based'],['time','Time-based']])}
 ${t.type==='reps'?`<div class="grid">${numberField('Repetitions','set.repetitions',t.repetitions,1,100000)}${field('Action sequence','set.sequence',t.sequence,'select',[['standard','Standard'],['random','Random']])}</div><p class="hint">One action from the mutual-exclusion group is randomly chosen per repetition. The other actions always run.</p>`:`<div class="grid">${numberField('Set duration: min seconds','set.duration.min',t.duration.min,1,86400)}${numberField('Set duration: max seconds','set.duration.max',t.duration.max,1,86400)}</div><p class="hint">Actions are selected based on their weights until the set duration is reached. The final action is shortened if needed.</p>${field('Action selection priority','set.timeSelectionPriority',t.timeSelectionPriority||'weights','select',[ ['weights','Weights first (allow repeats)'], ['avoidRepeat','Avoid consecutive repetitions first'] ])}<p class="hint">Weights first preserves selection probabilities, even when the same action repeats. Avoid repeats first chooses by weight among actions other than the previous one, where possible.</p>`}
 ${issueHTML(issues.filter(x=>!x.actionId))}</section>
 <section class="panel"><div class="row between wrap"><h2>Actions <span class="tag">${t.actions.length}</span></h2><button data-do="new-action">+ Add action</button></div><p class="muted small">Reorder actions with Up/Down. Each has its own duration, voice instruction and metronome settings.</p>
 ${t.type==='reps'&&group.length?`<div class="exclusive"><strong>Mutual-exclusion group:</strong> ${group.length} action${group.length===1?'':'s'}, total ${group.reduce((sum,a)=>sum+a.probability,0)}%. ${group.length<2?'Add a second exclusive action.':group.reduce((sum,a)=>sum+a.probability,0)!==100?'Adjust probabilities to total 100%.':'Group is valid.'}</div>`:''}
 ${t.actions.map((a,i)=>{const localIssues=issues.filter(x=>x.actionId===a.id);return `<article class="card"><div class="row between top"><div class="flex"><div class="card-title">${i+1}. ${esc(a.name)}</div><div class="card-meta">${a.duration.min}–${a.duration.max}s${a.metronome?' · '+(a.bpmStart??a.bpm)+(a.bpmMode==='progressive'?' → ':'–')+(a.bpmFinish??a.bpm)+' BPM':''}${t.type==='time'?' · Weight '+(a.weight??1):''}${t.type==='reps'&&a.exclusive?' · Exclusive '+a.probability+'%':''}</div></div>${statusChip(localIssues)}</div><div class="actions"><button data-do="open-action" data-id="${a.id}">Edit action</button></div>${actionButtons(t.actions,i,'action',a.id,t.actions.length>1)}</article>`}).join('')}
 </section>`}
 function actionPage(){const s=session(),t=set(),a=action();if(!s||!t||!a)return home();const issues=issuesFor('actionId',a.id);return `<div class="back"><button class="ghost" data-do="back">← ${esc(t.name)}</button></div>
 <section class="panel"><div class="row between"><h2>Action settings</h2>${statusChip(issues)}</div>
 ${nameField('Action name','action.name',a.name)}
 ${field('TTS announcement','action.ttsName',a.ttsName,'text','maxlength="300"')}
 <div class="actions"><button class="ghost" data-do="restore-tts">Use action name</button><button class="secondary" data-do="test-tts">Test announcement</button></div>
 <p class="hint">The announcement initially follows the action name. Edit it to use a different spoken instruction.</p>
 <div class="grid">${numberField('Duration: min seconds','action.duration.min',a.duration.min,1,86400)}${numberField('Duration: max seconds','action.duration.max',a.duration.max,1,86400)}</div>
 ${t.type==='reps'?`<div class="exclusive"><label class="toggle"><input type="checkbox" data-field="action.exclusive" ${a.exclusive?'checked':''}><strong>Mutually exclusive</strong></label><p class="hint">When selected, this action belongs to the set's single weighted-selection group.</p>${a.exclusive?numberField('Selection probability (%)','action.probability',a.probability,0,100):''}</div>`:`<div class="exclusive">${field('Action weight','action.weight',a.weight??1,'number','min="0.000001" max="1000000" step="any"')}<p class="hint">Weight 1 is the baseline; 1.5 makes an action 50% more likely and 0.5 makes it 50% less likely than a weight-1 action on each eligible draw.</p></div>`}
 <div class="exclusive"><label class="toggle"><input type="checkbox" data-field="action.metronome" ${a.metronome?'checked':''}><strong>Enable metronome</strong></label>${a.metronome?'<div class="grid">'+numberField('Start BPM','action.bpmStart',a.bpmStart??a.bpm,20,300)+numberField('Finish BPM','action.bpmFinish',a.bpmFinish??a.bpm,20,300)+'</div>'+field('BPM behavior','action.bpmMode',a.bpmMode||'static','select',[['static','Static — random each time'],['progressive','Progressive — ramp during action']])+'<div class="actions"><button class="secondary" data-do="test-metronome">Test metronome (5s)</button></div>':''}<p class="hint">Static: a new BPM is randomly chosen between the two values for each execution. Progressive: BPM moves from start toward finish over the full planned action duration, even when the set cuts the action short. Voice announcements duck the metronome.</p></div>
 ${issueHTML(issues)}</section>`}
 function fmt(ms){const sec=Math.floor(Math.max(0,ms)/1000);return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');}
 function prestartPage(){const s=session();if(!s)return home();return `<div class="back"><button class="ghost" data-do="back">← All sessions</button></div><section class="panel"><div class="eyebrow">Ready to start</div><h2>${esc(s.name)}</h2><p class="muted">The complete random sequence and its durations will be calculated once, before execution.</p><h3>Show timers during this session?</h3><p class="hint">Choose whether to display elapsed and total time for the session, set and action.</p><div class="actions"><button class="${showTimes?'':'secondary'}" data-do="show-timers">Show timers</button><button class="${!showTimes?'':'secondary'}" data-do="hide-timers">Hide timers</button></div><div class="actions"><button data-do="begin-session">Start session</button><button class="ghost" data-do="back">Cancel</button></div></section>`;}
 function playerPage(){if(!runner)return home();const st=runner.state;const item=runner.current();const setInfo=item?runner.plan.sets[item.setIndex]:null;
   if(st.status==='completed')return `<section class="panel" style="text-align:center"><div class="eyebrow">Session finished</div><h2>${esc(runner.plan.sessionName)}</h2><p>The session has ended. The completion chime plays automatically.</p>${showTimes?`<p class="muted">Elapsed ${fmt(st.elapsedMs)} · Planned ${fmt(st.effectiveTotalMs)}</p>`:''}<div class="actions" style="justify-content:center"><button data-do="finish-exit">Back to sessions</button></div></section>`;
   const actionTotal=item.durationMs, setTotal=runner.state.setTotalMs[item.setIndex];
   return `<section class="panel"><div class="row between"><div><div class="eyebrow">${st.status==='paused'?'Paused':'Workout running'}</div><h2>${esc(runner.plan.sessionName)}</h2></div><span class="pill">Set ${item.setIndex+1}/${runner.plan.sets.length}</span></div>
   <p class="muted">${esc(setInfo.name)}${item.repetition?' · Repetition '+item.repetition:''}</p><div class="current-action">${esc(item.actionName)}</div>${item.metronome?`<p class="hint">Metronome · <span id="currentBpm">${E.bpmAtElapsed(item,st.actionElapsedMs)}</span> BPM${item.bpmMode==='progressive'?' · '+item.bpmStart+' → '+item.bpmFinish+' BPM':''}. Volume lowers during speech.</p>`:''}
   ${showTimes?`<div class="time-grid"><div><span class="muted small">Session elapsed / total</span><strong id="sessionClock">${fmt(st.elapsedMs)} / ${fmt(st.effectiveTotalMs)}</strong></div><div><span class="muted small">Set elapsed / total</span><strong id="setClock">${fmt(st.setPlayedMs[item.setIndex])} / ${fmt(setTotal)}</strong></div><div><span class="muted small">Action elapsed / total</span><strong id="actionClock">${fmt(st.actionElapsedMs)} / ${fmt(actionTotal)}</strong></div></div>`:''}
   <div class="actions"><button data-do="${st.status==='paused'?'resume-session':'pause-session'}">${st.status==='paused'?'Resume':'Pause'}</button><button class="secondary" data-do="skip-action">Skip action</button><button class="secondary" data-do="skip-set">Skip set</button><button class="danger" data-do="stop-session">Stop</button></div></section>`;
 }
 function render(){let page=route.screen==='home'?home():route.screen==='session'?sessionPage():route.screen==='set'?setPage():route.screen==='prestart'?prestartPage():route.screen==='player'?playerPage():actionPage();$('#app').innerHTML=page;$('#saveStatus').textContent='Saved locally';}
 function updateClocks(){if(!runner||route.screen!=='player')return;const item=runner.current();if(!item)return;
   const st=runner.state;const bpmLabel=$('#currentBpm');if(bpmLabel)bpmLabel.textContent=String(E.bpmAtElapsed(item,st.actionElapsedMs));
   if(!showTimes)return;const fields=[['#sessionClock',fmt(st.elapsedMs)+' / '+fmt(st.effectiveTotalMs)],['#setClock',fmt(st.setPlayedMs[item.setIndex])+' / '+fmt(st.setTotalMs[item.setIndex])],['#actionClock',fmt(st.actionElapsedMs)+' / '+fmt(item.durationMs)]];
   for(const [key,val] of fields){const node=$(key);if(node)node.textContent=val;}
 }
 function nativeStop(){if(window.AndroidSpeech){AndroidSpeech.stop();AndroidSpeech.keepScreenOn(false);}else if(window.speechSynthesis)speechSynthesis.cancel();}
 function sayCurrent(){if(!runner||runner.state.status!=='running')return;const item=runner.current();if(!item)return;announcedIndex=runner.state.index;
   if(window.AndroidSpeech&&typeof AndroidSpeech.startAction==='function')
     AndroidSpeech.startAction(item.ttsName,'system',Boolean(item.metronome),Number(item.bpmStart)||120,Number(item.bpmFinish)||120,item.bpmMode==='progressive',item.plannedDurationMs,runner.state.actionElapsedMs);
   else if(window.AndroidSpeech)AndroidSpeech.speak(item.ttsName,'system');
   else if(window.speechSynthesis){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(item.ttsName));}
 }
 function finishRun(){clearInterval(timerHandle);timerHandle=null;nativeStop();if(!completionPlayed){completionPlayed=true;if(window.AndroidSpeech)AndroidSpeech.playCompletionSound();else new Audio('session_end_bong.wav').play().catch(()=>{});}render();}
 function tick(){if(!runner||runner.state.status!=='running')return;const now=performance.now();const delta=Math.max(0,now-lastTick);lastTick=now;
   const prior=runner.state.index;runner.consume(delta);
   if(runner.state.status==='completed'){finishRun();return;}
   if(runner.state.index!==prior){render();sayCurrent();}else updateClocks();
 }
 function begin(){const s=session();if(!s)return;const errors=M.validateStore({schemaVersion:1,sessions:[s]});if(errors.length){toast('Fix the '+errors.length+' configuration issue(s) before starting.',true);return;}
   try{const plan=E.createPlan(s);runner=E.createRunner(plan);completionPlayed=false;announcedIndex=-1;
     if(window.AndroidSpeech)AndroidSpeech.keepScreenOn(true);
     go('player',s.id);lastTick=performance.now();clearInterval(timerHandle);timerHandle=setInterval(tick,150);sayCurrent();
   }catch(e){toast('Could not plan session: '+e.message,true);}
 }
 function playCommand(cmd){if(!runner)return;
   if(cmd==='finish-exit'){runner=null;go('home');return;}
   if(cmd==='stop-session'){if(!confirm('Stop this session? The completion sound will not play.'))return;runner.stop();clearInterval(timerHandle);timerHandle=null;nativeStop();runner=null;go('home');toast('Session stopped.');return;}
   if(cmd==='pause-session'){tick();if(runner.state.status!=='running')return;runner.pause();nativeStop();render();return;}
   if(cmd==='resume-session'){if(runner.state.status!=='paused')return;runner.resume();lastTick=performance.now();if(window.AndroidSpeech)AndroidSpeech.keepScreenOn(true);render();sayCurrent();return;}
   if(cmd==='skip-action'||cmd==='skip-set'){
     if(runner.state.status==='running')tick();
     if(runner.state.status==='completed')return;
     const wasRunning=runner.state.status==='running';
     runner[cmd==='skip-action'?'skipAction':'skipSet']();
     if(runner.state.status==='completed'){finishRun();return;}
     if(wasRunning){lastTick=performance.now();render();sayCurrent();}
     else render();
   }
 }

 function valueTarget(path){const [entity,...fields]=path.split('.');const obj=entity==='session'?session():entity==='set'?set():action();if(!obj)return null;let parent=obj;for(let i=0;i<fields.length-1;i++)parent=parent[fields[i]];return {obj,parent,key:fields[fields.length-1],field:fields.join('.')};}
 function onField(el){if(runner&&['running','paused'].includes(runner.state.status))return;const path=el.dataset.field;if(!path)return;const target=valueTarget(path);if(!target)return;
 const {obj,parent,key,field}=target;let val=el.type==='checkbox'?el.checked:el.type==='number'?(el.value.trim()===''?null:Number(el.value)):el.value;
 if(field==='name' && typeof val==='string' && !obj.ttsCustomized && obj.ttsName===obj.name) obj.ttsName=val;
 parent[key]=val;
 if(field==='ttsName')obj.ttsCustomized=val!==obj.name;
 if(field==='type' && val==='time'){} // Keep reps settings for when users switch types again.
 save();
 }
 function onButton(node){const cmd=node.dataset.do,id=node.dataset.id,dir=Number(node.dataset.dir);
 if(['pause-session','resume-session','skip-action','skip-set','stop-session','finish-exit'].includes(cmd)){playCommand(cmd);return;}
 if(cmd==='show-timers'||cmd==='hide-timers'){showTimes=cmd==='show-timers';render();return;}
 if(cmd==='begin-session'){begin();return;}
 if(cmd==='start-setup'){const s=store.sessions.find(x=>x.id===id);if(!s)return;const issues=issuesFor('sessionId',s.id);if(issues.length){toast('Resolve configuration issues before starting.',true);return;}showTimes=true;go('prestart',id);return;}
 if(runner&&['running','paused'].includes(runner.state.status))return;
 if(cmd==='back'){if(route.screen==='action')go('set',route.sessionId,route.setId);else if(route.screen==='set')go('session',route.sessionId);else go('home');return;}
 if(cmd==='new-session'){const s=M.newSession(M.uniqueName('Session 1',store.sessions));store.sessions.push(s);save();go('session',s.id);return;}
 if(cmd==='new-set'){const s=session();if(!s)return;const t=M.newSet(M.uniqueName('Set '+(s.sets.length+1),s.sets));s.sets.push(t);save();go('set',s.id,t.id);return;}
 if(cmd==='new-action'){const t=set();if(!t)return;const a=M.newAction('Action '+(t.actions.length+1));t.actions.push(a);save();go('action',route.sessionId,t.id,a.id);return;}
 if(cmd==='open-session'){go('session',id);return;}
 if(cmd==='open-set'){go('set',route.sessionId,id);return;}
 if(cmd==='open-action'){go('action',route.sessionId,route.setId,id);return;}
 if(cmd==='copy-session'){const i=store.sessions.findIndex(s=>s.id===id);if(i<0)return;const copy=M.copySession(store.sessions[i],store.sessions);store.sessions.splice(i+1,0,copy);save();render();toast('Session duplicated.');return;}
 if(cmd==='copy-set'){const s=session(),i=s.sets.findIndex(t=>t.id===id);if(i<0)return;const copy=M.copySet(s.sets[i],s.sets);s.sets.splice(i+1,0,copy);save();render();toast('Set duplicated.');return;}
 if(cmd==='copy-action'){const t=set(),i=t.actions.findIndex(a=>a.id===id);if(i<0)return;const copy=M.copyAction(t.actions[i]);t.actions.splice(i+1,0,copy);save();render();toast('Action duplicated.');return;}
 if(cmd==='delete-session'){const s=store.sessions.find(x=>x.id===id);if(!s||!confirm('Delete "'+s.name+'" and ALL its sets and actions? This cannot be undone.'))return;store.sessions=store.sessions.filter(x=>x.id!==id);save();render();toast('Session deleted.');return;}
 if(cmd==='delete-set'){const s=session(),t=s.sets.find(x=>x.id===id);if(!t)return;if(s.sets.length<=1){toast('Every session must have at least one set.',true);return;}if(!confirm('Delete set "'+t.name+'" and all its actions? This cannot be undone.'))return;s.sets=s.sets.filter(x=>x.id!==id);save();render();toast('Set deleted.');return;}
 if(cmd==='delete-action'){const t=set(),a=t.actions.find(x=>x.id===id);if(!a)return;if(t.actions.length<=1){toast('Every set must have at least one action.',true);return;}if(!confirm('Delete action "'+a.name+'"?'))return;t.actions=t.actions.filter(x=>x.id!==id);save();render();toast('Action deleted.');return;}
 if(cmd?.startsWith('move-')){const group=cmd.slice(5),list=group==='set'?session()?.sets:set()?.actions;const i=list?.findIndex(x=>x.id===id);if(i===undefined||i<0)return;M.move(list,i,dir);save();render();return;}
 if(cmd==='restore-tts'){const a=action();if(a){a.ttsName=a.name;a.ttsCustomized=false;save();render();toast('Announcement now follows the action name.')}return;}
 if(cmd==='test-metronome'){const a=action();if(!a?.metronome)return toast('Enable the metronome first.',true);if(window.AndroidSpeech&&typeof AndroidSpeech.testMetronome==='function'){AndroidSpeech.testMetronome(Number(a.bpmStart??a.bpm)||120);toast('Previewing the starting BPM for 5 seconds.');}else toast('Metronome test requires the Stage 3.1 Android app.',true);return;}
 if(cmd==='test-tts'){const a=action();if(!a?.ttsName.trim())return toast('Enter an announcement first.',true);if(window.AndroidSpeech){AndroidSpeech.speak(a.ttsName,'system');toast('Sending announcement to Android TTS.')}else if(window.speechSynthesis){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(a.ttsName));}else toast('Speech preview is available in Android.',true);return;}
 if(cmd==='test-end'){if(window.AndroidSpeech&&typeof AndroidSpeech.playCompletionSound==='function'){AndroidSpeech.playCompletionSound();toast('Playing end-of-session chime.');}else{new Audio('session_end_bong.wav').play().then(()=>toast('Playing end-of-session chime.')).catch(()=>toast('Audio preview unavailable.',true));}return;}
 if(cmd==='export'){const data=JSON.stringify(store,null,2),name='random-workout-sessions-'+new Date().toISOString().slice(0,10)+'.json';if(window.AndroidSpeech&&typeof AndroidSpeech.exportConfiguration==='function'){AndroidSpeech.exportConfiguration(data,name);toast('Choose where to save your JSON backup.')}else{const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}return;}
 if(cmd==='import'){if(window.AndroidSpeech&&typeof AndroidSpeech.importConfiguration==='function'){AndroidSpeech.importConfiguration();}else $('#importFile').click();return;}
 }
 $('#app').addEventListener('click',e=>{const node=e.target.closest('button[data-do]');if(node&&!node.disabled)onButton(node)});
 $('#app').addEventListener('input',e=>{if(e.target.matches('[data-field]'))onField(e.target)});
 $('#app').addEventListener('change',e=>{if(e.target.matches('[data-field]')){onField(e.target);render();}});
 function importText(jsonText){
  if (typeof jsonText !== 'string' || !jsonText.trim()) {
    toast('The selected backup is empty. Re-export your sessions from Stage 1, then import the new file.',true);return;
  }
  let parsed;
  try {parsed=JSON.parse(jsonText.replace(/^\uFEFF/,''));}
  catch(err){toast('Backup is incomplete or invalid JSON ('+jsonText.length+' characters). Please export it again from Stage 1.',true);return;}
  try {
   if(!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sessions))throw new Error('This file is not a Random Workout Timer sessions backup.');
   const imported=M.normalizeImport(parsed);
   const warnings=M.validateStore(imported);
   const question='Import '+imported.sessions.length+' session(s)? This will REPLACE all sessions currently saved in this app.'+(warnings.length?'\n\nNote: '+warnings.length+' configuration warning(s) will need attention.':'');
   if(!confirm(question))return;
   const previous=store;
   store=imported;
   if(!save()){store=previous;return;}
   go('home');toast('Backup imported successfully.');
  }catch(err){toast('Import failed: '+err.message,true);}
 }
 $('#importFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.size>5*1024*1024){toast('Backup exceeds the 5 MB limit.',true);return;}
  if(file.size===0){toast('This backup is empty (0 bytes). Export a new JSON file from Stage 1.',true);return;}
  try{const text=await file.text();importText(text);}catch(err){toast('Unable to read the backup: '+err.message,true);}
 });
 window.onNativeJsonImport=(state,content)=>{
  if(state==='ok')importText(content);
  else toast(content||'Could not read the selected backup.',true);
 };
 window.onNativeBackupEvent=(state,detail)=>toast(detail,state!=='ok');
 window.onNativeSpeechEvent=(state,detail)=>{if(state==='metronome-error')toast(detail||'Metronome failed to start.',true);else if(state==='metronome-test-started'||state==='metronome-test-ended')toast(detail);};
 render();
})();
