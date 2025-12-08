import type { VercelRequest, VercelResponse } from "@vercel/node";

export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;

  // .dataviz.jp のサブドメイン（または dataviz.jp そのもの）からのアクセスをすべて許可
  // 例: https://auth.dataviz.jp, https://svg-tectures.dataviz.jp
  const isAllowed = origin && (
    origin === "https://dataviz.jp" ||
    origin.endsWith(".dataviz.jp")
  );

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization"
  );
}
