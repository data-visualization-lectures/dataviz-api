import type { BillingCurrency, BillingInterval } from "./plan-catalog.js";
import type { ServiceScope } from "./types.js";

export type Phase4CanonicalPlanId =
  | "viz_monthly"
  | "viz_yearly"
  | "prep_monthly"
  | "prep_yearly"
  | "bundle_monthly"
  | "bundle_yearly"
  | "team_viz_small_yearly"
  | "team_viz_standard_yearly"
  | "team_viz_enterprise_yearly"
  | "team_prep_small_yearly"
  | "team_prep_standard_yearly"
  | "team_prep_enterprise_yearly"
  | "team_bundle_small_yearly"
  | "team_bundle_standard_yearly"
  | "team_bundle_enterprise_yearly";

export type Phase4StoredPlanId =
  | `${Phase4CanonicalPlanId}_jpy`
  | `${Phase4CanonicalPlanId}_usd`;

export interface Phase4CanonicalPlanDefinition {
  canonicalPlanId: Phase4CanonicalPlanId;
  productId: Phase4CanonicalPlanId;
  nameJa: string;
  nameEn: string;
  scope: ServiceScope;
  billingInterval: BillingInterval;
  isTeamPlan: boolean;
  seatCount: number | null;
  pricing: {
    jpy: number;
    usd: number;
  };
}

export interface Phase4StoredPlanDefinition {
  planId: Phase4StoredPlanId;
  canonicalPlanId: Phase4CanonicalPlanId;
  productId: Phase4CanonicalPlanId;
  nameJa: string;
  nameEn: string;
  scope: ServiceScope;
  billingInterval: BillingInterval;
  currency: BillingCurrency;
  amount: number;
  isTeamPlan: boolean;
  seatCount: number | null;
  lookupKey: Phase4StoredPlanId;
}

// amount は Stripe / plans.amount と同じ最小通貨単位で保持する
// - JPY: 1000 => ¥1,000
// - USD: 800  => $8.00
export const PHASE4_CANONICAL_PLAN_DEFINITIONS: readonly Phase4CanonicalPlanDefinition[] = [
  {
    canonicalPlanId: "viz_monthly",
    productId: "viz_monthly",
    nameJa: "データ可視化プラン（月額）",
    nameEn: "Visualization Plan (Monthly)",
    scope: "viz",
    billingInterval: "monthly",
    isTeamPlan: false,
    seatCount: null,
    pricing: { jpy: 1000, usd: 800 },
  },
  {
    canonicalPlanId: "viz_yearly",
    productId: "viz_yearly",
    nameJa: "データ可視化プラン（年額）",
    nameEn: "Visualization Plan (Yearly)",
    scope: "viz",
    billingInterval: "yearly",
    isTeamPlan: false,
    seatCount: null,
    pricing: { jpy: 10000, usd: 8000 },
  },
  {
    canonicalPlanId: "prep_monthly",
    productId: "prep_monthly",
    nameJa: "データ加工プラン（月額）",
    nameEn: "Data Preparation Plan (Monthly)",
    scope: "prep",
    billingInterval: "monthly",
    isTeamPlan: false,
    seatCount: null,
    pricing: { jpy: 1480, usd: 1200 },
  },
  {
    canonicalPlanId: "prep_yearly",
    productId: "prep_yearly",
    nameJa: "データ加工プラン（年額）",
    nameEn: "Data Preparation Plan (Yearly)",
    scope: "prep",
    billingInterval: "yearly",
    isTeamPlan: false,
    seatCount: null,
    pricing: { jpy: 14800, usd: 12000 },
  },
  {
    canonicalPlanId: "bundle_monthly",
    productId: "bundle_monthly",
    nameJa: "総合プラン（月額）",
    nameEn: "All-in-One Plan (Monthly)",
    scope: "bundle",
    billingInterval: "monthly",
    isTeamPlan: false,
    seatCount: null,
    pricing: { jpy: 2480, usd: 1900 },
  },
  {
    canonicalPlanId: "bundle_yearly",
    productId: "bundle_yearly",
    nameJa: "総合プラン（年額）",
    nameEn: "All-in-One Plan (Yearly)",
    scope: "bundle",
    billingInterval: "yearly",
    isTeamPlan: false,
    seatCount: null,
    pricing: { jpy: 24800, usd: 19000 },
  },
  {
    canonicalPlanId: "team_viz_small_yearly",
    productId: "team_viz_small_yearly",
    nameJa: "データ可視化チームプラン スモール（年額）",
    nameEn: "Visualization Team Plan Small (Yearly)",
    scope: "viz",
    billingInterval: "yearly",
    isTeamPlan: true,
    seatCount: 5,
    pricing: { jpy: 40000, usd: 32000 },
  },
  {
    canonicalPlanId: "team_viz_standard_yearly",
    productId: "team_viz_standard_yearly",
    nameJa: "データ可視化チームプラン スタンダード（年額）",
    nameEn: "Visualization Team Plan Standard (Yearly)",
    scope: "viz",
    billingInterval: "yearly",
    isTeamPlan: true,
    seatCount: 10,
    pricing: { jpy: 80000, usd: 64000 },
  },
  {
    canonicalPlanId: "team_viz_enterprise_yearly",
    productId: "team_viz_enterprise_yearly",
    nameJa: "データ可視化チームプラン エンタープライズ（年額）",
    nameEn: "Visualization Team Plan Enterprise (Yearly)",
    scope: "viz",
    billingInterval: "yearly",
    isTeamPlan: true,
    seatCount: 30,
    pricing: { jpy: 240000, usd: 192000 },
  },
  {
    canonicalPlanId: "team_prep_small_yearly",
    productId: "team_prep_small_yearly",
    nameJa: "データ加工チームプラン スモール（年額）",
    nameEn: "Data Preparation Team Plan Small (Yearly)",
    scope: "prep",
    billingInterval: "yearly",
    isTeamPlan: true,
    seatCount: 5,
    pricing: { jpy: 59000, usd: 48000 },
  },
  {
    canonicalPlanId: "team_prep_standard_yearly",
    productId: "team_prep_standard_yearly",
    nameJa: "データ加工チームプラン スタンダード（年額）",
    nameEn: "Data Preparation Team Plan Standard (Yearly)",
    scope: "prep",
    billingInterval: "yearly",
    isTeamPlan: true,
    seatCount: 10,
    pricing: { jpy: 118000, usd: 96000 },
  },
  {
    canonicalPlanId: "team_prep_enterprise_yearly",
    productId: "team_prep_enterprise_yearly",
    nameJa: "データ加工チームプラン エンタープライズ（年額）",
    nameEn: "Data Preparation Team Plan Enterprise (Yearly)",
    scope: "prep",
    billingInterval: "yearly",
    isTeamPlan: true,
    seatCount: 30,
    pricing: { jpy: 355000, usd: 288000 },
  },
  {
    canonicalPlanId: "team_bundle_small_yearly",
    productId: "team_bundle_small_yearly",
    nameJa: "総合チームプラン スモール（年額）",
    nameEn: "All-in-One Team Plan Small (Yearly)",
    scope: "bundle",
    billingInterval: "yearly",
    isTeamPlan: true,
    seatCount: 5,
    pricing: { jpy: 99000, usd: 80000 },
  },
  {
    canonicalPlanId: "team_bundle_standard_yearly",
    productId: "team_bundle_standard_yearly",
    nameJa: "総合チームプラン スタンダード（年額）",
    nameEn: "All-in-One Team Plan Standard (Yearly)",
    scope: "bundle",
    billingInterval: "yearly",
    isTeamPlan: true,
    seatCount: 10,
    pricing: { jpy: 198000, usd: 160000 },
  },
  {
    canonicalPlanId: "team_bundle_enterprise_yearly",
    productId: "team_bundle_enterprise_yearly",
    nameJa: "総合チームプラン エンタープライズ（年額）",
    nameEn: "All-in-One Team Plan Enterprise (Yearly)",
    scope: "bundle",
    billingInterval: "yearly",
    isTeamPlan: true,
    seatCount: 30,
    pricing: { jpy: 595000, usd: 480000 },
  },
] as const;

export const PHASE4_CANONICAL_PLAN_BY_ID = new Map(
  PHASE4_CANONICAL_PLAN_DEFINITIONS.map((definition) => [
    definition.canonicalPlanId,
    definition,
  ]),
);

export const PHASE4_STORED_PLAN_DEFINITIONS: readonly Phase4StoredPlanDefinition[] =
  PHASE4_CANONICAL_PLAN_DEFINITIONS.flatMap((definition) => [
    {
      planId: `${definition.canonicalPlanId}_jpy` as const,
      canonicalPlanId: definition.canonicalPlanId,
      productId: definition.productId,
      nameJa: definition.nameJa,
      nameEn: definition.nameEn,
      scope: definition.scope,
      billingInterval: definition.billingInterval,
      currency: "jpy" as const,
      amount: definition.pricing.jpy,
      isTeamPlan: definition.isTeamPlan,
      seatCount: definition.seatCount,
      lookupKey: `${definition.canonicalPlanId}_jpy` as const,
    },
    {
      planId: `${definition.canonicalPlanId}_usd` as const,
      canonicalPlanId: definition.canonicalPlanId,
      productId: definition.productId,
      nameJa: definition.nameJa,
      nameEn: definition.nameEn,
      scope: definition.scope,
      billingInterval: definition.billingInterval,
      currency: "usd" as const,
      amount: definition.pricing.usd,
      isTeamPlan: definition.isTeamPlan,
      seatCount: definition.seatCount,
      lookupKey: `${definition.canonicalPlanId}_usd` as const,
    },
  ]);

export const PHASE4_STORED_PLAN_BY_ID = new Map(
  PHASE4_STORED_PLAN_DEFINITIONS.map((definition) => [definition.planId, definition]),
);

export function getPhase4CanonicalPlan(
  canonicalPlanId: Phase4CanonicalPlanId,
): Phase4CanonicalPlanDefinition | null {
  return PHASE4_CANONICAL_PLAN_BY_ID.get(canonicalPlanId) ?? null;
}

export function getPhase4StoredPlan(
  planId: Phase4StoredPlanId,
): Phase4StoredPlanDefinition | null {
  return PHASE4_STORED_PLAN_BY_ID.get(planId) ?? null;
}
