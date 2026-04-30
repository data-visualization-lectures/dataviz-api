import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { AuthenticatedUser } from "./types.js";
import { getUserFromRequest } from "./supabase.js";
import { resolveRequiredScopeFromApp } from "./app-registry.js";
import { config } from "./config.js";
import { resolveSubscriptionAccess } from "./subscription.js";
import { logger } from "./logger.js";

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthenticatedUser | null> {
  const user = await getUserFromRequest(req);
  if (!user) {
    logger.warn("Unauthenticated request", { path: req.url });
    res.status(401).json({ error: "not_authenticated" });
    return null;
  }

  return user;
}

export async function requireSubscription(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthenticatedUser,
  opts: {
    appName?: string | null;
    requiredScope?: "viz" | "prep" | "bundle" | null;
    source?: string;
  } = {},
): Promise<boolean> {
  const requiredScope =
    opts.requiredScope ?? resolveRequiredScopeFromApp(opts.appName);
  const access = await resolveSubscriptionAccess(user, {
    appName: opts.appName,
    requiredScope,
  });

  if (!access.hasSubscription) {
    logger.info("Subscription required", { userId: user.id, path: req.url });
    res.status(403).json({ error: "subscription_required" });
    return false;
  }

  if (!access.scopeAllowed) {
    const metadata = {
      userId: user.id,
      path: req.url,
      appName: opts.appName ?? null,
      requiredScope,
      subscriptionScope: access.subscriptionScope,
      accessibleScopes: access.accessibleScopes,
      source: opts.source ?? "api",
      enforcementEnabled: config.subscription.scopeEnforcementEnabled,
    };

    if (config.subscription.scopeEnforcementEnabled) {
      logger.info("Scope mismatch blocked", metadata);
      res.status(403).json({ error: "scope_mismatch" });
      return false;
    }

    logger.info("Scope mismatch observed", metadata);
  }

  return true;
}
