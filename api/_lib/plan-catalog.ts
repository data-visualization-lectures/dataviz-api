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

export type StoredBillablePlanId =
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

export type InternalPlanId =
  | "trial"
  | "basic"
  | "academia"
  | "team_member"
  | "admin";

export type KnownPlanId = StoredBillablePlanId | InternalPlanId;

export type CanonicalPlanId =
  | "bundle_pro_monthly"
  | "bundle_pro_yearly"
  | "bundle_coaching_monthly"
  | "bundle_coaching_yearly"
  | "bundle_team_small_monthly"
  | "bundle_team_small_yearly"
  | "bundle_team_standard_monthly"
  | "bundle_team_standard_yearly"
  | "bundle_team_enterprise_monthly"
  | "bundle_team_enterprise_yearly"
  | "trial"
  | "basic"
  | "academia"
  | "team_member"
  | "admin";

export interface KnownPlanMetadata {
  planId: KnownPlanId;
  canonicalPlanId: CanonicalPlanId;
  scope: ServiceScope | null;
  currency: BillingCurrency | null;
  billingInterval: BillingInterval | null;
  isTeamPlan: boolean;
  maxSeats: number | null;
  isBillable: boolean;
}

export interface ResolvedCheckoutPlan extends KnownPlanMetadata {
  planId: StoredBillablePlanId;
  currency: BillingCurrency;
  billingInterval: BillingInterval;
  scope: ServiceScope;
  isBillable: true;
}

type BillablePlanCatalogEntry = Omit<KnownPlanMetadata, "planId"> & {
  planId: StoredBillablePlanId;
  checkoutAliases: LegacyCheckoutPlan[];
  currency: BillingCurrency;
  billingInterval: BillingInterval;
  scope: ServiceScope;
  isBillable: true;
};

const BILLABLE_PLAN_CATALOG: BillablePlanCatalogEntry[] = [
  {
    planId: "pro_monthly",
    canonicalPlanId: "bundle_pro_monthly",
    scope: "bundle",
    currency: "jpy",
    billingInterval: "monthly",
    isTeamPlan: false,
    maxSeats: null,
    isBillable: true,
    checkoutAliases: ["monthly"],
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
    checkoutAliases: ["yearly"],
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
    checkoutAliases: ["coaching_monthly"],
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
    checkoutAliases: ["coaching_yearly"],
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
    checkoutAliases: ["team_small_monthly"],
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
    checkoutAliases: ["team_small_yearly"],
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
    checkoutAliases: ["team_standard_monthly"],
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
    checkoutAliases: ["team_standard_yearly"],
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
    checkoutAliases: ["team_enterprise_monthly"],
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
    checkoutAliases: ["team_enterprise_yearly"],
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
    checkoutAliases: ["monthly"],
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
    checkoutAliases: ["yearly"],
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
    checkoutAliases: ["team_small_monthly"],
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
    checkoutAliases: ["team_small_yearly"],
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
    checkoutAliases: ["team_standard_monthly"],
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
    checkoutAliases: ["team_standard_yearly"],
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
    checkoutAliases: ["team_enterprise_monthly"],
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
    checkoutAliases: ["team_enterprise_yearly"],
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
  },
};

const BILLABLE_PLAN_BY_ID = new Map(
  BILLABLE_PLAN_CATALOG.map((entry) => [entry.planId, entry]),
);

const CHECKOUT_PLAN_BY_CURRENCY_AND_ALIAS = new Map(
  BILLABLE_PLAN_CATALOG.flatMap((entry) =>
    entry.checkoutAliases.map((alias) => [`${entry.currency}:${alias}`, entry] as const),
  ),
);

function normalizeCurrency(
  currency: string | null | undefined,
): BillingCurrency {
  return currency === "usd" ? "usd" : "jpy";
}

export function listBillablePlanIds(): StoredBillablePlanId[] {
  return BILLABLE_PLAN_CATALOG.map((entry) => entry.planId);
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

  const currency = normalizeCurrency(requestedCurrency);
  const preferred = CHECKOUT_PLAN_BY_CURRENCY_AND_ALIAS.get(
    `${currency}:${requestedPlan}` as `${BillingCurrency}:${LegacyCheckoutPlan}`,
  );
  if (preferred) {
    return preferred;
  }

  const fallback =
    CHECKOUT_PLAN_BY_CURRENCY_AND_ALIAS.get(
      `jpy:${requestedPlan}` as `jpy:${LegacyCheckoutPlan}`,
    ) ?? null;

  if (fallback) {
    return fallback;
  }

  return BILLABLE_PLAN_BY_ID.get(requestedPlan as StoredBillablePlanId) ?? null;
}
