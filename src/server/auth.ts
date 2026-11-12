import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { sendMailInBackground } from "./email";
import { otpMail } from "./email/templates";

export const OTP_TTL_SECONDS = 600; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;

function build() {
  const e = env();
  return betterAuth({
    appName: "Rethink Medical Data Room",
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: {
        user: schema.user, session: schema.session, account: schema.account,
        verification: schema.verification, twoFactor: schema.twoFactor,
      },
    }),
    // Admin accounts only (recipients never get a password). No self sign-up.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 14, maxPasswordLength: 128 },
    user: {
      additionalFields: { role: { type: "string", input: false, defaultValue: "recipient", required: false } },
    },
    session: {
      expiresIn: 60 * 60 * 12,     // absolute upper bound; per-recipient policy is enforced in authz.ts
      updateAge: 60 * 30,
      cookieCache: { enabled: false }, // every request hits the DB → revocation is immediate
    },
    advanced: {
      cookiePrefix: "rmdr",
      useSecureCookies: e.APP_ENV === "production",
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
    },
    rateLimit: { enabled: true, window: 60, max: 30, storage: "memory" },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_TTL_SECONDS,
        allowedAttempts: OTP_MAX_ATTEMPTS,
        storeOTP: "hashed",
        resendStrategy: "rotate", // a new request invalidates the previous code
        disableSignUp: true,      // only pre-registered recipients
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in") return;
          const r = await db().query.recipients.findFirst({ where: eq(schema.recipients.email, email.toLowerCase()) });
          if (!r) return;
          const m = otpMail(r.locale === "en" ? "en" : "es", otp, OTP_TTL_SECONDS / 60);
          sendMailInBackground({ to: email, ...m });
        },
      }),
      twoFactor({ issuer: "Rethink Medical Data Room", totpOptions: { digits: 6, period: 30 } }),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof build>;
const g = globalThis as unknown as { __drAuth?: Auth };
export function auth(): Auth { return (g.__drAuth ??= build()); }
