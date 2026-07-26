import type { AccessibleScope, ServiceTrialRecord } from "./types.js";

export type ServiceTrialStartedSignal = {
  service_scope: AccessibleScope;
  started_at: string | null;
  current_period_end: string | null;
};

export function createServiceTrialStartedSignal(
  trial:
    | Pick<
        ServiceTrialRecord,
        "service_scope" | "started_at" | "current_period_end"
      >
    | null
    | undefined,
): ServiceTrialStartedSignal | null {
  if (!trial) {
    return null;
  }

  return {
    service_scope: trial.service_scope,
    started_at: trial.started_at ?? null,
    current_period_end: trial.current_period_end ?? null,
  };
}

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
