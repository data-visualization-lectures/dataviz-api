import test from "node:test";
import assert from "node:assert/strict";

import {
  canStartEligibleServiceTrial,
  createServiceTrialStartedSignal,
} from "./service-trial-start.ts";

test("createServiceTrialStartedSignal only returns a signal for an updated trial", () => {
  assert.equal(createServiceTrialStartedSignal(null), null);
  assert.deepEqual(
    createServiceTrialStartedSignal({
      service_scope: "prep",
      started_at: "2026-07-26T00:00:00.000Z",
      current_period_end: "2026-08-09T00:00:00.000Z",
    }),
    {
      service_scope: "prep",
      started_at: "2026-07-26T00:00:00.000Z",
      current_period_end: "2026-08-09T00:00:00.000Z",
    },
  );
});

test("canStartEligibleServiceTrial blocks users with any subscription record", () => {
  assert.equal(
    canStartEligibleServiceTrial({
      requestedServiceScope: "viz",
      accessibleScopes: [],
      serviceTrial: { status: "eligible" },
      hasSubscriptionRecord: true,
    }),
    false,
  );
});

test("canStartEligibleServiceTrial allows new users with eligible scoped trials", () => {
  assert.equal(
    canStartEligibleServiceTrial({
      requestedServiceScope: "viz",
      accessibleScopes: [],
      serviceTrial: { status: "eligible" },
      hasSubscriptionRecord: false,
    }),
    true,
  );
});

test("canStartEligibleServiceTrial does not consume trials for already accessible scopes", () => {
  assert.equal(
    canStartEligibleServiceTrial({
      requestedServiceScope: "viz",
      accessibleScopes: ["viz"],
      serviceTrial: { status: "eligible" },
      hasSubscriptionRecord: false,
    }),
    false,
  );
});
