import { z } from 'zod';

const recordGrammar = Symbol('declaration record grammar');
type RecordDefinition = z.ZodTypeDef & { [recordGrammar]?: z.ZodTypeAny };

/** Validate dictionary entries without Zod's object merge discarding an own __proto__ key. */
export function declarationRecord<K extends z.KeySchema, V extends z.ZodTypeAny>(key: K, value: V):
  z.ZodType<z.output<z.ZodRecord<K, V>>, z.ZodTypeDef, z.input<z.ZodRecord<K, V>>>;
export function declarationRecord<V extends z.ZodTypeAny>(value: V):
  z.ZodType<z.output<z.ZodRecord<z.ZodString, V>>, z.ZodTypeDef, z.input<z.ZodRecord<z.ZodString, V>>>;
export function declarationRecord(keyOrValue: z.ZodTypeAny, value?: z.ZodTypeAny): z.ZodTypeAny {
  const grammar = value === undefined ? z.record(keyOrValue) : z.record(keyOrValue as z.KeySchema, value);
  const entries = z.array(z.tuple([grammar.keySchema, grammar.valueSchema]));
  const schema = z.unknown().transform((raw, ctx) => {
    if (z.getParsedType(raw) !== z.ZodParsedType.object) {
      const result = grammar.safeParse(raw);
      if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, fatal: true });
      return z.NEVER;
    }
    const input = Object.entries(raw as Record<string, unknown>);
    const result = entries.safeParse(input);
    if (!result.success) {
      const path = (original: (string | number)[]) => [...ctx.path, input[Number(original[0])][0], ...original.slice(2)];
      for (const issue of result.error.issues) {
        const mapped = mapIssue(issue, path);
        ctx.addIssue({ ...mapped, path: mapped.path.slice(ctx.path.length), fatal: true });
      }
      return z.NEVER;
    }
    return Object.fromEntries(result.data);
  });
  // Zod's describe() copies its definition, including this symbol. Formatters use the same key/value grammar.
  Object.assign(schema._def, { [recordGrammar]: grammar });
  return schema;
}

/** JSON Schema tooling can render the dictionary's grammar without exposing its decoding representation. */
export function declarationRecordGrammar(definition: z.ZodTypeDef): z.ZodTypeAny | undefined {
  return (definition as RecordDefinition)[recordGrammar];
}

function mapIssue(issue: z.ZodIssue, path: (value: (string | number)[]) => (string | number)[]): z.ZodIssue {
  const mapped = { ...issue, path: path(issue.path) };
  if (mapped.code === 'invalid_union') mapped.unionErrors = mapped.unionErrors.map(error =>
    new z.ZodError(error.issues.map(child => mapIssue(child, path))));
  if (mapped.code === 'invalid_arguments') mapped.argumentsError = new z.ZodError(mapped.argumentsError.issues.map(child => mapIssue(child, path)));
  if (mapped.code === 'invalid_return_type') mapped.returnTypeError = new z.ZodError(mapped.returnTypeError.issues.map(child => mapIssue(child, path)));
  return mapped;
}
