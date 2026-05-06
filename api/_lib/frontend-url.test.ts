import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFrontendUrl,
  getAllowedServiceAppOrigin,
  resolveFrontendBaseUrl,
} from "./frontend-url.ts";

function mockReq(headers: Record<string, string | undefined>) {
  return { headers };
}

test("getAllowedServiceAppOrigin accepts only service app origins", () => {
  assert.equal(
    getAllowedServiceAppOrigin("https://app.dataviz.jp/account"),
    "https://app.dataviz.jp",
  );
  assert.equal(
    getAllowedServiceAppOrigin("https://app.dataprep.jp/projects"),
    "https://app.dataprep.jp",
  );
  assert.equal(getAllowedServiceAppOrigin("https://www.dataviz.jp/pricing/"), null);
  assert.equal(getAllowedServiceAppOrigin("https://evil.example.com"), null);
  assert.equal(getAllowedServiceAppOrigin("/account"), null);
});

test("resolveFrontendBaseUrl prefers the service Origin header", () => {
  assert.equal(
    resolveFrontendBaseUrl(
      mockReq({ origin: "https://app.dataprep.jp" }),
      "https://app.dataviz.jp",
    ),
    "https://app.dataprep.jp",
  );
});

test("resolveFrontendBaseUrl falls back to service Referer when Origin is missing", () => {
  assert.equal(
    resolveFrontendBaseUrl(
      mockReq({ referer: "https://app.dataprep.jp/account" }),
      "https://app.dataviz.jp",
    ),
    "https://app.dataprep.jp",
  );
});

test("resolveFrontendBaseUrl ignores unrelated origins and normalizes fallback", () => {
  assert.equal(
    resolveFrontendBaseUrl(
      mockReq({ origin: "https://example.com", referer: "https://www.dataprep.jp/" }),
      "https://app.dataviz.jp/",
    ),
    "https://app.dataviz.jp",
  );
});

test("buildFrontendUrl builds service-aware return paths", () => {
  assert.equal(
    buildFrontendUrl(
      mockReq({ origin: "https://app.dataprep.jp" }),
      "https://app.dataviz.jp",
      "/billing/success",
    ),
    "https://app.dataprep.jp/billing/success",
  );
  assert.equal(
    buildFrontendUrl(
      mockReq({ origin: "https://app.dataviz.jp" }),
      "https://app.dataviz.jp",
      "account",
    ),
    "https://app.dataviz.jp/account",
  );
});
