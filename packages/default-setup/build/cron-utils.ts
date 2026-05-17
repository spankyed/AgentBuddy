/**
 * Standalone cron expression validation.
 *
 * Mirrors croner's core validation logic for 5-field and 6-field expressions.
 * 6-field format: second minute hour day month weekday
 * 5-field format: minute hour day month weekday (treated as second=0)
 *
 * This function is intentionally duplicated in:
 *   - packages/default-setup/build/cron-utils.ts (here)
 *   - packages/renderer/src/plugins/flows/helpers/cron-utils.ts
 * because these packages cannot share runtime code. The API validator
 * uses croner directly (packages/api/src/systems/flows/dsl/validator.ts).
 *
 * Keep these copies in sync when modifying validation rules.
 */

const MONTH_NAMES: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
const DOW_NAMES: Record<string, number> = { sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6 };

const FIELD_RANGES: { min: number; max: number; names?: Record<string, number> }[] = [
  { min: 0, max: 59 },                     // second
  { min: 0, max: 59 },                     // minute
  { min: 0, max: 23 },                     // hour
  { min: 1, max: 31 },                     // day of month
  { min: 1, max: 12, names: MONTH_NAMES }, // month
  { min: 0, max: 7, names: DOW_NAMES },   // day of week (0 and 7 both = Sunday)
];

const FIELD_LABELS = ['second', 'minute', 'hour', 'day-of-month', 'month', 'day-of-week'];

/** Returns an error message string, or null if the expression is valid. */
export function validateCronExpression(expr: string): string | null {
  const raw = expr.trim().split(/\s+/);
  if (raw.length < 5 || raw.length > 6) return 'Must be a 5 or 6 field cron expression (second minute hour day month weekday)';

  // Normalize 5-field to 6-field by prepending second=0
  const fields = raw.length === 5 ? ['0', ...raw] : raw;

  for (let i = 0; i < 6; i++) {
    const field = fields[i];
    const { min, max, names } = FIELD_RANGES[i];
    const label = FIELD_LABELS[i];

    if (field === '*') continue;

    const elements = field.split(',');
    for (const el of elements) {
      if (el === '') return `Empty value in ${label} field`;

      const slashParts = el.split('/');
      if (slashParts.length > 2) return `Invalid syntax "${el}" in ${label} field`;

      const rangePart = slashParts[0];
      const stepPart = slashParts[1];

      if (stepPart !== undefined) {
        const step = Number(stepPart);
        if (!Number.isInteger(step) || step < 1) return `Invalid step "${stepPart}" in ${label} field`;
        if (step > max - min + 1) return `Step ${step} exceeds range in ${label} field`;
      }

      if (rangePart === '*') continue;

      const dashParts = rangePart.split('-');
      if (dashParts.length > 2) return `Invalid range "${rangePart}" in ${label} field`;

      for (const part of dashParts) {
        const resolved = names?.[part.toLowerCase()];
        const num = resolved !== undefined ? resolved : Number(part);
        if (!Number.isInteger(num)) return `Invalid value "${part}" in ${label} field`;
        if (num < min || num > max) return `Value ${num} out of range (${min}-${max}) in ${label} field`;
      }

      if (dashParts.length === 2) {
        const lo = names?.[dashParts[0].toLowerCase()] ?? Number(dashParts[0]);
        const hi = names?.[dashParts[1].toLowerCase()] ?? Number(dashParts[1]);
        if (lo > hi) return `Range ${lo}-${hi} is invalid in ${label} field (start > end)`;
      }
    }
  }

  return null;
}
