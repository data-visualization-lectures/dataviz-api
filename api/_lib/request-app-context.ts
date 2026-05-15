import type { VercelRequest } from "@vercel/node";
import type { AccessibleScope } from "./types.js";

function normalizeStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeHostname(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return normalizeStringValue(url.hostname)?.toLowerCase() ?? null;
  } catch {
    return value.toLowerCase().replace(/:\d+$/, "");
  }
}

function resolveHeaderValue(
  req: VercelRequest,
  headerName: string,
): string | null {
  const value = req.headers[headerName];
  return normalizeStringValue(Array.isArray(value) ? value[0] : value);
}

export function resolveAppNameFromRequest(
  req: VercelRequest,
): string | null {
  const fromHeader = resolveHeaderValue(req, "x-dv-app");
  if (fromHeader) {
    return fromHeader;
  }

  const body = req.body as Record<string, unknown> | null | undefined;
  const fromBody =
    normalizeStringValue(body?.app_name) ??
    normalizeStringValue(body?.appName);
  if (fromBody) {
    return fromBody;
  }

  return normalizeStringValue(req.query.app);
}

function isScopeCompatibleWithHost(
  scope: AccessibleScope,
  hostname: string | null,
): boolean {
  if (!hostname) {
    return false;
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".vercel.app")
  ) {
    return true;
  }

  if (scope === "viz") {
    return hostname === "dataviz.jp" || hostname.endsWith(".dataviz.jp");
  }

  return hostname === "dataprep.jp" || hostname.endsWith(".dataprep.jp");
}

export function resolveServiceScopeFromRequest(
  req: VercelRequest,
): AccessibleScope | null {
  const rawScope = resolveHeaderValue(req, "x-service-scope");
  const scope = rawScope === "viz" || rawScope === "prep" ? rawScope : null;
  if (!scope) {
    return null;
  }

  const hostname =
    normalizeHostname(resolveHeaderValue(req, "origin")) ??
    normalizeHostname(resolveHeaderValue(req, "referer")) ??
    normalizeHostname(resolveHeaderValue(req, "x-forwarded-host")) ??
    normalizeHostname(resolveHeaderValue(req, "host"));

  if (!isScopeCompatibleWithHost(scope, hostname)) {
    return null;
  }

  return scope;
}
