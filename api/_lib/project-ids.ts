const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function buildProjectJsonPath(userId: string, projectId: string): string {
  return `${userId}/${projectId}.json`;
}

export function buildThumbnailPath(userId: string, projectId: string): string {
  return `${userId}/${projectId}.png`;
}

/**
 * Large-upload saves send back the storage path that /api/projects-upload-url
 * issued. Accept it only when it is exactly the path that endpoint would issue
 * for this user and project.
 */
export function isOwnedProjectJsonPath(params: {
  userId: string;
  projectId: unknown;
  storagePath: unknown;
}): boolean {
  if (!isUuid(params.projectId) || typeof params.storagePath !== "string") {
    return false;
  }

  return (
    params.storagePath === buildProjectJsonPath(params.userId, params.projectId)
  );
}
