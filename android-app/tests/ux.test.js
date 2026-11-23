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
