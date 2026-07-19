# Geo-map project app-name migration

Cartogram and Choropleth save projects under builder-level `app_name` values. Map scope and render engine belong in project JSON metadata.

## Safety contract

- The migration command is dry-run unless `--apply` is supplied.
- Apply requires the audited row count (`--expected-count`, default `16`) to match exactly.
- Apply also requires `--backup-dir`; original Storage JSON and DB routing metadata are written there before any mutation.
- Each project is updated Storage-first and DB-second. After a partial failure, rerun the same command with the same backup directory; the original backup is reused and completed rows are skipped.
- Resume refuses to overwrite Storage JSON unless it still equals either the backed-up original or the exact migrated form.
- Rollback requires both a backup manifest and `--apply`.
- Service-role credentials, user IDs, and Storage paths must not be printed or committed.

## Dry-run

Run from a trusted local environment with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` loaded:

```sh
npm run migrate:geo-map-projects:dry-run
```

Expected pre-migration result:

```json
{
  "mode": "dry-run",
  "matched": 16,
  "missingMapScope": 4,
  "missingRenderEngine": 4,
  "nonCanonicalAppId": 16,
  "expected": 16
}
```

## Apply

Choose an absolute, non-existing backup directory outside the repository. Its parent directory must already exist. Then run:

```sh
npm run migrate:geo-map-projects -- --expected-count=16 --backup-dir=/absolute/private/backup/path
```

Production apply requires a separate approval immediately before execution. The approval must repeat the matched count, backup destination, update order, and rollback command.

If apply is interrupted, run the exact same command again. The existing manifest is validated and used to resume all 16 backed-up projects; a second backup is not created.

## Rollback

```sh
node --experimental-strip-types scripts/migrate-geo-map-project-app-names.ts \
  --apply \
  --rollback=/absolute/private/backup/path/manifest.json
```

After apply or rollback, verify project counts and authenticated save, overwrite, load, and delete behavior with scope enforcement enabled.
