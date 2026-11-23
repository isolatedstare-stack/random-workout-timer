/* Random Workout Timer: Stage 1 configuration model. No network or framework needed. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RWTModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  let fallbackCounter = 0;
  const id = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'rwt-' + Date.now().toString(36) + '-' + (++fallbackCounter).toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  const range = (min, max) => ({min, max});
  const newAction = (name = 'Action 1') => ({id: id(), name, ttsName: name, ttsCustomized: false,
    duration: range(20, 40), exclusive: false, probability: 0, weight: 1,
    metronome: false, bpm: 120, bpmStart: 120, bpmFinish: 120, bpmMode: 'static'});
  const newSet = (name = 'Set 1') => ({id: id(), name, type: 'reps', repetitions: 3,
    sequence: 'standard', duration: range(180, 300), timeSelectionPriority: 'weights', actions: [newAction()]});
  const newSession = (name = 'Session 1') => ({id: id(), name, voiceName: '', sets: [newSet()]});
  const emptyStore = () => ({schemaVersion: VERSION, sessions: []});
  const normalName = value => String(value ?? '').trim().toLocaleLowerCase();
  function uniqueName(original, siblings) {
    const reserved = new Set(siblings.map(x => normalName(x.name)));
    const base = String(original || 'Untitled').trim();
    if (!reserved.has(normalName(base))) return base;
    let n = 1, candidate;
    do { candidate = base + (n === 1 ? ' (copy)' : ' (copy ' + n + ')'); n++; }
    while (reserved.has(normalName(candidate)));
    return candidate;
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  function copyAction(src) { const a = clone(src); a.id = id(); a.name += ' (copy)'; if (!a.ttsCustomized) a.ttsName = a.name; return a; }
  function copySet(src, siblings) { const s = clone(src); s.id = id(); s.name = uniqueName(s.name, siblings); s.actions = src.actions.map(a => ({...clone(a), id: id()})); return s; }
  function copySession(src, siblings) { const s = clone(src); s.id = id(); s.name = uniqueName(s.name, siblings); s.sets = src.sets.map(t => ({...clone(t), id: id(), actions: t.actions.map(a => ({...clone(a), id: id()}))})); return s; }
  function move(array, from, direction) { const to = from + direction; if (from < 0 || from >= array.length || to < 0 || to >= array.length) return false; [array[from], array[to]] = [array[to], array[from]]; return true; }
  function inRangeInteger(n, min, max) { return Number.isSafeInteger(n) && n >= min && n <= max; }
  function checkDuration(value, loc, issues) {
    if (!value || !inRangeInteger(value.min, 1, 86400) || !inRangeInteger(value.max, 1, 86400) || value.min > value.max)
      issues.push({...loc, message: 'Duration must be 1–86400 seconds, with minimum ≤ maximum.'});
  }
  function validateStore(store) {
    const issues = [], sessionNames = new Set();
    (store.sessions || []).forEach((session, si) => {
      const loc = {sessionId: session.id};
      if (!normalName(session.name)) issues.push({...loc, message: 'Session name cannot be empty.'});
      if (sessionNames.has(normalName(session.name))) issues.push({...loc, message: 'Session names must be unique.'});
      sessionNames.add(normalName(session.name));
      if (!session.sets.length) issues.push({...loc, message: 'Session needs at least one set.'});
      const setNames = new Set();
      session.sets.forEach((set, setI) => {
        const sl = {...loc, setId: set.id};
        if (!normalName(set.name)) issues.push({...sl, message: 'Set name cannot be empty.'});
        if (setNames.has(normalName(set.name))) issues.push({...sl, message: 'Set names must be unique within the session.'});
        setNames.add(normalName(set.name));
        if (!['reps','time'].includes(set.type)) issues.push({...sl, message: 'Unknown set type.'});
        if (set.type === 'time' && !['weights','avoidRepeat'].includes(set.timeSelectionPriority ?? 'weights'))
          issues.push({...sl, message: 'Choose weights first or avoid repetitions first.'});
        if (set.type === 'reps') {
          if (!inRangeInteger(set.repetitions, 1, 100000)) issues.push({...sl, message: 'Repetitions must be a positive integer.'});
          if (!['standard','random'].includes(set.sequence)) issues.push({...sl, message: 'Choose standard or random action sequence.'});
          const group = set.actions.filter(a => a.exclusive);
          if (group.length === 1) issues.push({...sl, message: 'Mutually exclusive actions require at least two members.'});
          if (group.length >= 2 && group.reduce((sum,a) => sum + a.probability, 0) !== 100)
            issues.push({...sl, message: 'Mutually exclusive probabilities must total exactly 100% (currently ' + group.reduce((sum,a)=>sum+a.probability,0) + '%).'});
        } else if (set.type === 'time') checkDuration(set.duration, sl, issues);
        if (!set.actions.length) issues.push({...sl, message: 'Set needs at least one action.'});
        set.actions.forEach(action => {
          const al = {...sl, actionId: action.id};
          if (!normalName(action.name)) issues.push({...al, message: 'Action name cannot be empty.'});
          if (!normalName(action.ttsName)) issues.push({...al, message: 'TTS name cannot be empty.'});
          checkDuration(action.duration, al, issues);
          if (set.type === 'reps' && action.exclusive && !inRangeInteger(action.probability, 0, 100))
            issues.push({...al, message: 'Selection probability must be an integer from 0 to 100.'});
          if (set.type === 'time' && !(Number.isFinite(action.weight ?? 1) && (action.weight ?? 1) > 0 && (action.weight ?? 1) <= 1000000))
            issues.push({...al, message: 'Action weight must be greater than 0 and at most 1,000,000.'});
          if (action.metronome) {
            const mode = action.bpmMode ?? 'static';
            if (!['static','progressive','randomWalk'].includes(mode))
              issues.push({...al, message: 'Choose static, progressive, or random progression BPM.'});
            const start = action.bpmStart ?? action.bpm, finish = action.bpmFinish ?? action.bpm;
            if (!inRangeInteger(start, 20, 300) || !inRangeInteger(finish, 20, 300))
              issues.push({...al, message: 'Start and finish BPM must both be integers from 20 to 300.'});
            if(mode === 'randomWalk' && start === finish)
              issues.push({...al, message: 'Random progression needs two different BPM values to create a range.'});
          }
        });
      });
    });
    return issues;
  }
  // Import only known fields into new objects; don't trust prototypes or IDs from files.
  function normalizeImport(raw) {
    if (!raw || raw.schemaVersion !== VERSION || !Array.isArray(raw.sessions)) throw new Error('Not a compatible Random Workout Timer backup (schema v1 required).');
    if (raw.sessions.length > 250) throw new Error('The backup contains too many sessions.');
    const store = emptyStore();
    for (const original of raw.sessions) {
      if (!original || !Array.isArray(original.sets) || original.sets.length > 100) throw new Error('Malformed session or too many sets.');
      const session = {id: id(), name: String(original.name ?? '').slice(0, 180),
         voiceName: String(original.voiceName ?? '').slice(0, 180), sets: []};
      for (const entry of original.sets) {
        if (!entry || !Array.isArray(entry.actions) || entry.actions.length > 200) throw new Error('Malformed set or too many actions.');
        const set = {id: id(), name: String(entry.name ?? '').slice(0, 180),
          type: entry.type === 'time' ? 'time' : entry.type === 'reps' ? 'reps' : null,
          repetitions: entry.repetitions == null ? null : Number(entry.repetitions), sequence: entry.sequence,
          duration: {min: entry.duration?.min == null ? null : Number(entry.duration.min), max: entry.duration?.max == null ? null : Number(entry.duration.max)},
          timeSelectionPriority: entry.timeSelectionPriority ?? 'weights', actions: []};
        if (!set.type) throw new Error('Unknown set type in backup.');
        for (const a of entry.actions) {
          if (!a || typeof a !== 'object') throw new Error('Malformed action in backup.');
          set.actions.push({id: id(), name: String(a.name ?? '').slice(0,180),
            ttsName: String(a.ttsName ?? a.name ?? '').slice(0,300), ttsCustomized: Boolean(a.ttsCustomized),
            duration: {min: a.duration?.min == null ? null : Number(a.duration.min), max: a.duration?.max == null ? null : Number(a.duration.max)},
            exclusive: Boolean(a.exclusive), probability: Number(a.probability),
            weight: a.weight === null ? null : Number(a.weight ?? 1), metronome: Boolean(a.metronome),
            bpm: a.bpm === null ? null : Number(a.bpmStart ?? a.bpm ?? 120),
            bpmStart: a.bpmStart === null ? null : Number(a.bpmStart ?? a.bpm ?? 120),
            bpmFinish: a.bpmFinish === null ? null : Number(a.bpmFinish ?? a.bpm ?? 120),
            bpmMode: a.bpmMode ?? 'static'});
        }
        session.sets.push(set);
      }
      store.sessions.push(session);
    }
    // Structural safety checks: allow incomplete drafts, but never empty hierarchy.
    if (store.sessions.some(s => !s.sets.length || s.sets.some(t => !t.actions.length)))
      throw new Error('Each session must contain a set, and each set must contain an action.');
    return store;
  }
  return {VERSION, id, newAction, newSet, newSession, emptyStore, uniqueName,
    copyAction, copySet, copySession, move, validateStore, normalizeImport};
});
