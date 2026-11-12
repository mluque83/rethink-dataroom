import "server-only";
import { z } from "zod";

const bool = z.enum(["true", "false"]).default("false").transform((v) => v === "true");

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  APP_TIMEZONE: z.string().default("Europe/Madrid"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
  LOG_HMAC_KEY: z.string().min(16),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.local/storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("eu-west-1"),
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  S3_SSE: z.enum(["AES256", "aws:kms", "bucket-default", "none"]).default("AES256"),
  S3_SSE_KMS_KEY_ID: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["dev", "smtp"]).default("dev"),
  EMAIL_FROM: z.string().default("Rethink Medical Data Room <dataroom@example.invalid>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: bool,
  SCANNER: z.enum(["none", "clamav"]).default("none"),
  CLAMD_HOST: z.string().default("127.0.0.1"),
  CLAMD_PORT: z.coerce.number().default(3310),
  DEV_ALLOW_UNSCANNED_RELEASE: bool,
  CONVERTER_SANDBOX: z.enum(["bwrap", "none"]).default("bwrap"),
  CONVERTER_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(900).default(120),
  CONVERTER_MEMORY_MB: z.coerce.number().int().min(256).max(8192).default(1536),
  UPLOAD_MAX_MB: z.coerce.number().int().min(1).max(1024).default(100),
  STORAGE_QUOTA_GB: z.coerce.number().min(0.1).default(20),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Only variable NAMES are reported, never values.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid configuration: ${names}`);
  }
  const env = parsed.data;
  if (env.APP_ENV === "production") {
    const problems: string[] = [];
    if (env.STORAGE_DRIVER !== "s3") problems.push("STORAGE_DRIVER must be s3 in production");
    if (env.EMAIL_PROVIDER === "dev") problems.push("EMAIL_PROVIDER=dev is not allowed in production");
    if (!env.APP_URL.startsWith("https://")) problems.push("APP_URL must use https in production");
    if (env.CONVERTER_SANDBOX !== "bwrap") problems.push("CONVERTER_SANDBOX must be bwrap in production");
    if (env.S3_SSE === "none") problems.push("S3_SSE must enable encryption at rest in production");
    if (problems.length) throw new Error(`Unsafe production configuration: ${problems.join("; ")}`);
    env.DEV_ALLOW_UNSCANNED_RELEASE = false;
  }
  return env;
}

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= load());
}
export const isProduction = () => env().APP_ENV === "production";
