import type { VercelRequest } from "@vercel/node";

function normalizeStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveAppNameFromRequest(
  req: VercelRequest,
): string | null {
  const headerValue = req.headers["x-dv-app"];
  const fromHeader = normalizeStringValue(
    Array.isArray(headerValue) ? headerValue[0] : headerValue,
  );
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
