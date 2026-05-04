if (process.env.USE_ENV_FILE) {
  const dotenv = await import("dotenv");
  dotenv.config({ path: process.env.USE_ENV_FILE, override: true });
}

import Stripe from "stripe";

import {
  PHASE4_STRIPE_PRICE_DEFINITIONS,
  PHASE4_STRIPE_PRODUCT_DEFINITIONS,
  createPhase4PriceMetadata,
  createPhase4ProductMetadata,
} from "../api/_lib/phase4-stripe-catalog.ts";

const STRIPE_API_VERSION = "2024-06-20" as const;

interface ParsedArgs {
  apply: boolean;
  format: "tsv" | "json";
}

interface CatalogOutputRow {
  product_id: string;
  product_name_en: string;
  stripe_product_id: string;
  price_key: string;
  price_name_en: string;
  lookup_key: string;
  currency: string;
  amount: number;
  stripe_price_id: string;
  status: "planned" | "existing" | "created";
}

function parseArgs(argv: string[]): ParsedArgs {
  const apply = argv.includes("--apply");
  const format = argv.includes("--json") ? "json" : "tsv";
  return { apply, format };
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function createStripeClient(): Stripe {
  return new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
    apiVersion: STRIPE_API_VERSION,
  });
}

async function findExistingProductByProductId(
  stripe: Stripe,
  productId: string,
): Promise<Stripe.Product | null> {
  for await (const product of stripe.products.list({ limit: 100 })) {
    if (product.metadata.product_id === productId) {
      return product;
    }
  }

  return null;
}

async function findExistingPriceByLookupKey(
  stripe: Stripe,
  lookupKey: string,
): Promise<Stripe.Price | null> {
  const activeList = await stripe.prices.list({
    lookup_keys: [lookupKey],
    limit: 1,
  });
  if (activeList.data[0]) {
    return activeList.data[0];
  }

  const inactiveList = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: false,
    limit: 1,
  });
  return inactiveList.data[0] ?? null;
}

async function ensureProduct(
  stripe: Stripe,
  productId: string,
): Promise<{ id: string; status: "existing" | "created" }> {
  const definition = PHASE4_STRIPE_PRODUCT_DEFINITIONS.find(
    (entry) => entry.productId === productId,
  );
  if (!definition) {
    throw new Error(`Unknown productId: ${productId}`);
  }

  const existing = await findExistingProductByProductId(stripe, productId);
  if (existing) {
    return { id: existing.id, status: "existing" };
  }

  const created = await stripe.products.create({
    name: definition.productNameEn,
    metadata: createPhase4ProductMetadata(definition),
  });

  return { id: created.id, status: "created" };
}

async function ensurePrice(
  stripe: Stripe,
  priceKey: string,
  stripeProductId: string,
): Promise<{ id: string; status: "existing" | "created" }> {
  const definition = PHASE4_STRIPE_PRICE_DEFINITIONS.find(
    (entry) => entry.priceKey === priceKey,
  );
  if (!definition) {
    throw new Error(`Unknown priceKey: ${priceKey}`);
  }

  const existing = await findExistingPriceByLookupKey(stripe, definition.lookupKey);
  if (existing) {
    return { id: existing.id, status: "existing" };
  }

  const created = await stripe.prices.create({
    product: stripeProductId,
    currency: definition.currency,
    unit_amount: definition.amount,
    recurring: {
      interval: definition.billingInterval === "monthly" ? "month" : "year",
    },
    lookup_key: definition.lookupKey,
    nickname: definition.priceNameEn,
    metadata: createPhase4PriceMetadata(definition),
  });

  return { id: created.id, status: "created" };
}

function formatRowsAsTsv(rows: readonly CatalogOutputRow[]): string {
  const headers = [
    "product_id",
    "product_name_en",
    "stripe_product_id",
    "price_key",
    "price_name_en",
    "lookup_key",
    "currency",
    "amount",
    "stripe_price_id",
    "status",
  ];

  const lines = [headers.join("\t")];
  for (const row of rows) {
    lines.push(
      [
        row.product_id,
        row.product_name_en,
        row.stripe_product_id,
        row.price_key,
        row.price_name_en,
        row.lookup_key,
        row.currency,
        String(row.amount),
        row.stripe_price_id,
        row.status,
      ].join("\t"),
    );
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.apply) {
    const rows: CatalogOutputRow[] = PHASE4_STRIPE_PRICE_DEFINITIONS.map((definition) => ({
      product_id: definition.productId,
      product_name_en: definition.productNameEn,
      stripe_product_id: "",
      price_key: definition.priceKey,
      price_name_en: definition.priceNameEn,
      lookup_key: definition.lookupKey,
      currency: definition.currency,
      amount: definition.amount,
      stripe_price_id: "",
      status: "planned",
    }));

    process.stdout.write(
      args.format === "json"
        ? `${JSON.stringify(rows, null, 2)}\n`
        : `${formatRowsAsTsv(rows)}\n`,
    );
    return;
  }

  const stripe = createStripeClient();
  const rows: CatalogOutputRow[] = [];

  for (const definition of PHASE4_STRIPE_PRICE_DEFINITIONS) {
    console.error(`Processing ${definition.priceKey}...`);
    const product = await ensureProduct(stripe, definition.productId);
    const price = await ensurePrice(stripe, definition.priceKey, product.id);

    rows.push({
      product_id: definition.productId,
      product_name_en: definition.productNameEn,
      stripe_product_id: product.id,
      price_key: definition.priceKey,
      price_name_en: definition.priceNameEn,
      lookup_key: definition.lookupKey,
      currency: definition.currency,
      amount: definition.amount,
      stripe_price_id: price.id,
      status: price.status === "created" || product.status === "created" ? "created" : "existing",
    });
  }

  process.stdout.write(
    args.format === "json"
      ? `${JSON.stringify(rows, null, 2)}\n`
      : `${formatRowsAsTsv(rows)}\n`,
  );
}

await main();
