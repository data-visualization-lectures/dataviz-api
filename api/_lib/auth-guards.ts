import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { AuthenticatedUser } from "./types.js";
import { getUserFromRequest } from "./supabase.js";
import { checkSubscription } from "./subscription.js";
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
  user: AuthenticatedUser
): Promise<boolean> {
  const hasSubscription = await checkSubscription(user);
  if (!hasSubscription) {
    logger.info("Subscription required", { userId: user.id, path: req.url });
    res.status(403).json({ error: "subscription_required" });
    return false;
  }

  return true;
}
