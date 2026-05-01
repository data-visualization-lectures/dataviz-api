import test from "node:test";
import assert from "node:assert/strict";
import type { VercelRequest } from "@vercel/node";

import { resolveAppNameFromRequest } from "./request-app-context.ts";

function buildRequest(params: {
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): VercelRequest {
  return {
    headers: params.headers ?? {},
    query: params.query ?? {},
    body: params.body ?? {},
  } as VercelRequest;
}

test("resolveAppNameFromRequest prefers header, then body, then query", () => {
  assert.equal(
    resolveAppNameFromRequest(
      buildRequest({
        headers: { "x-dv-app": "rawgraphs" },
        body: { app_name: "kepler-gl" },
        query: { app: "open-refine" },
      }),
    ),
    "rawgraphs",
  );

  assert.equal(
    resolveAppNameFromRequest(
      buildRequest({
        body: { app_name: "kepler-gl" },
        query: { app: "open-refine" },
      }),
    ),
    "kepler-gl",
  );

  assert.equal(
    resolveAppNameFromRequest(
      buildRequest({
        query: { app: "open-refine" },
      }),
    ),
    "open-refine",
  );
});
