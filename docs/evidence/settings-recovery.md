# Settings admission and recovery

## Admission checkpoint

- Settings projection is shared by committed catalogs and verified installation candidates.
- Install, replacement, restore, upgrade, authoring installation and shipped refresh check explicit
  stored choices before placement. Live reload checks prospective declarations before module import;
  declaration publication validates before changing any accepted projection.
- Offline checks use a read-only, unhydrated settings-row read under the existing CLI storage lock.
  Boot's shipped updates read the same row from the already-open store before hydration.
- Focused verification: 31 settings-store cases, 7 settings-discovery/admission cases and 19 reload
  cases passed. Host and CLI typechecks and scoped lint passed. No native compiler fixtures or CI runs.
- Startup recovery and atomic repair are the next checkpoint; this admission checkpoint does not
  claim to resolve settings that are already invalid at startup.
