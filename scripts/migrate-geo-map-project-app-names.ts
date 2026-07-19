import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const GEO_MAP_APP_MIGRATIONS = {
  "cartogram-japan": {
    appName: "cartogram",
    mapScope: "japan",
    renderEngine: "cartogram",
  },
  "cartogram-prefectures": {
    appName: "cartogram",
    mapScope: "prefectures",
    renderEngine: "cartogram",
  },
  "choropleth-japan": {
    appName: "choropleth",
    mapScope: "japan",
    renderEngine: "choropleth",
  },
  "choropleth-prefectures": {
    appName: "choropleth",
    mapScope: "prefectures",
    renderEngine: "choropleth",
  },
} as const;

type LegacyAppName = keyof typeof GEO_MAP_APP_MIGRATIONS;

interface ProjectRow {
  id: string;
  app_name: LegacyAppName;
  storage_path: string;
}

interface BackupEntry {
  id: string;
  oldAppName: LegacyAppName;
  canonicalAppName: "cartogram" | "choropleth";
  storagePath: string;
  jsonFile: string;
}

interface BackupManifest {
  version: 1;
  createdAt: string;
  storageBucket: "user_projects";
  projects: BackupEntry[];
}

interface ParsedArgs {
  apply: boolean;
  backupDir: string | null;
  expectedCount: number;
  rollbackManifest: string | null;
  json: boolean;
}

const STORAGE_BUCKET = "user_projects";
const DEFAULT_EXPECTED_COUNT = 16;
const EXPECTED_CANONICAL_COUNTS = {
  cartogram: 10,
  choropleth: 6,
} as const;

function argumentValue(argv: string[], name: string): string | null {
  const exactIndex = argv.indexOf(name);
  if (exactIndex !== -1) return argv[exactIndex + 1] || null;
  const prefix = `${name}=`;
  const inline = argv.find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : null;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const expectedRaw = argumentValue(argv, "--expected-count");
  const expectedCount = expectedRaw == null
    ? DEFAULT_EXPECTED_COUNT
    : Number.parseInt(expectedRaw, 10);
  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    throw new Error("--expected-count must be a non-negative integer");
  }

  return {
    apply: argv.includes("--apply"),
    backupDir: argumentValue(argv, "--backup-dir"),
    expectedCount,
    rollbackManifest: argumentValue(argv, "--rollback"),
    json: argv.includes("--json"),
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createAdminClient(): SupabaseClient {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function migrateProjectJson(
  projectState: unknown,
  oldAppName: LegacyAppName,
): Record<string, unknown> {
  if (!projectState || typeof projectState !== "object" || Array.isArray(projectState)) {
    throw new Error("Project JSON must be an object");
  }

  const definition = GEO_MAP_APP_MIGRATIONS[oldAppName];
  const original = projectState as Record<string, unknown>;
  const originalMeta = original.meta;
  if (originalMeta != null && (typeof originalMeta !== "object" || Array.isArray(originalMeta))) {
    throw new Error("Project JSON meta must be an object when present");
  }

  return {
    ...original,
    meta: {
      ...((originalMeta as Record<string, unknown> | undefined) || {}),
      appId: definition.appName,
      mapScope: definition.mapScope,
      renderEngine: definition.renderEngine,
    },
  };
}

async function listLegacyProjects(client: SupabaseClient): Promise<ProjectRow[]> {
  const legacyNames = Object.keys(GEO_MAP_APP_MIGRATIONS) as LegacyAppName[];
  const { data, error } = await client
    .from("projects")
    .select("id,app_name,storage_path")
    .in("app_name", legacyNames)
    .order("id", { ascending: true });
  if (error) throw new Error("Failed to query legacy geo-map projects");
  return (data || []) as ProjectRow[];
}

async function downloadProjectJson(
  client: SupabaseClient,
  storagePath: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await client.storage.from(STORAGE_BUCKET).download(storagePath);
  if (error || !data) throw new Error("Failed to download a geo-map project JSON file");
  try {
    return JSON.parse(await data.text()) as Record<string, unknown>;
  } catch {
    throw new Error("A geo-map project JSON file is not valid JSON");
  }
}

async function uploadProjectJson(
  client: SupabaseClient,
  storagePath: string,
  projectState: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.storage.from(STORAGE_BUCKET).upload(
    storagePath,
    Buffer.from(JSON.stringify(projectState)),
    { contentType: "application/json", upsert: true },
  );
  if (error) throw new Error("Failed to upload a geo-map project JSON file");
}

async function updateProjectAppName(
  client: SupabaseClient,
  id: string,
  expectedAppName: string,
  nextAppName: string,
): Promise<void> {
  const { data: currentRows, error: currentError } = await client
    .from("projects")
    .select("app_name")
    .eq("id", id)
    .limit(1);
  if (currentError || !currentRows || currentRows.length !== 1) {
    throw new Error("Failed to read a geo-map project app_name");
  }
  if (currentRows[0].app_name === nextAppName) return;
  if (currentRows[0].app_name !== expectedAppName) {
    throw new Error("Geo-map project app_name changed unexpectedly");
  }

  const { data, error } = await client
    .from("projects")
    .update({ app_name: nextAppName })
    .eq("id", id)
    .eq("app_name", expectedAppName)
    .select("id");
  if (error || !data || data.length !== 1) {
    throw new Error("Failed to update a geo-map project app_name");
  }
}

async function verifyMigratedJson(
  client: SupabaseClient,
  rows: ProjectRow[],
): Promise<number> {
  let verified = 0;
  for (const row of rows) {
    const definition = GEO_MAP_APP_MIGRATIONS[row.app_name];
    const projectState = await downloadProjectJson(client, row.storage_path);
    const meta = projectState.meta as Record<string, unknown> | undefined;
    if (!meta
      || meta.appId !== definition.appName
      || meta.mapScope !== definition.mapScope
      || meta.renderEngine !== definition.renderEngine) {
      throw new Error("Geo-map project JSON verification failed");
    }
    verified += 1;
  }
  return verified;
}

async function createBackup(
  backupDir: string,
  rows: ProjectRow[],
  originals: Record<string, unknown>[],
): Promise<string> {
  const resolvedDir = path.resolve(backupDir);
  await mkdir(resolvedDir, { recursive: false, mode: 0o700 });
  const projectsDir = path.join(resolvedDir, "projects");
  await mkdir(projectsDir, { recursive: true, mode: 0o700 });

  const entries: BackupEntry[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const jsonFile = `projects/project-${String(index + 1).padStart(4, "0")}.json`;
    await writeFile(
      path.join(resolvedDir, jsonFile),
      `${JSON.stringify(originals[index], null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    entries.push({
      id: row.id,
      oldAppName: row.app_name,
      canonicalAppName: GEO_MAP_APP_MIGRATIONS[row.app_name].appName,
      storagePath: row.storage_path,
      jsonFile,
    });
  }

  const manifest: BackupManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    storageBucket: STORAGE_BUCKET,
    projects: entries,
  };
  const manifestPath = path.join(resolvedDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return manifestPath;
}

async function readBackupManifest(manifestPath: string): Promise<BackupManifest> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  assertManifest(manifest);
  return manifest;
}

async function readExistingBackup(backupDir: string): Promise<{
  manifest: BackupManifest;
  manifestPath: string;
  originals: Record<string, unknown>[];
} | null> {
  const manifestPath = path.join(path.resolve(backupDir), "manifest.json");
  let manifest: BackupManifest;
  try {
    manifest = await readBackupManifest(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  const originals: Record<string, unknown>[] = [];
  for (const entry of manifest.projects) {
    const original = JSON.parse(
      await readFile(path.resolve(path.dirname(manifestPath), entry.jsonFile), "utf8"),
    ) as unknown;
    if (!original || typeof original !== "object" || Array.isArray(original)) {
      throw new Error("Invalid project JSON in backup");
    }
    originals.push(original as Record<string, unknown>);
  }
  return { manifest, manifestPath, originals };
}

async function countByAppName(client: SupabaseClient, appName: string): Promise<number> {
  const { count, error } = await client
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("app_name", appName);
  if (error) throw new Error("Failed to verify geo-map project counts");
  return count || 0;
}

async function verifyCounts(client: SupabaseClient): Promise<Record<string, number>> {
  const names = [
    ...Object.keys(GEO_MAP_APP_MIGRATIONS),
    "cartogram",
    "choropleth",
  ];
  const counts = await Promise.all(names.map((name) => countByAppName(client, name)));
  return Object.fromEntries(names.map((name, index) => [name, counts[index]]));
}

export function assertFinalCounts(counts: Record<string, number>): void {
  for (const legacyName of Object.keys(GEO_MAP_APP_MIGRATIONS)) {
    if (counts[legacyName] !== 0) {
      throw new Error("Legacy geo-map app_name values remain after migration");
    }
  }
  for (const [appName, expected] of Object.entries(EXPECTED_CANONICAL_COUNTS)) {
    if (counts[appName] !== expected) {
      throw new Error("Canonical geo-map project counts do not match the audited totals");
    }
  }
}

async function applyBackedUpProjects(
  client: SupabaseClient,
  manifest: BackupManifest,
  originals: Record<string, unknown>[],
): Promise<void> {
  if (manifest.projects.length !== originals.length) {
    throw new Error("Backup manifest and project files do not match");
  }

  const rows: ProjectRow[] = manifest.projects.map((entry) => ({
    id: entry.id,
    app_name: entry.oldAppName,
    storage_path: entry.storagePath,
  }));

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const definition = GEO_MAP_APP_MIGRATIONS[row.app_name];
    const original = originals[index];
    const migrated = migrateProjectJson(original, row.app_name);
    const current = await downloadProjectJson(client, row.storage_path);

    if (isDeepStrictEqual(current, original)) {
      await uploadProjectJson(client, row.storage_path, migrated);
    } else if (!isDeepStrictEqual(current, migrated)) {
      throw new Error("Geo-map project JSON changed unexpectedly; refusing overwrite");
    }

    await updateProjectAppName(client, row.id, row.app_name, definition.appName);
  }

  const counts = await verifyCounts(client);
  assertFinalCounts(counts);
  process.stdout.write(`${JSON.stringify({
    verification: counts,
    verifiedProjectJson: await verifyMigratedJson(client, rows),
  }, null, 2)}\n`);
}

async function runMigration(client: SupabaseClient, args: ParsedArgs): Promise<void> {
  if (args.apply && args.backupDir) {
    const existingBackup = await readExistingBackup(args.backupDir);
    if (existingBackup) {
      if (existingBackup.manifest.projects.length !== args.expectedCount) {
        throw new Error("Existing backup does not match --expected-count");
      }
      process.stdout.write(`${JSON.stringify({
        mode: "resume",
        matched: existingBackup.manifest.projects.length,
        expected: args.expectedCount,
      }, null, args.json ? 2 : 0)}\n`);
      await applyBackedUpProjects(
        client,
        existingBackup.manifest,
        existingBackup.originals,
      );
      return;
    }
  }

  const rows = await listLegacyProjects(client);
  const originals: Record<string, unknown>[] = [];
  let missingMapScope = 0;
  let missingRenderEngine = 0;
  let nonCanonicalAppId = 0;
  const byLegacyAppName: Record<string, number> = {};

  for (const row of rows) {
    const original = await downloadProjectJson(client, row.storage_path);
    const meta = original.meta as Record<string, unknown> | undefined;
    if (!meta || !meta.mapScope) missingMapScope += 1;
    if (!meta || !meta.renderEngine) missingRenderEngine += 1;
    if (!meta || meta.appId !== GEO_MAP_APP_MIGRATIONS[row.app_name].appName) {
      nonCanonicalAppId += 1;
    }
    byLegacyAppName[row.app_name] = (byLegacyAppName[row.app_name] || 0) + 1;
    migrateProjectJson(original, row.app_name);
    originals.push(original);
  }

  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    matched: rows.length,
    missingMapScope,
    missingRenderEngine,
    nonCanonicalAppId,
    byLegacyAppName,
    expected: args.expectedCount,
  };
  process.stdout.write(`${JSON.stringify(summary, null, args.json ? 2 : 0)}\n`);

  if (!args.apply) return;
  if (rows.length !== args.expectedCount) {
    throw new Error(`Refusing apply: expected ${args.expectedCount} projects but found ${rows.length}`);
  }
  if (!args.backupDir) {
    throw new Error("--backup-dir is required with --apply");
  }

  const countsBefore = await verifyCounts(client);
  if (countsBefore.cartogram !== 0 || countsBefore.choropleth !== 0) {
    throw new Error("Refusing initial apply: canonical geo-map projects already exist");
  }
  const expectedByCanonical = rows.reduce<Record<string, number>>((counts, row) => {
    const appName = GEO_MAP_APP_MIGRATIONS[row.app_name].appName;
    counts[appName] = (counts[appName] || 0) + 1;
    return counts;
  }, {});
  for (const [appName, expected] of Object.entries(EXPECTED_CANONICAL_COUNTS)) {
    if ((expectedByCanonical[appName] || 0) !== expected) {
      throw new Error("Refusing initial apply: legacy project distribution changed");
    }
  }

  const manifestPath = await createBackup(args.backupDir, rows, originals);
  process.stdout.write(`Backup manifest: ${manifestPath}\n`);
  const manifest = await readBackupManifest(manifestPath);
  await applyBackedUpProjects(client, manifest, originals);
}

function assertManifest(value: unknown): asserts value is BackupManifest {
  const manifest = value as BackupManifest;
  if (!manifest || manifest.version !== 1 || manifest.storageBucket !== STORAGE_BUCKET || !Array.isArray(manifest.projects)) {
    throw new Error("Invalid rollback manifest");
  }
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  for (const entry of manifest.projects) {
    if (!GEO_MAP_APP_MIGRATIONS[entry.oldAppName]
      || !entry.id
      || !entry.storagePath
      || entry.canonicalAppName !== GEO_MAP_APP_MIGRATIONS[entry.oldAppName].appName
      || !/^projects\/project-\d{4}\.json$/.test(entry.jsonFile)) {
      throw new Error("Invalid rollback manifest entry");
    }
    if (seenIds.has(entry.id) || seenFiles.has(entry.jsonFile)) {
      throw new Error("Duplicate rollback manifest entry");
    }
    seenIds.add(entry.id);
    seenFiles.add(entry.jsonFile);
  }
}

async function runRollback(client: SupabaseClient, args: ParsedArgs): Promise<void> {
  if (!args.rollbackManifest) throw new Error("Missing rollback manifest");
  if (!args.apply) {
    throw new Error("Rollback is destructive and requires --apply");
  }

  const manifestPath = path.resolve(args.rollbackManifest);
  const manifest = await readBackupManifest(manifestPath);
  const manifestDir = path.dirname(manifestPath);

  for (const entry of manifest.projects) {
    const original = JSON.parse(
      await readFile(path.resolve(manifestDir, entry.jsonFile), "utf8"),
    ) as Record<string, unknown>;
    await uploadProjectJson(client, entry.storagePath, original);
    await updateProjectAppName(client, entry.id, entry.canonicalAppName, entry.oldAppName);
  }

  process.stdout.write(`${JSON.stringify({ restored: manifest.projects.length }, null, 2)}\n`);
}

async function main(): Promise<void> {
  if (process.env.USE_ENV_FILE) {
    const dotenv = await import("dotenv");
    dotenv.config({ path: process.env.USE_ENV_FILE, override: true, quiet: true });
  }
  const args = parseArgs(process.argv.slice(2));
  const client = createAdminClient();
  if (args.rollbackManifest) {
    await runRollback(client, args);
  } else {
    await runMigration(client, args);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
