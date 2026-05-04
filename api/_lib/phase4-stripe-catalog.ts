import {
  PHASE4_CANONICAL_PLAN_DEFINITIONS,
  PHASE4_STORED_PLAN_DEFINITIONS,
  type Phase4CanonicalPlanDefinition,
  type Phase4StoredPlanDefinition,
} from "./phase4-pricing.ts";

export interface Phase4StripeProductDefinition {
  canonicalPlanId: Phase4CanonicalPlanDefinition["canonicalPlanId"];
  productId: Phase4CanonicalPlanDefinition["productId"];
  productNameEn: string;
  scope: Phase4CanonicalPlanDefinition["scope"];
  billingInterval: Phase4CanonicalPlanDefinition["billingInterval"];
  isTeamPlan: boolean;
  seatCount: number | null;
}

export interface Phase4StripePriceDefinition {
  canonicalPlanId: Phase4StoredPlanDefinition["canonicalPlanId"];
  productId: Phase4StoredPlanDefinition["productId"];
  productNameEn: string;
  priceKey: Phase4StoredPlanDefinition["planId"];
  priceNameEn: string;
  lookupKey: Phase4StoredPlanDefinition["lookupKey"];
  scope: Phase4StoredPlanDefinition["scope"];
  billingInterval: Phase4StoredPlanDefinition["billingInterval"];
  currency: Phase4StoredPlanDefinition["currency"];
  amount: number;
  isTeamPlan: boolean;
  seatCount: number | null;
}

export const PHASE4_STRIPE_PRODUCT_DEFINITIONS: readonly Phase4StripeProductDefinition[] =
  PHASE4_CANONICAL_PLAN_DEFINITIONS.map((definition) => ({
    canonicalPlanId: definition.canonicalPlanId,
    productId: definition.productId,
    productNameEn: definition.nameEn,
    scope: definition.scope,
    billingInterval: definition.billingInterval,
    isTeamPlan: definition.isTeamPlan,
    seatCount: definition.seatCount,
  }));

export const PHASE4_STRIPE_PRICE_DEFINITIONS: readonly Phase4StripePriceDefinition[] =
  PHASE4_STORED_PLAN_DEFINITIONS.map((definition) => ({
    canonicalPlanId: definition.canonicalPlanId,
    productId: definition.productId,
    productNameEn: definition.nameEn,
    priceKey: definition.planId,
    priceNameEn: `${definition.nameEn} - ${definition.currency.toUpperCase()}`,
    lookupKey: definition.lookupKey,
    scope: definition.scope,
    billingInterval: definition.billingInterval,
    currency: definition.currency,
    amount: definition.amount,
    isTeamPlan: definition.isTeamPlan,
    seatCount: definition.seatCount,
  }));

export function createPhase4PriceMetadata(
  definition: Phase4StripePriceDefinition,
): Record<string, string> {
  const metadata: Record<string, string> = {
    canonical_plan_id: definition.canonicalPlanId,
    product_id: definition.productId,
    scope: definition.scope,
    billing_interval: definition.billingInterval,
    currency: definition.currency,
    is_team_plan: definition.isTeamPlan ? "true" : "false",
  };

  if (definition.seatCount !== null) {
    metadata.seat_count = String(definition.seatCount);
  }

  return metadata;
}

export function createPhase4ProductMetadata(
  definition: Phase4StripeProductDefinition,
): Record<string, string> {
  const metadata: Record<string, string> = {
    canonical_plan_id: definition.canonicalPlanId,
    product_id: definition.productId,
    scope: definition.scope,
    billing_interval: definition.billingInterval,
    is_team_plan: definition.isTeamPlan ? "true" : "false",
  };

  if (definition.seatCount !== null) {
    metadata.seat_count = String(definition.seatCount);
  }

  return metadata;
}
