import type { VercelRequest } from "@vercel/node";

const SERVICE_APP_ORIGINS = new Set([
  "https://app.dataviz.jp",
  "https://app.dataprep.jp",
]);

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function normalizeOrigin(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAllowedServiceAppOrigin(value: string | null): string | null {
  const origin = normalizeOrigin(value);
  if (!origin || !SERVICE_APP_ORIGINS.has(origin)) {
    return null;
  }
  return origin;
}

export function resolveFrontendBaseUrl(
  req: Pick<VercelRequest, "headers">,
  fallbackBaseUrl: string,
): string {
  const requestOrigin = getAllowedServiceAppOrigin(
    firstHeaderValue(req.headers.origin),
  );
  if (requestOrigin) {
    return requestOrigin;
  }

  const refererOrigin = getAllowedServiceAppOrigin(
    firstHeaderValue(req.headers.referer),
  );
  if (refererOrigin) {
    return refererOrigin;
  }

  return normalizeBaseUrl(fallbackBaseUrl);
}

export function buildFrontendUrl(
  req: Pick<VercelRequest, "headers">,
  fallbackBaseUrl: string,
  path: string,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${resolveFrontendBaseUrl(req, fallbackBaseUrl)}${normalizedPath}`;
}
