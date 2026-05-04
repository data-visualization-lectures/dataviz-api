import test from "node:test";
import assert from "node:assert/strict";

import {
  PHASE4_CANONICAL_PLAN_DEFINITIONS,
  PHASE4_STORED_PLAN_DEFINITIONS,
  getPhase4StoredPlan,
} from "./phase4-pricing.ts";

test("phase 4 pricing excludes coaching and covers jpy/usd for every canonical plan", () => {
  assert.equal(PHASE4_CANONICAL_PLAN_DEFINITIONS.length, 15);
  assert.equal(PHASE4_STORED_PLAN_DEFINITIONS.length, 30);

  const hasCoaching = PHASE4_CANONICAL_PLAN_DEFINITIONS.some((entry) =>
    entry.canonicalPlanId.includes("coaching"),
  );
  assert.equal(hasCoaching, false);

  for (const entry of PHASE4_CANONICAL_PLAN_DEFINITIONS) {
    assert.ok(getPhase4StoredPlan(`${entry.canonicalPlanId}_jpy`));
    assert.ok(getPhase4StoredPlan(`${entry.canonicalPlanId}_usd`));
  }
});

test("team plans stay yearly-only with 5/10/30 seats", () => {
  const teamPlans = PHASE4_CANONICAL_PLAN_DEFINITIONS.filter(
    (entry) => entry.isTeamPlan,
  );

  assert.equal(teamPlans.every((entry) => entry.billingInterval === "yearly"), true);

  const seatCounts = [...new Set(teamPlans.map((entry) => entry.seatCount))].sort(
    (a, b) => (a ?? 0) - (b ?? 0),
  );
  assert.deepEqual(seatCounts, [5, 10, 30]);
});

test("usd amounts are stored in minor units", () => {
  assert.equal(getPhase4StoredPlan("viz_monthly_usd")?.amount, 800);
  assert.equal(getPhase4StoredPlan("bundle_yearly_usd")?.amount, 19000);
  assert.equal(getPhase4StoredPlan("team_bundle_enterprise_yearly_usd")?.amount, 480000);
});

test("rounded jpy team prices are reflected in stored plans", () => {
  assert.equal(getPhase4StoredPlan("team_prep_small_yearly_jpy")?.amount, 59000);
  assert.equal(getPhase4StoredPlan("team_bundle_small_yearly_jpy")?.amount, 99000);
  assert.equal(getPhase4StoredPlan("team_bundle_enterprise_yearly_jpy")?.amount, 595000);
});
