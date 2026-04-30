import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCanonicalPlanId,
  resolveCheckoutPlanSelection,
  resolveKnownPlanMetadata,
} from "./plan-catalog.ts";

test("checkout resolver keeps legacy JPY aliases working", () => {
  const resolved = resolveCheckoutPlanSelection("monthly", "jpy");

  assert.deepEqual(resolved && {
    planId: resolved.planId,
    canonicalPlanId: resolved.canonicalPlanId,
    currency: resolved.currency,
    billingInterval: resolved.billingInterval,
    isTeamPlan: resolved.isTeamPlan,
  }, {
    planId: "pro_monthly",
    canonicalPlanId: "bundle_pro_monthly",
    currency: "jpy",
    billingInterval: "monthly",
    isTeamPlan: false,
  });
});

test("checkout resolver maps USD aliases to USD stored plans", () => {
  const resolved = resolveCheckoutPlanSelection("team_standard_yearly", "usd");

  assert.deepEqual(resolved && {
    planId: resolved.planId,
    canonicalPlanId: resolved.canonicalPlanId,
    currency: resolved.currency,
    isTeamPlan: resolved.isTeamPlan,
    maxSeats: resolved.maxSeats,
  }, {
    planId: "team_standard_yearly_usd",
    canonicalPlanId: "bundle_team_standard_yearly",
    currency: "usd",
    isTeamPlan: true,
    maxSeats: 10,
  });
});

test("checkout resolver falls back to JPY when a USD coaching alias is requested", () => {
  const resolved = resolveCheckoutPlanSelection("coaching_monthly", "usd");

  assert.equal(resolved?.planId, "coaching_monthly");
  assert.equal(resolved?.currency, "jpy");
  assert.equal(resolved?.canonicalPlanId, "bundle_coaching_monthly");
});

test("canonical resolver collapses currency variants into shared plan families", () => {
  assert.equal(resolveCanonicalPlanId("pro_yearly"), "bundle_pro_yearly");
  assert.equal(resolveCanonicalPlanId("pro_yearly_usd"), "bundle_pro_yearly");
  assert.equal(resolveCanonicalPlanId("team_member"), "team_member");
});

test("known plan metadata preserves internal non-billable plan behavior", () => {
  const metadata = resolveKnownPlanMetadata("academia");

  assert.deepEqual(metadata && {
    canonicalPlanId: metadata.canonicalPlanId,
    scope: metadata.scope,
    isBillable: metadata.isBillable,
    isTeamPlan: metadata.isTeamPlan,
  }, {
    canonicalPlanId: "academia",
    scope: "bundle",
    isBillable: false,
    isTeamPlan: false,
  });
});
