import test from "node:test";
import assert from "node:assert/strict";

import {
  getAppRegistryEntry,
  resolveProjectBackendFromApp,
  resolveRequiredScopeFromApp,
} from "./app-registry.ts";

test("legacy keplergl app name resolves as a viz saved-project tool", () => {
  assert.equal(resolveRequiredScopeFromApp("keplergl"), "viz");
  assert.equal(resolveProjectBackendFromApp("keplergl"), "projects");
});

test("canonical map builders resolve as viz saved-project tools", () => {
  for (const appName of ["cartogram", "choropleth"]) {
    assert.equal(resolveRequiredScopeFromApp(appName), "viz");
    assert.equal(resolveProjectBackendFromApp(appName), "projects");
    assert.equal(getAppRegistryEntry(appName)?.toolUrl, `https://${appName}.dataviz.jp`);
  }
});

test("map scope is not encoded in app names", () => {
  for (const appName of [
    "cartogram-japan",
    "cartogram-prefectures",
    "choropleth-japan",
    "choropleth-prefectures",
  ]) {
    assert.equal(getAppRegistryEntry(appName), null);
    assert.equal(resolveRequiredScopeFromApp(appName), null);
    assert.equal(resolveProjectBackendFromApp(appName), null);
  }
});

test("retired What the Tile is not resolved as a subscription tool", () => {
  assert.equal(getAppRegistryEntry("what-the-tile"), null);
  assert.equal(resolveRequiredScopeFromApp("what-the-tile"), null);
  assert.equal(resolveProjectBackendFromApp("what-the-tile"), null);
});

test("parallel-sets resolves as a viz saved-project tool", () => {
  assert.equal(resolveRequiredScopeFromApp("parallel-sets"), "viz");
  assert.equal(resolveProjectBackendFromApp("parallel-sets"), "projects");
  assert.equal(
    getAppRegistryEntry("parallel-sets")?.toolUrl,
    "https://parallel-sets.dataviz.jp",
  );
});

test("parallels-thematic-maps resolves as a viz saved-project tool", () => {
  assert.equal(resolveRequiredScopeFromApp("parallels-thematic-maps"), "viz");
  assert.equal(resolveProjectBackendFromApp("parallels-thematic-maps"), "projects");
  assert.equal(
    getAppRegistryEntry("parallels-thematic-maps")?.toolUrl,
    "https://parallels-thematic-maps.dataviz.jp",
  );
});
