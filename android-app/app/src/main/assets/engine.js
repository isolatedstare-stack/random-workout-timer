/* Random Workout Timer — Stage 2 deterministic execution plan builder. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RWTEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const MAX_OCCURRENCES = 20000;
  const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
  // Once every 4 seconds choose a fresh direction and a small BPM increment.
  // The complete path is decided at planning time so audio and display agree.
  const RANDOM_BPM_STEP_MS = 4000;
  function unitRandom(rng) {
    const x = Number(rng());
    if (!Number.isFinite(x) || x < 0 || x >= 1) throw new Error('Random generator returned an invalid number.');
    return x;
  }
  function between(min, max, rng) { return min + Math.floor(unitRandom(rng) * (max - min + 1)); }
  function pick(array, rng) { return array[Math.floor(unitRandom(rng) * array.length)]; }
  function shuffle(array, rng) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(unitRandom(rng) * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
  function weightedPick(group, rng) {
    const p = unitRandom(rng) * 100;
    let cumulative = 0;
    for (const a of group) {
      cumulative += a.probability;
      if (p < cumulative) return a;
    }
    return group[group.length - 1]; // Floating-point boundary safety.
  }
  function weightedActionPick(actions, rng) {
    const total = actions.reduce((sum, a) => sum + (a.weight ?? 1), 0);
    if (!(total > 0) || !Number.isFinite(total)) throw new Error('Invalid action weights.');
    const value = unitRandom(rng) * total;
    let cumulative = 0;
    for (const action of actions) {
      cumulative += action.weight ?? 1;
      if (value < cumulative) return action;
    }
    return actions[actions.length - 1];
  }
  function randomBpmCurve(start,min,max,durationMs,rng=Math.random) {
    if (![start,min,max].every(n => Number.isSafeInteger(n) && n>=20 && n<=300) ||
        min>=max || start<min || start>max || !Number.isFinite(durationMs) || durationMs<=0)
      throw new Error('Invalid random progression tempo or duration.');
    const curve=[start];
    let bpm=start;
    for(let t=RANDOM_BPM_STEP_MS;t<durationMs;t+=RANDOM_BPM_STEP_MS) {
      const direction=unitRandom(rng)<0.5?-1:1;
      const delta=between(2,7,rng);
      const safeDirection=bpm<=min?1:bpm>=max?-1:direction;
      bpm=Math.min(max,Math.max(min,bpm+safeDirection*delta));
      curve.push(bpm);
    }
    return curve;
  }
  // The last progressive BPM increment occurs one segment before the planned action ends.
  function bpmAtElapsed(item, elapsedMs) {
    if(item.bpmMode==='randomWalk'&&Array.isArray(item.bpmCurve)&&item.bpmCurve.length) {
      const step=Math.min(item.bpmCurve.length-1,Math.floor(Math.max(0,elapsedMs)/RANDOM_BPM_STEP_MS));
      return item.bpmCurve[step];
    }
    if (item.bpmMode !== 'progressive' || item.bpmStart === item.bpmFinish) return item.bpm;
    const difference = item.bpmFinish - item.bpmStart;
    const steps = Math.abs(difference);
    const duration = Math.max(1, item.plannedDurationMs);
    const elapsed = Math.max(0, Math.min(elapsedMs, duration));
    const completed = Math.min(steps, Math.floor(elapsed * (steps + 1) / duration));
    return item.bpmStart + Math.sign(difference) * completed;
  }
  function sequenceForRepetition(set, chosen, previousId, rng) {
    const eligible = set.actions.filter(a => !a.exclusive || a.id === chosen?.id);
    if (set.sequence === 'standard') {
      const result = eligible.slice();
      if (result.length > 1 && result[0].id === previousId) {
        const firstDifferent = result.findIndex(a => a.id !== previousId);
        if (firstDifferent !== -1) [result[0], result[firstDifferent]] = [result[firstDifferent], result[0]];
      }
      return result;
    }
    const eligibleStarts = eligible.filter(a => a.id !== previousId);
    const first = pick(eligibleStarts.length ? eligibleStarts : eligible, rng);
    return [first, ...shuffle(eligible.filter(a => a.id !== first.id), rng)];
  }
  function createPlan(session, rng = Math.random) {
    if (!session || !Array.isArray(session.sets) || !session.sets.length)
      throw new Error('A session with at least one set is required.');
    const items = [], sets = [];
    let totalMs = 0;
    const add = (action, setIndex, repetition, requestedSeconds, nominalSeconds = requestedSeconds) => {
      if (items.length >= MAX_OCCURRENCES) throw new Error('Session exceeds the 20,000-action planning limit. Reduce repetitions or set durations.');
      const durationMs = requestedSeconds * 1000;
      totalMs += durationMs;
      if (totalMs > MAX_SESSION_MS) throw new Error('Session exceeds the 7-day duration safety limit.');
      const baseStart = action.bpmStart ?? action.bpm ?? 120;
      const baseFinish = action.bpmFinish ?? action.bpm ?? 120;
      const bpmMode = ['progressive','randomWalk'].includes(action.bpmMode) ? action.bpmMode : 'static';
      const chosenBpm = action.metronome && bpmMode === 'static'
        ? between(Math.min(baseStart, baseFinish), Math.max(baseStart, baseFinish), rng) : baseStart;
      const item = {index: items.length, setIndex, repetition, actionId: action.id,
        actionName: action.name, ttsName: action.ttsName, metronome: Boolean(action.metronome),
        bpmMode, bpm: chosenBpm, bpmStart: chosenBpm,
        bpmFinish: bpmMode === 'progressive' ? baseFinish : chosenBpm,
        durationMs, plannedDurationMs: nominalSeconds * 1000};
      if(action.metronome&&bpmMode==='randomWalk'){
        item.bpmMin=action.bpmMin;
        item.bpmMax=action.bpmMax;
        item.bpmCurve=randomBpmCurve(baseStart,action.bpmMin,action.bpmMax,durationMs,rng);
      }
      items.push(item);
      return item;
    };
    for (let setIndex = 0; setIndex < session.sets.length; setIndex++) {
      const set = session.sets[setIndex];
      const firstIndex = items.length;
      const beforeMs = totalMs;
      let previousId = null;
      if (set.type === 'reps') {
        const exclusive = set.actions.filter(a => a.exclusive);
        for (let rep = 1; rep <= set.repetitions; rep++) {
          const chosen = exclusive.length ? weightedPick(exclusive, rng) : null;
          const ordered = sequenceForRepetition(set, chosen, previousId, rng);
          for (const a of ordered) {
            add(a, setIndex, rep, between(a.duration.min, a.duration.max, rng));
            previousId = a.id;
          }
        }
      } else if (set.type === 'time') {
        let remainingSeconds = between(set.duration.min, set.duration.max, rng);
        while (remainingSeconds > 0) {
          const avoidRepeat = set.timeSelectionPriority === 'avoidRepeat';
          const choices = avoidRepeat && set.actions.length > 1
            ? set.actions.filter(a => a.id !== previousId) : set.actions;
          const a = weightedActionPick(choices.length ? choices : set.actions, rng);
          const plannedDuration = between(a.duration.min, a.duration.max, rng);
          const duration = Math.min(remainingSeconds, plannedDuration);
          add(a, setIndex, 0, duration, plannedDuration);
          remainingSeconds -= duration;
          previousId = a.id;
        }
      } else {
        throw new Error('Unknown set type: ' + set.type);
      }
      sets.push({index: setIndex, id: set.id, name: set.name, type: set.type,
        firstIndex, afterLastIndex: items.length, durationMs: totalMs - beforeMs});
    }
    if (!items.length) throw new Error('The session contains no executable actions.');
    return {sessionId: session.id, sessionName: session.name, items, sets, totalMs};
  }
  // Pure runtime, driven by delta elapsed milliseconds. UI owns the clock and audio.
  function createRunner(plan) {
    if (!plan?.items?.length) throw new Error('Missing execution plan.');
    const state = {status:'running', index:0, actionElapsedMs:0, elapsedMs:0,
      effectiveTotalMs:plan.totalMs, setPlayedMs:plan.sets.map(()=>0),
      setTotalMs:plan.sets.map(s=>s.durationMs), completedBy:null};
    function current() {return state.status==='completed'||state.status==='stopped'?null:plan.items[state.index] || null;}
    function advance() {
      state.index++;
      state.actionElapsedMs = 0;
      if (state.index >= plan.items.length) {state.status='completed';state.completedBy='natural';}
    }
    function consume(deltaMs) {
      if (state.status !== 'running') return false;
      let delta = Math.max(0, Math.floor(deltaMs));
      let changed = false;
      while (delta > 0 && state.status === 'running') {
        const item = current();
        const amount = Math.min(delta, item.durationMs - state.actionElapsedMs);
        state.actionElapsedMs += amount;
        state.elapsedMs += amount;
        state.setPlayedMs[item.setIndex] += amount;
        delta -= amount;
        if (state.actionElapsedMs >= item.durationMs) {advance(); changed = true;}
      }
      return changed;
    }
    function skip(set) {
      if (!['running','paused'].includes(state.status)) return false;
      const startingSet = current().setIndex;
      do {
        const item = current();
        const remaining = item.durationMs - state.actionElapsedMs;
        state.effectiveTotalMs -= remaining;
        state.setTotalMs[item.setIndex] -= remaining;
        advance();
      } while (set && state.status!=='completed' && current().setIndex===startingSet);
      if (state.status === 'completed') state.completedBy = set?'skip-final-set':'skip-final-action';
      else if (state.status !== 'paused') state.status = 'running';
      return true;
    }
    return {plan,state,current,
      consume,
      pause() {if(state.status==='running')state.status='paused';},
      resume() {if(state.status==='paused')state.status='running';},
      skipAction() {return skip(false);},
      skipSet() {return skip(true);},
      stop() {if(['running','paused'].includes(state.status))state.status='stopped';},
      remainingMs() {return Math.max(0,state.effectiveTotalMs-state.elapsedMs);},
      remainingSetMs() {const item=current();return item?Math.max(0,state.setTotalMs[item.setIndex]-state.setPlayedMs[item.setIndex]):0;}
    };
  }
  return {createPlan,createRunner,bpmAtElapsed,randomBpmCurve,RANDOM_BPM_STEP_MS,MAX_OCCURRENCES};
});
