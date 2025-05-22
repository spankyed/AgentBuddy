// schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const entity = sqliteTable("entity", {
	id: text("id").primaryKey(),
	type: text("type").notNull(),
	version: integer("version").notNull().default(0),
	createdAt: integer("created_at").notNull(),
});

function mkAttr(
	table: string,
	sqlType: (name: string) => ReturnType<typeof integer | typeof text>,
) {
	return sqliteTable(
		table,
		{
			entityId: text("entity_id")
				.notNull()
				.references(() => entity.id),
			kind: text("kind").notNull(),
			idx: integer("idx").notNull().default(0),
			value: sqlType("value"),
		},
		(t) => ({
			pk: [t.entityId, t.kind, t.idx] as const,
		}),
	);
}

export const attrText = mkAttr("attribute_text", text);
export const attrTime = mkAttr("attribute_timestamp", integer);
export const attrInt = mkAttr("attribute_int", integer);
export const attrJson = mkAttr("attribute_json", text);

export const role = sqliteTable(
	"role",
	{
		entityId: text("entity_id")
			.notNull()
			.references(() => entity.id),
		role: text("role").notNull(),
	},
	(t) => ({ pk: [t.entityId, t.role] as const }),
);

export const relation = sqliteTable(
	"relation",
	{
		srcId: text("src_id")
			.notNull()
			.references(() => entity.id),
		kind: text("kind").notNull(),
		tgtId: text("tgt_id")
			.notNull()
			.references(() => entity.id),
		info: text("info").notNull().default("{}"),
	},
	(t) => ({ pk: [t.srcId, t.kind, t.tgtId] as const }),
);
