import type Stripe from "stripe";

export type CheckoutSessionForPurchase = Pick<
  Stripe.Checkout.Session,
  "id" | "status" | "payment_status" | "amount_total" | "currency" | "metadata"
>;

const ZERO_DECIMAL_CURRENCIES = new Set(["jpy"]);

export type CheckoutPurchase = {
  plan: string;
  value: number;
  currency: string;
  transaction_id: string;
};

export class CheckoutPurchaseError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(code);
    this.name = "CheckoutPurchaseError";
  }
}

export function resolveCheckoutPurchase(
  session: CheckoutSessionForPurchase,
  userId: string,
): CheckoutPurchase {
  if (session.metadata?.user_id !== userId) {
    throw new CheckoutPurchaseError("checkout_session_forbidden", 403);
  }

  if (session.status !== "complete") {
    throw new CheckoutPurchaseError("checkout_session_incomplete", 409);
  }

  if (
    session.payment_status !== "paid" &&
    session.payment_status !== "no_payment_required"
  ) {
    throw new CheckoutPurchaseError("checkout_session_unpaid", 409);
  }

  const plan = session.metadata?.plan_id;
  if (!plan || session.amount_total === null || !session.currency) {
    throw new CheckoutPurchaseError("checkout_session_missing_purchase_data", 422);
  }

  return {
    plan,
    value: ZERO_DECIMAL_CURRENCIES.has(session.currency.toLowerCase())
      ? session.amount_total
      : session.amount_total / 100,
    currency: session.currency.toUpperCase(),
    transaction_id: session.id,
  };
}
