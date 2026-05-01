import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveScopedAppName,
  shouldBlockScopeMismatch,
} from "./scope-enforcement.ts";

test("project app name takes precedence over request app name", () => {
  assert.equal(
    resolveScopedAppName({
      requestAppName: "rawgraphs",
      projectAppName: "open-refine",
    }),
    "open-refine",
  );
  assert.equal(
    resolveScopedAppName({
      requestAppName: "rawgraphs",
      projectAppName: null,
    }),
    "rawgraphs",
  );
});

test("scope mismatch blocks only when both global and per-request enforcement are enabled", () => {
  assert.equal(
    shouldBlockScopeMismatch({
      scopeAllowed: false,
      scopeEnforcementEnabled: true,
      enforceScope: true,
    }),
    true,
  );
  assert.equal(
    shouldBlockScopeMismatch({
      scopeAllowed: false,
      scopeEnforcementEnabled: true,
      enforceScope: false,
    }),
    false,
  );
  assert.equal(
    shouldBlockScopeMismatch({
      scopeAllowed: false,
      scopeEnforcementEnabled: false,
      enforceScope: true,
    }),
    false,
  );
});
