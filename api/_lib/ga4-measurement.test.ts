import test from "node:test";
import assert from "node:assert/strict";

import {
  createServerClientId,
  sendGa4Event,
} from "./ga4-measurement.ts";

test("createServerClientId is stable and does not expose the source id", () => {
  const first = createServerClientId("stripe-subscription:sub_123");
  const second = createServerClientId("stripe-subscription:sub_123");

  assert.equal(first, second);
  assert.match(first, /^\d+\.\d+$/);
  assert.doesNotMatch(first, /sub_123/);
});

test("sendGa4Event posts a Measurement Protocol web event", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  const sent = await sendGa4Event(
    {
      clientSeed: "stripe-subscription:sub_123",
      name: "subscription_canceled",
      timestampMicros: 1_750_000_000_000_000,
      params: {
        plan: "bundle_monthly_jpy",
        reason: "too_expensive",
        cancellation_mode: "scheduled",
      },
    },
    {
      measurementId: "G-TEST123",
      apiSecret: "test-secret",
      fetchImpl: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(sent, true);
  const url = new URL(requestUrl);
  assert.equal(url.origin + url.pathname, "https://www.google-analytics.com/mp/collect");
  assert.equal(url.searchParams.get("measurement_id"), "G-TEST123");
  assert.equal(url.searchParams.get("api_secret"), "test-secret");
  assert.equal(requestInit?.method, "POST");

  const body = JSON.parse(String(requestInit?.body));
  assert.match(body.client_id, /^\d+\.\d+$/);
  assert.equal(body.timestamp_micros, 1_750_000_000_000_000);
  assert.deepEqual(body.events, [
    {
      name: "subscription_canceled",
      params: {
        plan: "bundle_monthly_jpy",
        reason: "too_expensive",
        cancellation_mode: "scheduled",
      },
    },
  ]);
});

test("sendGa4Event skips safely when server credentials are absent", async () => {
  let fetchCalled = false;

  const sent = await sendGa4Event(
    {
      clientSeed: "stripe-subscription:sub_123",
      name: "subscription_canceled",
    },
    {
      measurementId: "",
      apiSecret: "",
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(sent, false);
  assert.equal(fetchCalled, false);
});

test("sendGa4Event rejects non-success responses", async () => {
  await assert.rejects(
    sendGa4Event(
      {
        clientSeed: "stripe-subscription:sub_123",
        name: "subscription_canceled",
      },
      {
        measurementId: "G-TEST123",
        apiSecret: "test-secret",
        fetchImpl: async () => new Response(null, { status: 500 }),
      },
    ),
    /ga4_measurement_protocol_failed:500/,
  );
});
