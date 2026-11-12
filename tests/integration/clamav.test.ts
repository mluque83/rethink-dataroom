// clamd protocol client against a REAL clamd (started with a test-only EICAR signature).
import { describe, test, expect } from "vitest";
import { clamdScan } from "@/server/documents/scan";

const port = Number(process.env.CLAMD_TEST_PORT ?? 0);
describe.skipIf(!port)("clamd INSTREAM client", () => {
  test("clean and infected verdicts", async () => {
    const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    expect((await clamdScan(Buffer.from("hello world"), "127.0.0.1", port)).status).toBe("clean");
    const r = await clamdScan(eicar, "127.0.0.1", port);
    expect(r.status).toBe("infected");
  });
  test("unreachable scanner → error (fails closed: file stays in quarantine)", async () => {
    expect((await clamdScan(Buffer.from("x"), "127.0.0.1", 1)).status).toBe("error");
  });
});
