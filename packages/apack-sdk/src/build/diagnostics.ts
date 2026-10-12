/** A finding shared by pack authoring, build and installation checks. */
export interface PackDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  packId?: string;
  /** Address in apack.json; an empty path concerns the whole pack. */
  path: readonly (string | number)[];
  message: string;
  source?: string;
  suggestion?: string;
}

export interface SkippedPackCheck {
  check: string;
  reason: string;
}

export interface PackValidation {
  status: 'valid' | 'invalid' | 'incomplete';
  diagnostics: PackDiagnostic[];
  skippedChecks: SkippedPackCheck[];
}

/** An error takes precedence over incompleteness; warnings alone do not invalidate a pack. */
export function packValidation(diagnostics: PackDiagnostic[] = [], skippedChecks: SkippedPackCheck[] = []): PackValidation {
  return {
    status: diagnostics.some(issue => issue.severity === 'error') ? 'invalid' : skippedChecks.length ? 'incomplete' : 'valid',
    diagnostics,
    skippedChecks,
  };
}
