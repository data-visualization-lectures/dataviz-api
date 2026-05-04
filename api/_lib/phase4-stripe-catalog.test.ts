import test from "node:test";
import assert from "node:assert/strict";

import {
  PHASE4_STRIPE_PRICE_DEFINITIONS,
  PHASE4_STRIPE_PRODUCT_DEFINITIONS,
  createPhase4PriceMetadata,
} from "./phase4-stripe-catalog.ts";

test("phase 4 stripe catalog emits 15 products and 30 prices", () => {
  assert.equal(PHASE4_STRIPE_PRODUCT_DEFINITIONS.length, 15);
  assert.equal(PHASE4_STRIPE_PRICE_DEFINITIONS.length, 30);
});

test("stripe prices use currency-specific price keys", () => {
  assert.equal(PHASE4_STRIPE_PRICE_DEFINITIONS[0]?.priceKey, "viz_monthly_jpy");
  assert.equal(PHASE4_STRIPE_PRICE_DEFINITIONS[1]?.priceKey, "viz_monthly_usd");
  assert.equal(
    PHASE4_STRIPE_PRICE_DEFINITIONS.at(-1)?.priceKey,
    "team_bundle_enterprise_yearly_usd",
  );
});

test("price metadata includes team seat count only for team plans", () => {
  const vizMonthly = PHASE4_STRIPE_PRICE_DEFINITIONS.find(
    (entry) => entry.priceKey === "viz_monthly_jpy",
  );
  const teamBundle = PHASE4_STRIPE_PRICE_DEFINITIONS.find(
    (entry) => entry.priceKey === "team_bundle_standard_yearly_usd",
  );

  assert.ok(vizMonthly);
  assert.ok(teamBundle);

  assert.equal("seat_count" in createPhase4PriceMetadata(vizMonthly), false);
  assert.equal(createPhase4PriceMetadata(teamBundle).seat_count, "10");
});
