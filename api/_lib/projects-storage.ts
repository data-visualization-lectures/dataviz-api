import { Buffer } from "node:buffer";
import { supabaseAdmin } from "./supabase.js";

const STORAGE_BUCKET = "user_projects";

export function buildProjectJsonPath(userId: string, projectId: string): string {
  return `${userId}/${projectId}.json`;
}

export function buildThumbnailPath(userId: string, projectId: string): string {
  return `${userId}/${projectId}.png`;
}

export async function uploadProjectJson(
  storagePath: string,
  data: unknown,
  upsert: boolean
): Promise<{ error: unknown | null }> {
  const buffer = Buffer.from(JSON.stringify(data));
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/json",
      upsert,
    });

  return { error };
}

export async function downloadProjectJson(
  storagePath: string
): Promise<{ data: unknown | null; error: Error | null; parseError: boolean }> {
  const { data: fileData, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(storagePath);

  if (error) {
    return { data: null, error, parseError: false };
  }

  const text = await fileData.text();
  try {
    return { data: JSON.parse(text), error: null, parseError: false };
  } catch (err) {
    return { data: null, error: err as Error, parseError: true };
  }
}

export async function uploadThumbnail(
  thumbnail: string,
  storagePath: string,
  upsert: boolean
): Promise<{ path: string; error: Error | null }> {
  try {
    const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, imageBuffer, {
        contentType: "image/png",
        upsert,
      });

    return { path: storagePath, error: error ?? null };
  } catch (err) {
    return { path: storagePath, error: err as Error };
  }
}

export async function removeProjectFiles(paths: string[]): Promise<{ error: unknown | null }> {
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .remove(paths);

  return { error };
}
