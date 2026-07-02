import test from "node:test";
import assert from "node:assert/strict";

import {
  claimStripeWebhookEvent,
  markStripeWebhookEventProcessed,
  releaseStripeWebhookEventClaim,
} from "./webhook-idempotency.ts";

class FakeWebhookEventsTable {
  insertError: any = null;
  updateError: any = null;
  deleteError: any = null;
  insertPayload: any = null;
  updatePayload: any = null;
  updateFilters: Array<[string, unknown]> = [];
  deleteFilters: Array<[string, unknown]> = [];

  insert(payload: any) {
    this.insertPayload = payload;
    return Promise.resolve({ error: this.insertError });
  }

  update(payload: any) {
    this.updatePayload = payload;
    return {
      eq: (column: string, value: unknown) => {
        this.updateFilters.push([column, value]);
        return Promise.resolve({ error: this.updateError });
      },
    };
  }

  delete() {
    const chain = {
      eq: (column: string, value: unknown): any => {
        this.deleteFilters.push([column, value]);
        if (this.deleteFilters.length >= 2) {
          return Promise.resolve({ error: this.deleteError });
        }
        return chain;
      },
    };
    return chain;
  }
}

function fakeSupabase(table: FakeWebhookEventsTable) {
  return {
    from(tableName: string) {
      assert.equal(tableName, "processed_webhook_events");
      return table;
    },
  } as any;
}

test("claimStripeWebhookEvent inserts a processing marker", async () => {
  const table = new FakeWebhookEventsTable();

  assert.equal(
    await claimStripeWebhookEvent(fakeSupabase(table), {
      id: "evt_1",
      type: "checkout.session.completed",
    }),
    true,
  );
  assert.deepEqual(table.insertPayload, {
    stripe_event_id: "evt_1",
    event_type: "checkout.session.completed",
    status: "processing",
  });
});

test("claimStripeWebhookEvent skips duplicate Stripe event ids", async () => {
  const table = new FakeWebhookEventsTable();
  table.insertError = { code: "23505", message: "duplicate key" };

  assert.equal(
    await claimStripeWebhookEvent(fakeSupabase(table), {
      id: "evt_duplicate",
      type: "invoice.payment_succeeded",
    }),
    false,
  );
});

test("claimStripeWebhookEvent throws non-duplicate insert failures", async () => {
  const table = new FakeWebhookEventsTable();
  table.insertError = { code: "42501", message: "permission denied" };

  await assert.rejects(
    () =>
      claimStripeWebhookEvent(fakeSupabase(table), {
        id: "evt_error",
        type: "invoice.payment_failed",
      }),
    (error: any) =>
      error?.code === "42501" && error?.message === "permission denied",
  );
});

test("markStripeWebhookEventProcessed marks the event processed", async () => {
  const table = new FakeWebhookEventsTable();

  await markStripeWebhookEventProcessed(fakeSupabase(table), "evt_done");

  assert.equal(table.updatePayload.status, "processed");
  assert.equal(typeof table.updatePayload.processed_at, "string");
  assert.deepEqual(table.updateFilters, [["stripe_event_id", "evt_done"]]);
});

test("releaseStripeWebhookEventClaim deletes only in-flight processing claims", async () => {
  const table = new FakeWebhookEventsTable();

  await releaseStripeWebhookEventClaim(fakeSupabase(table), "evt_failed");

  assert.deepEqual(table.deleteFilters, [
    ["stripe_event_id", "evt_failed"],
    ["status", "processing"],
  ]);
});
