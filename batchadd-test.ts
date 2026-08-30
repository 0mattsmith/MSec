// Regression: adding many items must not lose all but the last.
// Models React's setState semantics — the bug was building the new array from
// a captured `state` instead of the functional `prev`.
let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

type Item = { id: string; title: string };

function makeStore(initial: Item[]) {
  let committed: Item[] = [...initial];
  const queue: ((prev: Item[]) => Item[])[] = [];
  return {
    // Value a component closure would see: only updates after a "render".
    get captured() { return committed; },
    setStateFunctional(fn: (prev: Item[]) => Item[]) { queue.push(fn); },
    setStateStale(next: Item[]) { queue.push(() => next); },
    flush() { for (const fn of queue) committed = fn(committed); queue.length = 0; return committed; },
  };
}

const incoming: Item[] = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, title: `TOTP ${i}` }));
const existing: Item[] = Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, title: `Existing ${i}` }));

// --- The old behaviour ---
const buggy = makeStore(existing);
for (const item of incoming) {
  buggy.setStateStale([...buggy.captured, item]); // reads the same stale array each time
}
const buggyResult = buggy.flush();
check(buggyResult.length === existing.length + 1,
  `old one-by-one approach kept only ${buggyResult.length - existing.length} of ${incoming.length} imported items (the bug)`);

// --- addItem, now functional ---
const perItem = makeStore(existing);
for (const item of incoming) {
  perItem.setStateFunctional((prev) => [...prev, item]);
}
const perItemResult = perItem.flush();
check(perItemResult.length === existing.length + incoming.length,
  `functional per-item add keeps all ${incoming.length} (total ${perItemResult.length})`);

// --- addItems, one batched update ---
const batched = makeStore(existing);
batched.setStateFunctional((prev) => [...prev, ...incoming]);
const batchedResult = batched.flush();
check(batchedResult.length === 14, `batched add: ${batchedResult.length} items total`);
check(existing.every(e => batchedResult.some(r => r.id === e.id)), 'existing 7 TOTP entries preserved');
check(incoming.every(i => batchedResult.some(r => r.id === i.id)), 'all 7 imported entries present');
check(new Set(batchedResult.map(r => r.id)).size === 14, 'no duplicates introduced');

console.log(fail ? `\n${fail} FAILED` : '\nBatch import verified.');
process.exit(fail?1:0);
