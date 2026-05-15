import type {
  AccessibleScope,
  ServiceScope,
  ServiceTrialMap,
  SubscriptionRecord,
  SubscriptionStatus,
} from "./types.js";
import { getActiveServiceTrialScopes } from "./service-trials.js";

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
  serviceTrials?: ServiceTrialMap | null;
  now?: Date;
}): AccessibleScope[] {
  const resolved = new Set<AccessibleScope>();

  if (isSubscribedStatus(params.subscription?.status)) {
    if (params.planScope === "viz") {
      resolved.add("viz");
    } else if (params.planScope === "prep") {
      resolved.add("prep");
    } else {
      for (const scope of SHARED_ACCESSIBLE_SCOPES) {
        resolved.add(scope);
      }
    }
  }

  for (const scope of getActiveServiceTrialScopes(
    params.serviceTrials,
    params.now,
  )) {
    resolved.add(scope);
  }

  return [...resolved];
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

export function combineServiceScopes(
  scopes: Array<ServiceScope | null | undefined>,
): ServiceScope | null {
  if (scopes.length === 0) {
    return null;
  }

  const normalized = scopes.map((scope) =>
    scope === "viz" || scope === "prep" || scope === "bundle" ? scope : null,
  );

  // Missing scope means a legacy or unresolved team plan. Preserve the existing
  // compatibility behavior by treating it as bundle-equivalent.
  if (normalized.some((scope) => scope === null || scope === "bundle")) {
    return "bundle";
  }

  const unique = new Set(normalized);
  if (unique.has("viz") && unique.has("prep")) {
    return "bundle";
  }
  if (unique.has("viz")) {
    return "viz";
  }
  if (unique.has("prep")) {
    return "prep";
  }

  return null;
}

export function resolveEntitlements(params: {
  subscription: Pick<SubscriptionRecord, "plan_id" | "status"> | null | undefined;
  planScope?: ServiceScope | null;
  serviceTrials?: ServiceTrialMap | null;
  now?: Date;
}): ResolvedEntitlements {
  const { subscription, planScope = null, serviceTrials = null, now } = params;
  const accessibleScopes = resolveAccessibleScopes({
    subscription,
    planScope,
    serviceTrials,
    now,
  });
  const isSubscribed =
    isSubscribedStatus(subscription?.status) || accessibleScopes.length > 0;

  return {
    isSubscribed,
    subscriptionScope: resolveSubscriptionScope({ subscription, planScope }),
    accessibleScopes,
  };
}
