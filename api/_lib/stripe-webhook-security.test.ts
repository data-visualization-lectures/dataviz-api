import test from "node:test";
import assert from "node:assert/strict";

import { canUseDevWebhookBodyFallback } from "./stripe-webhook-security.ts";

test("dev webhook body fallback is allowed only for local env-file runs", () => {
  assert.equal(
    canUseDevWebhookBodyFallback(
      { id: "evt_local" },
      { USE_ENV_FILE: ".env.test", NODE_ENV: "development" },
    ),
    true,
  );
});

test("dev webhook body fallback is disabled in production", () => {
  assert.equal(
    canUseDevWebhookBodyFallback(
      { id: "evt_prod" },
      { USE_ENV_FILE: ".env.local", NODE_ENV: "production" },
    ),
    false,
  );
  assert.equal(
    canUseDevWebhookBodyFallback(
      { id: "evt_vercel_prod" },
      { USE_ENV_FILE: ".env.local", NODE_ENV: "development", VERCEL_ENV: "production" },
    ),
    false,
  );
});

test("dev webhook body fallback rejects missing or non-object bodies", () => {
  assert.equal(
    canUseDevWebhookBodyFallback(null, {
      USE_ENV_FILE: ".env.test",
      NODE_ENV: "development",
    }),
    false,
  );
  assert.equal(
    canUseDevWebhookBodyFallback("evt_text", {
      USE_ENV_FILE: ".env.test",
      NODE_ENV: "development",
    }),
    false,
  );
  assert.equal(
    canUseDevWebhookBodyFallback(Buffer.from("{}"), {
      USE_ENV_FILE: ".env.test",
      NODE_ENV: "development",
    }),
    false,
  );
});
