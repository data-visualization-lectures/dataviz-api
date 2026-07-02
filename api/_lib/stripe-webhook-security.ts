export function canUseDevWebhookBodyFallback(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!env.USE_ENV_FILE) {
    return false;
  }
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    return false;
  }
  return !!body && typeof body === "object" && !Buffer.isBuffer(body);
}
