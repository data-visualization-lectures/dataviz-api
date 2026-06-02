import test from "node:test";
import assert from "node:assert/strict";

import { canStartEligibleServiceTrial } from "./service-trial-start.ts";

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
