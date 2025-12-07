import type { VercelResponse } from "@vercel/node";

export function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "https://auth.dataviz.jp");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization"
  );
}
