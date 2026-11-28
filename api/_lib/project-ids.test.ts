import test from "node:test";
import assert from "node:assert/strict";

import { isOwnedProjectJsonPath, isUuid } from "./project-ids.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

test("isUuid accepts UUIDs and rejects other values", () => {
  assert.equal(isUuid(PROJECT_ID), true);
  assert.equal(isUuid(PROJECT_ID.toUpperCase()), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(`${PROJECT_ID}/x`), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(123), false);
});

test("isOwnedProjectJsonPath accepts the path issued for the user and project", () => {
  assert.equal(
    isOwnedProjectJsonPath({
      userId: USER_ID,
      projectId: PROJECT_ID,
      storagePath: `${USER_ID}/${PROJECT_ID}.json`,
    }),
    true,
  );
});

test("isOwnedProjectJsonPath rejects another user's path", () => {
  assert.equal(
    isOwnedProjectJsonPath({
      userId: USER_ID,
      projectId: PROJECT_ID,
      storagePath: `${OTHER_USER_ID}/${PROJECT_ID}.json`,
    }),
    false,
  );
});

test("isOwnedProjectJsonPath rejects a path for a different project", () => {
  assert.equal(
    isOwnedProjectJsonPath({
      userId: USER_ID,
      projectId: PROJECT_ID,
      storagePath: `${USER_ID}/44444444-4444-4444-8444-444444444444.json`,
    }),
    false,
  );
});

test("isOwnedProjectJsonPath rejects thumbnails, traversal and malformed input", () => {
  for (const storagePath of [
    `${USER_ID}/${PROJECT_ID}.png`,
    `${USER_ID}/../${OTHER_USER_ID}/${PROJECT_ID}.json`,
    `/${USER_ID}/${PROJECT_ID}.json`,
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(
      isOwnedProjectJsonPath({ userId: USER_ID, projectId: PROJECT_ID, storagePath }),
      false,
      String(storagePath),
    );
  }

  assert.equal(
    isOwnedProjectJsonPath({
      userId: USER_ID,
      projectId: "../x",
      storagePath: `${USER_ID}/../x.json`,
    }),
    false,
  );
});
