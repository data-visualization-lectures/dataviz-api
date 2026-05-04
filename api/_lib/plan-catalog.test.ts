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
    planId: "bundle_monthly_jpy",
    canonicalPlanId: "bundle_monthly",
    currency: "jpy",
    billingInterval: "monthly",
    isTeamPlan: false,
  });
});

test("checkout resolver maps legacy yearly team aliases to new USD plans", () => {
  const resolved = resolveCheckoutPlanSelection("team_standard_yearly", "usd");

  assert.deepEqual(resolved && {
    planId: resolved.planId,
    canonicalPlanId: resolved.canonicalPlanId,
    currency: resolved.currency,
    isTeamPlan: resolved.isTeamPlan,
    maxSeats: resolved.maxSeats,
  }, {
    planId: "team_bundle_standard_yearly_usd",
    canonicalPlanId: "team_bundle_standard_yearly",
    currency: "usd",
    isTeamPlan: true,
    maxSeats: 10,
  });
});

test("checkout resolver accepts current plan ids directly", () => {
  const resolved = resolveCheckoutPlanSelection("prep_yearly_usd", "jpy");

  assert.equal(resolved?.planId, "prep_yearly_usd");
  assert.equal(resolved?.canonicalPlanId, "prep_yearly");
  assert.equal(resolved?.currency, "usd");
  assert.equal(resolved?.scope, "prep");
});

test("checkout resolver stops selling coaching and monthly legacy team products", () => {
  const resolved = resolveCheckoutPlanSelection("coaching_monthly", "usd");
  const legacyMonthlyTeam = resolveCheckoutPlanSelection("team_small_monthly", "jpy");

  assert.equal(resolved, null);
  assert.equal(legacyMonthlyTeam, null);
});

test("canonical resolver collapses currency variants into shared plan families", () => {
  assert.equal(resolveCanonicalPlanId("pro_yearly"), "bundle_pro_yearly");
  assert.equal(resolveCanonicalPlanId("viz_yearly_usd"), "viz_yearly");
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
