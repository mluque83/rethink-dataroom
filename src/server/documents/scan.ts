import net from "node:net";

export type ScanResult =
  | { status: "clean"; detail: string }
  | { status: "infected"; detail: string }
  | { status: "not_configured"; detail: string }
  | { status: "error"; detail: string };

/** clamd INSTREAM protocol client. Signature freshness must be ensured by freshclam in production. */
export function clamdScan(buf: Buffer, host: string, port: number, timeoutMs = 60_000): Promise<ScanResult> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    let out = "";
    const done = (r: ScanResult) => { sock.destroy(); resolve(r); };
    sock.setTimeout(timeoutMs, () => done({ status: "error", detail: "clamd timeout" }));
    sock.on("error", (e) => done({ status: "error", detail: `clamd unreachable: ${e.message}` }));
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      const CH = 64 * 1024;
      for (let i = 0; i < buf.length; i += CH) {
        const chunk = buf.subarray(i, i + CH);
        const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length);
        sock.write(len); sock.write(chunk);
      }
      sock.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
    });
    sock.on("data", (d) => { out += d.toString("utf8"); });
    sock.on("end", () => {
      const line = out.replace(/\0/g, "").trim();
      if (/:\s*OK$/.test(line)) done({ status: "clean", detail: line });
      else if (/FOUND$/.test(line)) done({ status: "infected", detail: line.replace(/^stream:\s*/, "") });
      else done({ status: "error", detail: line || "empty clamd response" });
    });
  });
}

export async function scanBuffer(buf: Buffer, cfg: { scanner: "none" | "clamav"; host: string; port: number }): Promise<ScanResult> {
  if (cfg.scanner === "none") return { status: "not_configured", detail: "No malware scanner configured — file kept in quarantine" };
  return clamdScan(buf, cfg.host, cfg.port);
}
