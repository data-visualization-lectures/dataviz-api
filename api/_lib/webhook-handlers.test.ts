import test from "node:test";
import assert from "node:assert/strict";

// webhook-handlers imports modules that read config at load time.
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_dummy";
delete process.env.GA4_MEASUREMENT_ID;
delete process.env.GA4_API_SECRET;

const {
  handleCheckoutCompleted,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} = await import("./webhook-handlers.ts");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PRICE_ID = "price_viz_monthly";

type Row = Record<string, any>;

// Minimal in-memory stand-in for the Supabase query builder calls the
// webhook handlers make.
class FakeSupabase {
  subscriptions: Row | null;
  upserts: Row[] = [];
  profiles = new Set<string>([USER_ID]);

  constructor(subscription: Row | null) {
    this.subscriptions = subscription;
  }

  from(table: string) {
    const db = this;
    const filters: Record<string, unknown> = {};
    const builder: any = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      in() {
        return builder;
      },
      like() {
        return builder;
      },
      neq() {
        return builder;
      },
      update() {
        return builder;
      },
      insert() {
        return builder;
      },
      single() {
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle() {
        if (table === "subscriptions") {
          return Promise.resolve({ data: db.subscriptions, error: null });
        }
        if (table === "plans") {
          const found =
            filters.stripe_price_id === PRICE_ID || filters.id === "viz_monthly_jpy";
          return Promise.resolve({
            data: found
              ? { id: "viz_monthly_jpy", stripe_price_id: PRICE_ID, scope: "viz" }
              : null,
            error: null,
          });
        }
        if (table === "profiles") {
          return Promise.resolve({
            data: db.profiles.has(String(filters.id)) ? { id: filters.id } : null,
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      upsert(payload: Row) {
        db.upserts.push(payload);
        db.subscriptions = { ...(db.subscriptions ?? {}), ...payload };
        return Promise.resolve({ error: null });
      },
      then(resolve: (value: unknown) => unknown) {
        // service_trials update(...).eq().in().in().select()
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    return builder;
  }
}

function stripeSubscription(id: string, status: string): any {
  return {
    id,
    status,
    customer: "cus_1",
    metadata: { user_id: USER_ID },
    current_period_end: 1_900_000_000,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: PRICE_ID } }] },
  };
}

function fakeStripe(subscriptions: Record<string, any>): any {
  return {
    subscriptions: {
      retrieve: async (id: string) => {
        if (!subscriptions[id]) throw new Error(`no such subscription ${id}`);
        return subscriptions[id];
      },
    },
    customers: {
      retrieve: async () => ({ metadata: { user_id: USER_ID } }),
    },
  };
}

function event(type: string, object: any, created = 1_800_000_000): any {
  return { id: `evt_${type}_${object.id}`, type, created, data: { object } };
}

test("the old subscription's deletion does not cancel the row that tracks a new subscription", async () => {
  const db = new FakeSupabase({ user_id: USER_ID, stripe_subscription_id: "sub_new", status: "active" });
  const stripe = fakeStripe({});

  await handleSubscriptionDeleted(
    event("customer.subscription.deleted", stripeSubscription("sub_old", "canceled")),
    stripe,
    db as any,
  );

  assert.equal(db.upserts.length, 0);
  assert.equal(db.subscriptions?.status, "active");
});

test("the tracked subscription's deletion cancels the row", async () => {
  const db = new FakeSupabase({ user_id: USER_ID, stripe_subscription_id: "sub_1", status: "active" });

  await handleSubscriptionDeleted(
    event("customer.subscription.deleted", stripeSubscription("sub_1", "canceled")),
    fakeStripe({}),
    db as any,
  );

  assert.equal(db.upserts.length, 1);
  assert.equal(db.subscriptions?.status, "canceled");
});

test("subscription.updated uses the current state from Stripe, not the event payload", async () => {
  const db = new FakeSupabase({ user_id: USER_ID, stripe_subscription_id: "sub_1", status: "active" });
  // A delayed event still says past_due, but the subscription has recovered.
  const stripe = fakeStripe({ sub_1: stripeSubscription("sub_1", "active") });

  await handleSubscriptionUpdated(
    event("customer.subscription.updated", stripeSubscription("sub_1", "past_due")),
    stripe,
    db as any,
  );

  assert.equal(db.subscriptions?.status, "active");
});

test("re-checkout while past_due switches the row to the new subscription", async () => {
  const db = new FakeSupabase({ user_id: USER_ID, stripe_subscription_id: "sub_old", status: "past_due" });
  const stripe = fakeStripe({ sub_new: stripeSubscription("sub_new", "active") });

  await handleCheckoutCompleted(
    event("checkout.session.completed", {
      id: "cs_1",
      customer: "cus_1",
      subscription: "sub_new",
      metadata: { user_id: USER_ID },
    }),
    stripe,
    db as any,
  );

  assert.equal(db.subscriptions?.stripe_subscription_id, "sub_new");
  assert.equal(db.subscriptions?.status, "active");
});

test("the old subscription's failed invoice does not mark the new subscription past_due", async () => {
  const db = new FakeSupabase({ user_id: USER_ID, stripe_subscription_id: "sub_new", status: "active" });
  const stripe = fakeStripe({ sub_old: stripeSubscription("sub_old", "past_due") });

  await handleInvoicePaymentFailed(
    event("invoice.payment_failed", {
      id: "in_1",
      customer: "cus_1",
      subscription: "sub_old",
      lines: { data: [{ price: { id: PRICE_ID } }] },
    }),
    stripe,
    db as any,
  );

  assert.equal(db.upserts.length, 0);
  assert.equal(db.subscriptions?.status, "active");
});

test("an invoice without a subscription does not change the row", async () => {
  const db = new FakeSupabase({ user_id: USER_ID, stripe_subscription_id: null, status: "canceled" });

  await handleInvoicePaymentSucceeded(
    event("invoice.payment_succeeded", {
      id: "in_2",
      customer: "cus_1",
      subscription: null,
      lines: { data: [] },
    }),
    fakeStripe({}),
    db as any,
  );

  assert.equal(db.upserts.length, 0);
  assert.equal(db.subscriptions?.status, "canceled");
});

test("checkout completion fails (so Stripe retries) when the subscription cannot be retrieved", async () => {
  const db = new FakeSupabase(null);

  await assert.rejects(
    handleCheckoutCompleted(
      event("checkout.session.completed", {
        id: "cs_2",
        customer: "cus_1",
        subscription: "sub_missing",
        metadata: { user_id: USER_ID },
      }),
      fakeStripe({}),
      db as any,
    ),
  );
  assert.equal(db.upserts.length, 0);
});
