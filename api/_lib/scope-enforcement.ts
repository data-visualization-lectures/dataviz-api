export function resolveScopedAppName(params: {
  requestAppName?: string | null;
  projectAppName?: string | null;
}): string | null {
  return params.projectAppName ?? params.requestAppName ?? null;
}

export function shouldBlockScopeMismatch(params: {
  scopeAllowed: boolean;
  scopeEnforcementEnabled: boolean;
  enforceScope?: boolean;
}): boolean {
  const { scopeAllowed, scopeEnforcementEnabled, enforceScope = true } = params;
  return !scopeAllowed && scopeEnforcementEnabled && enforceScope;
}
