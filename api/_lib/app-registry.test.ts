import test from "node:test";
import assert from "node:assert/strict";
import { hasAccessibleScope } from "./entitlements.ts";

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

test("tree chart builder resolves as a viz saved-project tool", () => {
  const entry = getAppRegistryEntry("tree-chart-builder");
  assert.equal(resolveRequiredScopeFromApp("tree-chart-builder"), "viz");
  assert.equal(resolveProjectBackendFromApp("tree-chart-builder"), "projects");
  assert.equal(entry?.toolUrl, "https://tree-chart-builder.dataviz.jp");
  assert.equal(entry?.marketingUrl, "https://www.dataviz.jp/tree-chart-builder/");
  assert.equal(entry?.hubHost, "app.dataviz.jp");
  assert.equal(entry?.supportsSavedProjects, true);
  const requiredScope = resolveRequiredScopeFromApp("tree-chart-builder");
  assert.equal(hasAccessibleScope({
    requiredScope,
    subscriptionScope: "viz",
    accessibleScopes: ["viz"],
  }), true);
  assert.equal(hasAccessibleScope({
    requiredScope,
    subscriptionScope: "prep",
    accessibleScopes: ["prep"],
  }), false);
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

test("matrix-table-chart resolves as a viz saved-project tool", () => {
  assert.equal(resolveRequiredScopeFromApp("matrix-table-chart"), "viz");
  assert.equal(resolveProjectBackendFromApp("matrix-table-chart"), "projects");
  assert.equal(
    getAppRegistryEntry("matrix-table-chart")?.toolUrl,
    "https://matrix-table-chart.dataviz.jp",
  );
  assert.equal(
    getAppRegistryEntry("matrix-table-chart")?.marketingUrl,
    "https://www.dataviz.jp/matrix-table-chart/",
  );
});

test("weighted-directed-flow-map resolves as a viz saved-project tool", () => {
  assert.equal(resolveRequiredScopeFromApp("weighted-directed-flow-map"), "viz");
  assert.equal(resolveProjectBackendFromApp("weighted-directed-flow-map"), "projects");
  assert.equal(
    getAppRegistryEntry("weighted-directed-flow-map")?.toolUrl,
    "https://weighted-directed-flow-map.dataviz.jp",
  );
  assert.equal(
    getAppRegistryEntry("weighted-directed-flow-map")?.marketingUrl,
    "https://www.dataviz.jp/weighted-directed-flow-map/",
  );
});

test("map-projection-chooser resolves as a viz chooser without saved projects", () => {
  assert.equal(resolveRequiredScopeFromApp("map-projection-chooser"), "viz");
  assert.equal(resolveProjectBackendFromApp("map-projection-chooser"), "none");
  assert.equal(getAppRegistryEntry("map-projection-chooser")?.hubHost, "app.dataviz.jp");
  assert.equal(
    getAppRegistryEntry("map-projection-chooser")?.toolUrl,
    "https://map-projection-chooser.dataviz.jp",
  );
  assert.equal(getAppRegistryEntry("map-projection-chooser")?.supportsSavedProjects, false);
});


test("shape-cartogram resolves as a viz saved-project tool on the dataviz hub", () => {
  assert.equal(resolveRequiredScopeFromApp("shape-cartogram"), "viz");
  assert.equal(resolveProjectBackendFromApp("shape-cartogram"), "projects");
  assert.equal(getAppRegistryEntry("shape-cartogram")?.toolUrl, "https://shape-cartogram.dataviz.jp");
  assert.equal(getAppRegistryEntry("shape-cartogram")?.marketingUrl, "https://www.dataviz.jp/shape-cartogram/");
  assert.equal(getAppRegistryEntry("shape-cartogram")?.hubHost, "app.dataviz.jp");
  assert.equal(getAppRegistryEntry("shape-cartogram")?.supportsSavedProjects, true);
});
