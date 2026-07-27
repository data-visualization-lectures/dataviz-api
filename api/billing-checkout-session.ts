import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "./_lib/http.js";
import { createStripeClient } from "./_lib/stripe.js";
import { getUserFromRequest } from "./_lib/supabase.js";
import {
  CheckoutPurchaseError,
  resolveCheckoutPurchase,
} from "./_lib/checkout-purchase.js";
import { logger } from "./_lib/logger.js";

const stripe = createStripeClient();

function getSessionId(req: VercelRequest): string | null {
  const value = req.query.session_id;
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsAndMethods(req, res, ["GET"])) {
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");

  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    const sessionId = getSessionId(req);
    if (!sessionId) {
      return res.status(400).json({ error: "missing_session_id" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const purchase = resolveCheckoutPurchase(session, user.id);
    return res.status(200).json(purchase);
  } catch (error) {
    if (error instanceof CheckoutPurchaseError) {
      return res.status(error.statusCode).json({ error: error.code });
    }

    logger.error("Stripe checkout session lookup error", error);
    return res.status(500).json({ error: "checkout_session_lookup_failed" });
  }
}
