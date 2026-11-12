import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { env } from "../env";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

/**
 * Private object storage. Keys are always generated server-side
 * (never derived from user-provided file names) and validated.
 * Objects are NEVER exposed through public or pre-signed URLs: every byte
 * reaching a browser is streamed by an authorised route handler.
 */
export interface ObjectStorage {
  readonly kind: "local" | "s3";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  health(): Promise<{ ok: boolean; details: Record<string, string> }>;
}

const KEY_RE = /^(originals|renditions|derived|qa|backup-test)\/[a-z0-9][a-z0-9/_.-]{0,400}$/;
export function assertSafeKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("unsafe storage key");
  }
}

export function newKey(prefix: "originals" | "renditions" | "derived" | "qa", ...parts: string[]) {
  const key = [prefix, ...parts, randomUUID()].join("/");
  assertSafeKey(key);
  return key;
}

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const g = globalThis as unknown as { __drStorage?: ObjectStorage };
export function storage(): ObjectStorage {
  if (!g.__drStorage) {
    const e = env();
    g.__drStorage = e.STORAGE_DRIVER === "s3"
      ? new S3Storage({
          bucket: e.S3_BUCKET!, region: e.S3_REGION, endpoint: e.S3_ENDPOINT || undefined,
          forcePathStyle: e.S3_FORCE_PATH_STYLE, sse: e.S3_SSE, kmsKeyId: e.S3_SSE_KMS_KEY_ID,
        })
      : new LocalStorage(e.STORAGE_LOCAL_DIR);
  }
  return g.__drStorage;
}
/** test hook */
export function setStorageForTests(s: ObjectStorage | undefined) { g.__drStorage = s; }
