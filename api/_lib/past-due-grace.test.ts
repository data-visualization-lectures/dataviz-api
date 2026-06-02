import test from "node:test";
import assert from "node:assert/strict";

import {
  computePastDueGraceUntil,
  hasActiveSubscriptionAccess,
  isPastDueWithinGrace,
  resolvePastDueGraceUntilForUpsert,
} from "./past-due-grace.ts";

test("computePastDueGraceUntil returns event creation plus seven days", () => {
  assert.equal(
    computePastDueGraceUntil(Date.parse("2026-06-01T00:00:00.000Z") / 1000),
    "2026-06-08T00:00:00.000Z",
  );
});

test("past_due access is allowed only while grace is active", () => {
  const now = new Date("2026-06-02T00:00:00.000Z");

  assert.equal(
    isPastDueWithinGrace(
      { status: "past_due", past_due_grace_until: "2026-06-08T00:00:00.000Z" },
      now,
    ),
    true,
  );
  assert.equal(
    isPastDueWithinGrace(
      { status: "past_due", past_due_grace_until: "2026-06-01T00:00:00.000Z" },
      now,
    ),
    false,
  );
  assert.equal(
    isPastDueWithinGrace({ status: "past_due", past_due_grace_until: null }, now),
    false,
  );
});

test("active subscription access includes active, trialing, and graced past_due", () => {
  const now = new Date("2026-06-02T00:00:00.000Z");

  assert.equal(hasActiveSubscriptionAccess({ status: "active" }, now), true);
  assert.equal(hasActiveSubscriptionAccess({ status: "trialing" }, now), true);
  assert.equal(
    hasActiveSubscriptionAccess(
      { status: "past_due", past_due_grace_until: "2026-06-08T00:00:00.000Z" },
      now,
    ),
    true,
  );
  assert.equal(
    hasActiveSubscriptionAccess(
      { status: "past_due", past_due_grace_until: "2026-06-01T00:00:00.000Z" },
      now,
    ),
    false,
  );
});

test("past_due grace upsert policy sets once, preserves retries, and clears after recovery", () => {
  assert.equal(
    resolvePastDueGraceUntilForUpsert({
      status: "past_due",
      candidatePastDueGraceUntil: "2026-06-08T00:00:00.000Z",
    }),
    "2026-06-08T00:00:00.000Z",
  );
  assert.equal(
    resolvePastDueGraceUntilForUpsert({
      status: "past_due",
      existingPastDueGraceUntil: "2026-06-08T00:00:00.000Z",
      candidatePastDueGraceUntil: "2026-06-10T00:00:00.000Z",
    }),
    "2026-06-08T00:00:00.000Z",
  );
  assert.equal(
    resolvePastDueGraceUntilForUpsert({ status: "active" }),
    null,
  );
  assert.equal(
    resolvePastDueGraceUntilForUpsert({ status: undefined }),
    undefined,
  );
});
