import { createHash } from "node:crypto";
import { logger } from "./logger.js";

type Ga4EventParameter = string | number | boolean;

type Ga4Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SendGa4EventParams = {
  clientSeed: string;
  name: string;
  params?: Record<string, Ga4EventParameter>;
  timestampMicros?: number;
};

type SendGa4EventOptions = {
  measurementId?: string;
  apiSecret?: string;
  fetchImpl?: Ga4Fetch;
};

export function createServerClientId(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  return `${digest.readUInt32BE(0)}.${digest.readUInt32BE(4)}`;
}

export async function sendGa4Event(
  event: SendGa4EventParams,
  options: SendGa4EventOptions = {},
): Promise<boolean> {
  const measurementId =
    options.measurementId ?? process.env.GA4_MEASUREMENT_ID?.trim();
  const apiSecret = options.apiSecret ?? process.env.GA4_API_SECRET?.trim();

  if (!measurementId || !apiSecret) {
    logger.warn("GA4 Measurement Protocol is not configured", {
      eventName: event.name,
      missingMeasurementId: !measurementId,
      missingApiSecret: !apiSecret,
    });
    return false;
  }

  const endpoint = new URL("https://www.google-analytics.com/mp/collect");
  endpoint.searchParams.set("measurement_id", measurementId);
  endpoint.searchParams.set("api_secret", apiSecret);

  const payload = {
    client_id: createServerClientId(event.clientSeed),
    ...(event.timestampMicros
      ? { timestamp_micros: event.timestampMicros }
      : {}),
    events: [
      {
        name: event.name,
        ...(event.params ? { params: event.params } : {}),
      },
    ],
  };

  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`ga4_measurement_protocol_failed:${response.status}`);
  }

  return true;
}
