// S3 driver against a real S3-compatible server (moto) — runs only if S3_TEST_ENDPOINT is set.
import { describe, test, expect } from "vitest";
import { S3Client, CreateBucketCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { S3Storage } from "@/server/storage/s3";

const endpoint = process.env.S3_TEST_ENDPOINT;
describe.skipIf(!endpoint)("S3 storage driver", () => {
  test("put/get/list/delete with server-side encryption requested", async () => {
    process.env.AWS_ACCESS_KEY_ID ??= "test"; process.env.AWS_SECRET_ACCESS_KEY ??= "test";
    const bucket = `dr-test-${Date.now()}`;
    const c = new S3Client({ region: "eu-west-1", endpoint, forcePathStyle: true });
    await c.send(new CreateBucketCommand({ Bucket: bucket, CreateBucketConfiguration: { LocationConstraint: "eu-west-1" } }));
    const s = new S3Storage({ bucket, region: "eu-west-1", endpoint, forcePathStyle: true, sse: "AES256" });
    await s.put("originals/a/b", Buffer.from("hello"), "text/plain");
    expect((await s.get("originals/a/b")).toString()).toBe("hello");
    expect(await s.list("originals/")).toEqual(["originals/a/b"]);
    const head = await c.send(new HeadObjectCommand({ Bucket: bucket, Key: "originals/a/b" }));
    expect(head.ServerSideEncryption).toBe("AES256");
    await expect(s.put("../escape", Buffer.from("x"), "text/plain")).rejects.toThrow();
    await s.delete("originals/a/b");
    expect(await s.exists("originals/a/b")).toBe(false);
  });
});
