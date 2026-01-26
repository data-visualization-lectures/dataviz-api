import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCors } from "./cors.js";

export function handleCorsAndMethods(
  req: VercelRequest,
  res: VercelResponse,
  methods: string[]
): boolean {
  const handled = setCors(req, res);
  if (handled) {
    return true;
  }

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }

  if (!req.method || !methods.includes(req.method)) {
    res.status(405).json({ error: "Method not allowed" });
    return true;
  }

  return false;
}
