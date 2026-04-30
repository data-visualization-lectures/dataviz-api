import type {
  AccessibleScope,
  ServiceScope,
  SubscriptionRecord,
  SubscriptionStatus,
} from "./types.js";

export interface ResolvedEntitlements {
  isSubscribed: boolean;
  subscriptionScope: ServiceScope | null;
  accessibleScopes: AccessibleScope[];
}

const SHARED_ACCESSIBLE_SCOPES: AccessibleScope[] = ["viz", "prep"];

export function isSubscribedStatus(
  status: SubscriptionStatus | null | undefined,
): boolean {
  return status === "active" || status === "trialing";
}

export function resolveSubscriptionScope(params: {
  subscription: Pick<SubscriptionRecord, "plan_id"> | null | undefined;
  planScope?: ServiceScope | null;
}): ServiceScope | null {
  const { subscription, planScope = null } = params;
  if (!subscription?.plan_id) {
    return null;
  }

  // Phase 1 keeps all legacy plans effectively bundle-compatible.
  return planScope ?? "bundle";
}

export function resolveAccessibleScopes(params: {
  subscription: Pick<SubscriptionRecord, "status"> | null | undefined;
  planScope?: ServiceScope | null;
}): AccessibleScope[] {
  if (!isSubscribedStatus(params.subscription?.status)) {
    return [];
  }

  if (params.planScope === "viz") {
    return ["viz"];
  }
  if (params.planScope === "prep") {
    return ["prep"];
  }

  return [...SHARED_ACCESSIBLE_SCOPES];
}

export function hasAccessibleScope(params: {
  requiredScope?: AccessibleScope | ServiceScope | null;
  subscriptionScope?: ServiceScope | null;
  accessibleScopes?: AccessibleScope[] | null;
}): boolean {
  const { requiredScope = null, subscriptionScope = null, accessibleScopes = [] } = params;
  const normalizedAccessibleScopes = accessibleScopes ?? [];
  if (!requiredScope) {
    return true;
  }

  if (subscriptionScope === "bundle") {
    return true;
  }

  return normalizedAccessibleScopes.includes(requiredScope as AccessibleScope);
}

export function resolveEntitlements(params: {
  subscription: Pick<SubscriptionRecord, "plan_id" | "status"> | null | undefined;
  planScope?: ServiceScope | null;
}): ResolvedEntitlements {
  const { subscription, planScope = null } = params;
  const isSubscribed = isSubscribedStatus(subscription?.status);

  return {
    isSubscribed,
    subscriptionScope: resolveSubscriptionScope({ subscription, planScope }),
    accessibleScopes: resolveAccessibleScopes({ subscription, planScope }),
  };
}
