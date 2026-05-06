import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveProjectBackendFromApp,
  resolveRequiredScopeFromApp,
} from "./app-registry.ts";

test("legacy keplergl app name resolves as a viz saved-project tool", () => {
  assert.equal(resolveRequiredScopeFromApp("keplergl"), "viz");
  assert.equal(resolveProjectBackendFromApp("keplergl"), "projects");
});
