import type { AccessibleScope, ServiceTrialRecord } from "./types.js";

export function canStartEligibleServiceTrial(params: {
  requestedServiceScope: AccessibleScope | null | undefined;
  accessibleScopes: readonly AccessibleScope[];
  serviceTrial: Pick<ServiceTrialRecord, "status"> | null | undefined;
  hasSubscriptionRecord: boolean;
}): boolean {
  const {
    requestedServiceScope,
    accessibleScopes,
    serviceTrial,
    hasSubscriptionRecord,
  } = params;

  if (!requestedServiceScope) {
    return false;
  }

  if (hasSubscriptionRecord) {
    return false;
  }

  return (
    !accessibleScopes.includes(requestedServiceScope) &&
    serviceTrial?.status === "eligible"
  );
}
