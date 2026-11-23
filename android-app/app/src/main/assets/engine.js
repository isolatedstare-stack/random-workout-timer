/* Random Workout Timer — Stage 2 deterministic execution plan builder. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RWTEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const MAX_OCCURRENCES = 20000;
  const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
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
    const add = (action, setIndex, repetition, requestedSeconds) => {
      if (items.length >= MAX_OCCURRENCES) throw new Error('Session exceeds the 20,000-action planning limit. Reduce repetitions or set durations.');
      const durationMs = requestedSeconds * 1000;
      totalMs += durationMs;
      if (totalMs > MAX_SESSION_MS) throw new Error('Session exceeds the 7-day duration safety limit.');
      const item = {index: items.length, setIndex, repetition, actionId: action.id,
        actionName: action.name, ttsName: action.ttsName,
        metronome: Boolean(action.metronome), bpm: action.bpm, durationMs};
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
          const choices = set.actions.length > 1
            ? set.actions.filter(a => a.id !== previousId) : set.actions;
          const a = pick(choices.length ? choices : set.actions, rng);
          const duration = Math.min(remainingSeconds, between(a.duration.min, a.duration.max, rng));
          add(a, setIndex, 0, duration);
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
  return {createPlan,createRunner,MAX_OCCURRENCES};
});
