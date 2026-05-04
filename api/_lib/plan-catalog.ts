import {
  PHASE4_STORED_PLAN_DEFINITIONS,
  type Phase4StoredPlanId,
} from "./phase4-pricing.ts";
import type { ServiceScope } from "./types.js";

export type BillingCurrency = "jpy" | "usd";
export type BillingInterval = "monthly" | "yearly";

export type LegacyCheckoutPlan =
  | "monthly"
  | "yearly"
  | "coaching_monthly"
  | "coaching_yearly"
  | "team_small_monthly"
  | "team_small_yearly"
  | "team_standard_monthly"
  | "team_standard_yearly"
  | "team_enterprise_monthly"
  | "team_enterprise_yearly";

export type LegacyStoredBillablePlanId =
  | "pro_monthly"
  | "pro_yearly"
  | "coaching_monthly"
  | "coaching_yearly"
  | "team_small_monthly"
  | "team_small_yearly"
  | "team_standard_monthly"
  | "team_standard_yearly"
  | "team_enterprise_monthly"
  | "team_enterprise_yearly"
  | "pro_monthly_usd"
  | "pro_yearly_usd"
  | "team_small_monthly_usd"
  | "team_small_yearly_usd"
  | "team_standard_monthly_usd"
  | "team_standard_yearly_usd"
  | "team_enterprise_monthly_usd"
  | "team_enterprise_yearly_usd";

export type CurrentCheckoutPlanId = Phase4StoredPlanId;
export type StoredBillablePlanId = LegacyStoredBillablePlanId | CurrentCheckoutPlanId;

export type InternalPlanId =
  | "trial"
  | "basic"
  | "academia"
  | "team_member"
  | "admin";

export type KnownPlanId = StoredBillablePlanId | InternalPlanId;
export type CanonicalPlanId = string;

export interface KnownPlanMetadata {
  planId: KnownPlanId;
  canonicalPlanId: CanonicalPlanId;
  scope: ServiceScope | null;
  currency: BillingCurrency | null;
  billingInterval: BillingInterval | null;
  isTeamPlan: boolean;
  maxSeats: number | null;
  isBillable: boolean;
  isSellable: boolean;
}

export interface ResolvedCheckoutPlan extends KnownPlanMetadata {
  planId: CurrentCheckoutPlanId;
  currency: BillingCurrency;
  billingInterval: BillingInterval;
  scope: ServiceScope;
  isBillable: true;
  isSellable: true;
}

type LegacyBillablePlanCatalogEntry = Omit<KnownPlanMetadata, "planId"> & {
  planId: LegacyStoredBillablePlanId;
  isBillable: true;
  isSellable: false;
};

type CurrentBillablePlanCatalogEntry = Omit<KnownPlanMetadata, "planId"> & {
  planId: CurrentCheckoutPlanId;
  scope: ServiceScope;
  currency: BillingCurrency;
  billingInterval: BillingInterval;
  isBillable: true;
  isSellable: true;
};

const CURRENT_BILLABLE_PLAN_CATALOG: CurrentBillablePlanCatalogEntry[] =
  PHASE4_STORED_PLAN_DEFINITIONS.map((entry) => ({
    planId: entry.planId,
    canonicalPlanId: entry.canonicalPlanId,
    scope: entry.scope,
    currency: entry.currency,
    billingInterval: entry.billingInterval,
    isTeamPlan: entry.isTeamPlan,
    maxSeats: entry.seatCount,
    isBillable: true,
    isSellable: true,
  }));

const LEGACY_BILLABLE_PLAN_CATALOG: LegacyBillablePlanCatalogEntry[] = [
  {
    planId: "pro_monthly",
    canonicalPlanId: "bundle_pro_monthly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "monthly",
    isTeamPlan: false,
    maxSeats: null,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "pro_yearly",
    canonicalPlanId: "bundle_pro_yearly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "yearly",
    isTeamPlan: false,
    maxSeats: null,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "coaching_monthly",
    canonicalPlanId: "bundle_coaching_monthly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "monthly",
    isTeamPlan: false,
    maxSeats: null,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "coaching_yearly",
    canonicalPlanId: "bundle_coaching_yearly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "yearly",
    isTeamPlan: false,
    maxSeats: null,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_small_monthly",
    canonicalPlanId: "bundle_team_small_monthly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "monthly",
    isTeamPlan: true,
    maxSeats: 5,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_small_yearly",
    canonicalPlanId: "bundle_team_small_yearly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "yearly",
    isTeamPlan: true,
    maxSeats: 5,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_standard_monthly",
    canonicalPlanId: "bundle_team_standard_monthly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "monthly",
    isTeamPlan: true,
    maxSeats: 10,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_standard_yearly",
    canonicalPlanId: "bundle_team_standard_yearly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "yearly",
    isTeamPlan: true,
    maxSeats: 10,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_enterprise_monthly",
    canonicalPlanId: "bundle_team_enterprise_monthly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "monthly",
    isTeamPlan: true,
    maxSeats: 30,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_enterprise_yearly",
    canonicalPlanId: "bundle_team_enterprise_yearly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "yearly",
    isTeamPlan: true,
    maxSeats: 30,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "pro_monthly_usd",
    canonicalPlanId: "bundle_pro_monthly",
    scope: "bundle",
    currency: "usd",
    billingInterval: "monthly",
    isTeamPlan: false,
    maxSeats: null,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "pro_yearly_usd",
    canonicalPlanId: "bundle_pro_yearly",
    scope: "bundle",
    currency: "usd",
    billingInterval: "yearly",
    isTeamPlan: false,
    maxSeats: null,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_small_monthly_usd",
    canonicalPlanId: "bundle_team_small_monthly",
    scope: "bundle",
    currency: "usd",
    billingInterval: "monthly",
    isTeamPlan: true,
    maxSeats: 5,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_small_yearly_usd",
    canonicalPlanId: "bundle_team_small_yearly",
    scope: "bundle",
    currency: "usd",
    billingInterval: "yearly",
    isTeamPlan: true,
    maxSeats: 5,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_standard_monthly_usd",
    canonicalPlanId: "bundle_team_standard_monthly",
    scope: "bundle",
    currency: "usd",
    billingInterval: "monthly",
    isTeamPlan: true,
    maxSeats: 10,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_standard_yearly_usd",
    canonicalPlanId: "bundle_team_standard_yearly",
    scope: "bundle",
    currency: "usd",
    billingInterval: "yearly",
    isTeamPlan: true,
    maxSeats: 10,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_enterprise_monthly_usd",
    canonicalPlanId: "bundle_team_enterprise_monthly",
    scope: "bundle",
    currency: "usd",
    billingInterval: "monthly",
    isTeamPlan: true,
    maxSeats: 30,
    isBillable: true,
    isSellable: false,
  },
  {
    planId: "team_enterprise_yearly_usd",
    canonicalPlanId: "bundle_team_enterprise_yearly",
    scope: "bundle",
    currency: "usd",
    billingInterval: "yearly",
    isTeamPlan: true,
    maxSeats: 30,
    isBillable: true,
    isSellable: false,
  },
];

const INTERNAL_PLAN_METADATA: Record<InternalPlanId, KnownPlanMetadata> = {
  trial: {
    planId: "trial",
    canonicalPlanId: "trial",
    scope: null,
    currency: null,
    billingInterval: null,
    isTeamPlan: false,
    maxSeats: null,
    isBillable: false,
    isSellable: false,
  },
  basic: {
    planId: "basic",
    canonicalPlanId: "basic",
    scope: null,
    currency: null,
    billingInterval: null,
    isTeamPlan: false,
    maxSeats: null,
    isBillable: false,
    isSellable: false,
  },
  academia: {
    planId: "academia",
    canonicalPlanId: "academia",
    scope: "bundle",
    currency: null,
    billingInterval: null,
    isTeamPlan: false,
    maxSeats: null,
    isBillable: false,
    isSellable: false,
  },
  team_member: {
    planId: "team_member",
    canonicalPlanId: "team_member",
    scope: "bundle",
    currency: null,
    billingInterval: null,
    isTeamPlan: true,
    maxSeats: null,
    isBillable: false,
    isSellable: false,
  },
  admin: {
    planId: "admin",
    canonicalPlanId: "admin",
    scope: "bundle",
    currency: null,
    billingInterval: null,
    isTeamPlan: false,
    maxSeats: null,
    isBillable: false,
    isSellable: false,
  },
};

const BILLABLE_PLAN_BY_ID = new Map(
  [...CURRENT_BILLABLE_PLAN_CATALOG, ...LEGACY_BILLABLE_PLAN_CATALOG].map((entry) => [
    entry.planId,
    entry,
  ]),
);

const CURRENT_BILLABLE_PLAN_BY_ID = new Map(
  CURRENT_BILLABLE_PLAN_CATALOG.map((entry) => [entry.planId, entry]),
);

const CURRENT_CHECKOUT_ALIAS_TARGETS: Record<
  LegacyCheckoutPlan,
  Partial<Record<BillingCurrency, CurrentCheckoutPlanId>>
> = {
  monthly: {
    jpy: "bundle_monthly_jpy",
    usd: "bundle_monthly_usd",
  },
  yearly: {
    jpy: "bundle_yearly_jpy",
    usd: "bundle_yearly_usd",
  },
  coaching_monthly: {},
  coaching_yearly: {},
  team_small_monthly: {},
  team_small_yearly: {
    jpy: "team_bundle_small_yearly_jpy",
    usd: "team_bundle_small_yearly_usd",
  },
  team_standard_monthly: {},
  team_standard_yearly: {
    jpy: "team_bundle_standard_yearly_jpy",
    usd: "team_bundle_standard_yearly_usd",
  },
  team_enterprise_monthly: {},
  team_enterprise_yearly: {
    jpy: "team_bundle_enterprise_yearly_jpy",
    usd: "team_bundle_enterprise_yearly_usd",
  },
};

const LEGACY_STORED_PLAN_TO_CURRENT_PLAN: Partial<
  Record<LegacyStoredBillablePlanId, CurrentCheckoutPlanId>
> = {
  pro_monthly: "bundle_monthly_jpy",
  pro_yearly: "bundle_yearly_jpy",
  pro_monthly_usd: "bundle_monthly_usd",
  pro_yearly_usd: "bundle_yearly_usd",
  team_small_yearly: "team_bundle_small_yearly_jpy",
  team_small_yearly_usd: "team_bundle_small_yearly_usd",
  team_standard_yearly: "team_bundle_standard_yearly_jpy",
  team_standard_yearly_usd: "team_bundle_standard_yearly_usd",
  team_enterprise_yearly: "team_bundle_enterprise_yearly_jpy",
  team_enterprise_yearly_usd: "team_bundle_enterprise_yearly_usd",
};

function normalizeCurrency(currency: string | null | undefined): BillingCurrency {
  return currency === "usd" ? "usd" : "jpy";
}

export function listBillablePlanIds(): StoredBillablePlanId[] {
  return [...CURRENT_BILLABLE_PLAN_CATALOG, ...LEGACY_BILLABLE_PLAN_CATALOG].map(
    (entry) => entry.planId,
  );
}

export function resolveKnownPlanMetadata(
  planId: string | null | undefined,
): KnownPlanMetadata | null {
  if (!planId) {
    return null;
  }

  const billable = BILLABLE_PLAN_BY_ID.get(planId as StoredBillablePlanId);
  if (billable) {
    return billable;
  }

  return INTERNAL_PLAN_METADATA[planId as InternalPlanId] ?? null;
}

export function resolveCanonicalPlanId(
  planId: string | null | undefined,
): string | null {
  return resolveKnownPlanMetadata(planId)?.canonicalPlanId ?? planId ?? null;
}

export function isTeamPlanId(planId: string | null | undefined): boolean {
  return resolveKnownPlanMetadata(planId)?.isTeamPlan ?? false;
}

export function resolveCheckoutPlanSelection(
  requestedPlan: string | null | undefined,
  requestedCurrency: string | null | undefined,
): ResolvedCheckoutPlan | null {
  if (!requestedPlan) {
    return null;
  }

  const directCurrent = CURRENT_BILLABLE_PLAN_BY_ID.get(requestedPlan as CurrentCheckoutPlanId);
  if (directCurrent) {
    return directCurrent;
  }

  const currency = normalizeCurrency(requestedCurrency);
  const aliasTarget =
    CURRENT_CHECKOUT_ALIAS_TARGETS[requestedPlan as LegacyCheckoutPlan]?.[currency] ?? null;
  if (aliasTarget) {
    return CURRENT_BILLABLE_PLAN_BY_ID.get(aliasTarget) ?? null;
  }

  const legacyTarget =
    LEGACY_STORED_PLAN_TO_CURRENT_PLAN[requestedPlan as LegacyStoredBillablePlanId] ?? null;
  if (legacyTarget) {
    return CURRENT_BILLABLE_PLAN_BY_ID.get(legacyTarget) ?? null;
  }

  return null;
}
