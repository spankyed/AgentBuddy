import { z } from 'zod';
import { ManifestSchema } from './manifest-schema.ts';
import { PACK_SNAPSHOT_FORMAT, PROVENANCE_KINDS, _snapshotFormatMismatch, type PackSnapshot, type ProvenanceKind } from './manifest.ts';
import { packValidation, type PackValidation } from './diagnostics.ts';
import { _declarationRevision } from './declaration-revision.ts';
import { _HelpDocumentsSchema, _helpDataProblem } from './help-data.ts';

/** The complete data artifact; executable pack modules are never needed to validate it. */
const SnapshotShape = {
  declarationRevision: z.string().regex(/^[a-f0-9]{64}$/, 'Must be a SHA-256 declaration revision'),
  format: z.number().int().nonnegative(),
  sdkVersion: z.string().optional(),
  manifest: ManifestSchema,
  help: _HelpDocumentsSchema.optional(),
  types: z.object({ entities: z.record(z.string()), relKinds: z.record(z.string()) }).strict(),
  facades: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/, 'Facade names must be lowercase identifiers with hyphens, suitable for cache filenames'), z.string()),
  provenance: z.record(z.enum(Object.keys(PROVENANCE_KINDS) as [ProvenanceKind, ...ProvenanceKind[]]), z.record(z.string())).optional(),
  flowHelpers: z.object({ exports: z.array(z.string()), module: z.string(), types: z.string() }).strict().optional(),
} satisfies Record<keyof PackSnapshot, z.ZodTypeAny>;
const SnapshotSchema: z.ZodType<PackSnapshot, z.ZodTypeDef, unknown> = z.object(SnapshotShape).strict();

export type PackSnapshotValidation = PackValidation & { snapshot?: PackSnapshot };

/** Validate data before any consumer reads declarations or resolves executable bindings. */
export function parseSnapshot(raw: unknown): PackSnapshotValidation {
  const mismatch = _snapshotFormatMismatch(raw);
  if (mismatch) return packValidation([{
    code: 'snapshot.format', severity: 'error', path: ['format'], source: 'snapshot.json',
    message: `${mismatch.problem}; this reader requires format ${PACK_SNAPSHOT_FORMAT}`,
    suggestion: mismatch.newer ? 'Update apack to use this build' : 'Rebuild with the matching apack CLI',
  }]);
  const result = SnapshotSchema.safeParse(raw);
  if (!result.success) return packValidation(result.error.issues.map(issue => ({
    code: `snapshot.${issue.code}`, severity: 'error', path: issue.path, source: 'snapshot.json',
    message: `snapshot.json ${issue.path.join('.') || 'root'}: ${issue.message}`,
  })));
  const snapshot = raw as PackSnapshot;
  if (snapshot.manifest.extensions?.help && snapshot.help === undefined) return packValidation([{
    code: 'snapshot.help.incomplete', severity: 'error', path: ['help'], source: 'snapshot.json',
    message: 'snapshot.json is missing declared help data; rebuild the complete pack',
  }]);
  const helpProblem = snapshot.help === undefined ? undefined : _helpDataProblem(snapshot.help, Object.keys(snapshot.manifest.features ?? {}));
  if (helpProblem || (snapshot.help !== undefined && !snapshot.manifest.extensions?.help)) return packValidation([{
    code: 'snapshot.help', severity: 'error', path: ['help'], source: 'snapshot.json',
    message: helpProblem ?? 'snapshot.json contains undeclared help data',
  }]);
  if (snapshot.declarationRevision !== _declarationRevision(snapshot.manifest)) return packValidation([{
    code: 'snapshot.declarations', severity: 'error', path: ['declarationRevision'], source: 'snapshot.json',
    message: 'snapshot.json declarations do not match their revision; rebuild the complete pack',
  }]);
  // Zod's object merge drops __proto__ keys in records. Validation must preserve every declared name.
  return { ...packValidation(), snapshot };
}
