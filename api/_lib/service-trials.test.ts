import test from "node:test";
import assert from "node:assert/strict";

import {
  getActiveServiceTrialScopes,
  hasEligibleServiceTrial,
  isServiceTrialActive,
  mapServiceTrials,
  resolveServiceTrialConsumptionScopes,
  shouldExpireServiceTrial,
} from "./service-trials.ts";

test("mapServiceTrials normalizes scoped records", () => {
  const mapped = mapServiceTrials([
    { user_id: "u1", service_scope: "viz", status: "eligible" },
    { user_id: "u1", service_scope: "prep", status: "trialing", current_period_end: "2099-01-01T00:00:00.000Z" },
  ]);

  assert.equal(mapped.viz?.status, "eligible");
  assert.equal(mapped.prep?.status, "trialing");
});

test("service trial active/eligible helpers respect status and period end", () => {
  assert.equal(hasEligibleServiceTrial({ status: "eligible" }), true);
  assert.equal(hasEligibleServiceTrial({ status: "trialing" }), false);

  assert.equal(
    isServiceTrialActive(
      { status: "trialing", current_period_end: "2099-01-01T00:00:00.000Z" },
      new Date("2026-01-01T00:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    isServiceTrialActive(
      { status: "trialing", current_period_end: "2025-01-01T00:00:00.000Z" },
      new Date("2026-01-01T00:00:00.000Z"),
    ),
    false,
  );
});

test("getActiveServiceTrialScopes unions active service trials only", () => {
  assert.deepEqual(
    getActiveServiceTrialScopes(
      {
        viz: {
          user_id: "u1",
          service_scope: "viz",
          status: "trialing",
          current_period_end: "2099-01-01T00:00:00.000Z",
        },
        prep: {
          user_id: "u1",
          service_scope: "prep",
          status: "eligible",
          current_period_end: null,
        },
      },
      new Date("2026-01-01T00:00:00.000Z"),
    ),
    ["viz"],
  );
});

test("shouldExpireServiceTrial catches stale trialing rows", () => {
  assert.equal(
    shouldExpireServiceTrial(
      { status: "trialing", current_period_end: "2025-01-01T00:00:00.000Z" },
      new Date("2026-01-01T00:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    shouldExpireServiceTrial(
      { status: "eligible", current_period_end: null },
      new Date("2026-01-01T00:00:00.000Z"),
    ),
    false,
  );
});

test("resolveServiceTrialConsumptionScopes follows paid scope coverage", () => {
  assert.deepEqual(resolveServiceTrialConsumptionScopes("viz"), ["viz"]);
  assert.deepEqual(resolveServiceTrialConsumptionScopes("prep"), ["prep"]);
  assert.deepEqual(resolveServiceTrialConsumptionScopes("bundle"), ["viz", "prep"]);
  assert.deepEqual(resolveServiceTrialConsumptionScopes(null), []);
});
