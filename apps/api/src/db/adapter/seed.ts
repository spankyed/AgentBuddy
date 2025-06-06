// // main.ts
// import { db, repo, flush } from './hydrate';
// import * as mock from './mock-data';
// import { sql } from 'drizzle-orm';

// async function seedIfEmpty() {
//   const [{ cnt }] = await db
//     .select({ cnt: sql<number>`count(*)` })
//     .from('entity')   // you can pass table name directly or use entity table object
//     .limit(1);

//   if (cnt > 0) return;

//   await db.transaction(async (tx) => {
//     await tx.insert('entity').values(mock.pick.entity as any);
//     await tx.insert('attribute_text').values(mock.pick.attrText as any);
//     await tx.insert('attribute_timestamp').values(
//       mock.pick.attrTime.map((r) => ({ ...r, value: r.value as number }))
//     );
//     await tx.insert('role').values(mock.pick.role as any);
//     await tx.insert('relation').values(mock.pick.relation as any);
//   });
// }

// // (async () => {
// //   await seedIfEmpty();
// //   await repo.hydrate();
// //   console.log('Graph size:', inMemStore.size());

// //   // add a quick message
// //   const mId = await repo.createEntity('Message');
// //   await repo.addAttribute(mId, 'text', 'Hello Drizzle');
// //   await repo.addRole(mId, 'last_message');
// //   await repo.addRelation('Thread-ui', 'CONTAINS', mId);

// //   await flush();
// //   console.log('Done');
// // })();