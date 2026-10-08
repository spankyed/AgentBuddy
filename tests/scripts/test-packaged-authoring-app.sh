#!/usr/bin/env bash
# The half of the packaged-authoring check that needs the built app: run the pack's own E2E suite against
# it, then read back the data the app seeded with the packed CLI.
#
# It picks up where the author half left off, through `tests/authoring-handoff/work.json` — a path and a
# digest, because the work dir is outside the checkout on purpose and the chain can only derive an edge from
# a repo-relative path.
#
#   8. abuddy test passes against the app it is told to use (--app-root; it reads no machine state)
#   9. the packed CLI's abuddy db reads and exports the data that app seeded
# Requires a built app (npm run build) and the author half having run.
# KEEP_WORK=1 keeps the work dir and the app data dir.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
. "$ROOT/tests/scripts/lib/authoring.sh"

[ -f "$HANDOFF/work.json" ] || fail "no $HANDOFF/work.json — run npm run test:packaged-authoring:author first"
eval "$(node -e '
  const h = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const [k, v] of Object.entries({ WORK: h.work, ARCHIVE: h.archive, PACK: h.pack })) {
    process.stdout.write(`${k}=${JSON.stringify(v)}\n`);
  }
' "$HANDOFF/work.json")"
[ -d "$WORK" ] || fail "the author half's work dir $WORK is gone — run npm run test:packaged-authoring:author again"
[ -f "$ARCHIVE" ] || fail "the author half's archive $ARCHIVE is gone — run npm run test:packaged-authoring:author again"
ABUDDY="$PACK/node_modules/.bin/abuddy"
useWorkDir "$WORK"
# `abuddy test` finds the pack from the working directory, and from the checkout it would find the repo —
# whose own `vitest.config.ts` declares `@abuddy/source`, which the pack rules then fail the pack for.
cd "$PACK"

step "8. abuddy test on the packed archive (the app named on the command line)"
# --app-root, and nothing in the environment: `abuddy test` is pinned to what it is given, so that a run
# means the same thing on a fresh machine as on one someone has developed on
# PACK_ARCHIVE installs step 6's .tgz as it is, so this runs the artifact a release ships rather than
# another build of the same source — the one thing the rest of the script cannot check.
# The app's data dir is kept for step 9: the app seeded the installed demo pack into it
# `if !` so the pipeline's exit status is this script's to report: under `set -e` a failure would otherwise end it
# here, with only Playwright's own output to say why
if ! PACK_ARCHIVE="$ARCHIVE" E2E_KEEP_DATA=1 "$ABUDDY" test --app-root "$ROOT" 2>&1 | tee "$WORK/e2e.log"; then fail "abuddy test failed"; fi
APP_DATA="$(sed -n 's/.*\[e2e\] kept test data dir: //p' "$WORK/e2e.log" | head -n 1)"
[ -d "$APP_DATA" ] || fail "abuddy test didn't report the data dir it kept"

# What shipped is what ran: the integrity.json inside the archive against the one the app installed. A log
# line saying it used the archive would only be the fixture agreeing with itself.
tar -xzOf "$ARCHIVE" demo-pack/integrity.json > "$WORK/archive-integrity.json"
# The app keeps everything it owns under <data dir>/abuddy — see AppContext.appDir
diff "$WORK/archive-integrity.json" "$APP_DATA/abuddy/packs/demo-pack/integrity.json" || fail "the pack the app installed is not the one in $ARCHIVE"
# Only the data dir this half made: the work dir and the handoff are the author half's declared output, and
# a step whose output is gone reads as never-built.
if [ -z "${KEEP_WORK:-}" ]; then trap 'rm -rf "$APP_DATA"' EXIT; fi

step "9. abuddy db on the data the app seeded (the packed CLI, offline)"
# The demo pack's entity type comes from its installed manifest
"$ABUDDY" db query "return qx(EARS.Entity.DemoPack).pickAll().map((row) => row.term)" --data-dir "$APP_DATA" -o json > "$WORK/db-query.json" 2> "$WORK/db-query.err" \
  || { cat "$WORK/db-query.err"; fail "abuddy db query failed"; }
grep -q "Database: $APP_DATA (offline)" "$WORK/db-query.err" || fail "abuddy db query didn't print its data dir"
node -e '
  const terms = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  // The glossary term, beside the example row the scaffold seeds (which has none)
  if (!terms.includes("Pack")) throw new Error("the seeded glossary: " + JSON.stringify(terms));
' "$WORK/db-query.json" || fail "abuddy db query didn't read the seeded demo pack"
"$ABUDDY" db export --data-dir "$APP_DATA" --out "$WORK/db-export" --type DemoPack --type Note
node -e '
  const fs = require("fs");
  const dir = process.argv[1];
  const rows = JSON.parse(fs.readFileSync(`${dir}/DemoPack.json`, "utf8"));
  const term = rows.find((row) => row.term === "Pack");
  if (term?.definition !== "A bundle of features.") throw new Error("DemoPack.json: " + JSON.stringify(rows));
  const notes = JSON.parse(fs.readFileSync(`${dir}/Note.json`, "utf8"));
  if (!notes.some((note) => note.title === "Demo notes")) throw new Error("Note.json has no demo note");
  const summary = JSON.parse(fs.readFileSync(`${dir}/export.json`, "utf8"));
  if (summary.counts.DemoPack !== rows.length) throw new Error("export.json: " + JSON.stringify(summary));
' "$WORK/db-export" || fail "abuddy db export didn't write the seeded data"


step "No symlinks into the monorepo"
if find "$PACK/node_modules" "$WORK/tools/node_modules" -maxdepth 2 -type l -lname "$ROOT*" | grep -q .; then
  fail "node_modules links into the monorepo"
fi

_step_report
echo
echo "External pack authoring, app half: OK (${SECONDS}s)"
