import assert from "node:assert/strict";
import test from "node:test";

import {
  GEO_MAP_APP_MIGRATIONS,
  assertFinalCounts,
  migrateProjectJson,
  parseArgs,
} from "./migrate-geo-map-project-app-names.ts";

test("legacy identifiers map to builder app names and JSON variants", () => {
  assert.deepEqual(GEO_MAP_APP_MIGRATIONS["cartogram-prefectures"], {
    appName: "cartogram",
    mapScope: "prefectures",
    renderEngine: "cartogram",
  });
  assert.deepEqual(GEO_MAP_APP_MIGRATIONS["choropleth-japan"], {
    appName: "choropleth",
    mapScope: "japan",
    renderEngine: "choropleth",
  });
});

test("project JSON migration preserves data and fills canonical metadata", () => {
  const result = migrateProjectJson({
    version: "2.0",
    meta: { datasetName: "Example" },
    data: [{ name: "A", value: 1 }],
  }, "choropleth-prefectures");

  assert.deepEqual(result.meta, {
    datasetName: "Example",
    appId: "choropleth",
    mapScope: "prefectures",
    renderEngine: "choropleth",
  });
  assert.deepEqual(result.data, [{ name: "A", value: 1 }]);
});

test("apply defaults to the audited project count and requires explicit flags", () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    backupDir: null,
    expectedCount: 16,
    rollbackManifest: null,
    json: false,
  });
  assert.equal(parseArgs(["--apply", "--backup-dir=/tmp/backup"]).apply, true);
});

test("final verification requires canonical 10/6 totals and zero legacy rows", () => {
  const validCounts = {
    "cartogram-japan": 0,
    "cartogram-prefectures": 0,
    "choropleth-japan": 0,
    "choropleth-prefectures": 0,
    cartogram: 10,
    choropleth: 6,
  };

  assert.doesNotThrow(() => assertFinalCounts(validCounts));
  assert.throws(
    () => assertFinalCounts({ ...validCounts, "cartogram-japan": 1 }),
    /Legacy geo-map app_name values remain/,
  );
  assert.throws(
    () => assertFinalCounts({ ...validCounts, choropleth: 5 }),
    /canonical geo-map project counts/i,
  );
});
