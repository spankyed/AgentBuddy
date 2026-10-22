import { open } from 'lmdb';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
for (const cache of (process.env.C ? [true] : [false])) {
  const root = open({ path: path.join(dir, 'db' + cache), cache });
  const db = root.openDB({ name: 'd', cache });
  db.transactionSync(() => {
    db.put(['v', 'Task-1', 'title'], ['A']);
    console.log('inside get', db.get(['v', 'Task-1', 'title']));
    console.log('inside range', [...db.getRange({ start: ['v', 'Task-1'], end: ['v', 'Task-1', '￿'] })].map(e => e.key));
  });
  db.putSync(['v', 'Task-1', 'info'], [{ a: undefined, d: new Date(0), n: null }]);
  console.log('after', db.get(['v', 'Task-1', 'info']));
  const o = db.get(['v', 'Task-1', 'title']); o.push('mut'); console.log('cache mut leak', db.get(['v', 'Task-1', 'title']));
  db.transactionSync(() => { db.transactionSync(() => db.put(['x'], 1)); console.log('nested ok', db.get(['x'])); });
  db.transactionSync(() => { db.putSync(['y'], 2); console.log('putSync inside', db.get(['y'])); });
  db.transactionSync(() => { for (const n of [10, 2, 1]) db.put(['e', 'Task', n], 'id' + n); });
  console.log([...db.getKeys({ start: ['e', 'Task'], end: ['e', 'Task', Infinity] })]);
  console.log([...db.getKeys({ start: ['e'], end: ['e', '￿'] })]);
  console.log([...db.getKeys({ start: ['e', 'Task', null], end: ['e', 'Task', '￿'] })]);
  console.log("closing"); await root.close(); console.log("closed");
}
fs.rmSync(dir, { recursive: true, force: true });
console.log("done"); process.exit(0);
