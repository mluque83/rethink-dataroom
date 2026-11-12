import type { Metadata } from "next";
import { connection } from "next/server";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/bebas-neue/400.css";
import "./globals.css";

// Every page is rendered per request: required for per-request CSP nonces and to
// guarantee no confidential output is prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rethink Medical — Data room",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection(); // opt every route into request-time rendering (CSP nonce, no prerender)
  return (
    <html lang="es">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
