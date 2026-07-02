import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { logger } from "./logger.js";

const PROCESSED_WEBHOOK_EVENTS_TABLE = "processed_webhook_events";
const UNIQUE_VIOLATION_CODE = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE
  );
}

export async function claimStripeWebhookEvent(
  supabaseAdmin: SupabaseClient,
  event: Pick<Stripe.Event, "id" | "type">,
): Promise<boolean> {
  if (!event.id) {
    throw new Error("stripe_event_missing_id");
  }

  const { error } = await supabaseAdmin
    .from(PROCESSED_WEBHOOK_EVENTS_TABLE)
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      status: "processing",
    });

  if (!error) {
    return true;
  }

  if (isUniqueViolation(error)) {
    logger.info("Duplicate Stripe webhook event skipped", {
      eventId: event.id,
      eventType: event.type,
    });
    return false;
  }

  logger.error("Stripe webhook event claim failed", error as Error, {
    eventId: event.id,
    eventType: event.type,
  });
  throw error;
}

export async function markStripeWebhookEventProcessed(
  supabaseAdmin: SupabaseClient,
  eventId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(PROCESSED_WEBHOOK_EVENTS_TABLE)
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
    })
    .eq("stripe_event_id", eventId);

  if (error) {
    logger.error("Stripe webhook event processed mark failed", error as Error, {
      eventId,
    });
    throw error;
  }
}

export async function releaseStripeWebhookEventClaim(
  supabaseAdmin: SupabaseClient,
  eventId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(PROCESSED_WEBHOOK_EVENTS_TABLE)
    .delete()
    .eq("stripe_event_id", eventId)
    .eq("status", "processing");

  if (error) {
    logger.error("Stripe webhook event claim release failed", error as Error, {
      eventId,
    });
  }
}
