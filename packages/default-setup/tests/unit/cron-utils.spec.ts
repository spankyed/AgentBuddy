import { validateCronExpression } from '../../build/cron-utils';

describe('validateCronExpression', () => {
  it('allows steps equal to 1-based field cardinality', () => {
    expect(validateCronExpression('0 0 */31 * *')).toBeNull();
    expect(validateCronExpression('0 0 * */12 *')).toBeNull();
  });

  it('rejects steps larger than field cardinality', () => {
    expect(validateCronExpression('0 0 */32 * *')).toContain('exceeds range');
    expect(validateCronExpression('0 0 * */13 *')).toContain('exceeds range');
  });
});
