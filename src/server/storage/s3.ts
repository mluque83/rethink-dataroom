import {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand,
  ListObjectsV2Command, GetBucketEncryptionCommand, GetPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import type { ObjectStorage } from "./index";
import { assertSafeKey } from "./index";

export interface S3Options {
  bucket: string; region: string; endpoint?: string; forcePathStyle: boolean;
  sse: "AES256" | "aws:kms" | "bucket-default" | "none"; kmsKeyId?: string;
}

/** Private S3-compatible bucket. Objects are written without ACLs and with server-side encryption. */
export class S3Storage implements ObjectStorage {
  readonly kind = "s3" as const;
  private client: S3Client;
  constructor(private o: S3Options) {
    if (!o.bucket) throw new Error("S3_BUCKET is required");
    this.client = new S3Client({ region: o.region, endpoint: o.endpoint, forcePathStyle: o.forcePathStyle });
  }
  async put(key: string, body: Buffer, contentType: string) {
    assertSafeKey(key);
    await this.client.send(new PutObjectCommand({
      Bucket: this.o.bucket, Key: key, Body: body, ContentType: contentType,
      ...(this.o.sse === "none" || this.o.sse === "bucket-default" ? {} : { ServerSideEncryption: this.o.sse }),
      ...(this.o.sse === "aws:kms" && this.o.kmsKeyId ? { SSEKMSKeyId: this.o.kmsKeyId } : {}),
    }));
  }
  async get(key: string) {
    assertSafeKey(key);
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.o.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async exists(key: string) {
    assertSafeKey(key);
    try { await this.client.send(new HeadObjectCommand({ Bucket: this.o.bucket, Key: key })); return true; }
    catch (e: unknown) { if ((e as { name?: string }).name === "NotFound") return false; throw e; }
  }
  async delete(key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.o.bucket, Key: key }));
  }
  async list(prefix: string) {
    const out: string[] = [];
    let token: string | undefined;
    do {
      const r = await this.client.send(new ListObjectsV2Command({ Bucket: this.o.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const c of r.Contents ?? []) if (c.Key) out.push(c.Key);
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out.sort();
  }
  async health() {
    const details: Record<string, string> = { driver: "s3", bucket: this.o.bucket, requestedSSE: this.o.sse };
    let ok = true;
    try {
      const enc = await this.client.send(new GetBucketEncryptionCommand({ Bucket: this.o.bucket }));
      details.defaultEncryption = enc.ServerSideEncryptionConfiguration?.Rules?.map((r) => r.ApplyServerSideEncryptionByDefault?.SSEAlgorithm).join(",") ?? "none";
    } catch { details.defaultEncryption = "unknown/not configured"; if (this.o.sse === "bucket-default") ok = false; }
    try {
      const pab = await this.client.send(new GetPublicAccessBlockCommand({ Bucket: this.o.bucket }));
      const c = pab.PublicAccessBlockConfiguration;
      const all = !!(c?.BlockPublicAcls && c.BlockPublicPolicy && c.IgnorePublicAcls && c.RestrictPublicBuckets);
      details.publicAccessBlock = all ? "all enabled" : "NOT fully enabled";
      if (!all) ok = false;
    } catch { details.publicAccessBlock = "unknown (provider may not support the API)"; }
    return { ok, details };
  }
}
