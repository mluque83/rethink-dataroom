import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export interface SandboxOpts { mode: "bwrap" | "none"; timeoutSeconds: number; memoryMb: number }

/**
 * Run an untrusted-input tool (LibreOffice, poppler, tesseract) in an
 * isolated process:
 *  - bubblewrap: new user/pid/ipc/uts/NETWORK namespaces (no network),
 *    read-only system dirs, private /tmp, only the job directory writable,
 *    dies with parent;
 *  - prlimit: address-space and CPU-time limits;
 *  - wall-clock timeout with SIGKILL.
 * Output is never interpreted as code; only files in workdir/out are read back.
 */
export async function runSandboxed(cmd: string[], workdir: string, o: SandboxOpts): Promise<{ code: number; stderr: string }> {
  const limits = ["prlimit", `--as=${o.memoryMb * 1024 * 1024}`, `--cpu=${o.timeoutSeconds}`, `--nofile=512`, `--nproc=256`, "--"];
  const ro = ["/usr", "/etc", "/bin", "/lib", "/lib64", "/sbin"];
  const args = o.mode === "bwrap"
    ? [
        "bwrap", "--unshare-all", "--die-with-parent", "--new-session",
        ...ro.flatMap((d) => ["--ro-bind-try", d, d]),
        "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
        "--bind", workdir, "/work", "--chdir", "/work",
        "--clearenv", "--setenv", "TMPDIR", "/tmp",
        "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/work", "--setenv", "LANG", "C.UTF-8",
        "--", ...limits, ...cmd,
      ]
    : [...limits, ...cmd];
  return new Promise((resolve) => {
    const p = spawn(args[0], args.slice(1), {
      cwd: o.mode === "bwrap" ? undefined : workdir,
      env: (o.mode === "bwrap" ? {} : { PATH: "/usr/bin:/bin", HOME: workdir, LANG: "C.UTF-8" }) as NodeJS.ProcessEnv,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    p.stderr.on("data", (d) => { if (stderr.length < 4000) stderr += d.toString(); });
    const t = setTimeout(() => p.kill("SIGKILL"), o.timeoutSeconds * 1000);
    p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? -1, stderr }); });
    p.on("error", (e) => { clearTimeout(t); resolve({ code: -1, stderr: e.message }); });
  });
}

/** Paths inside the sandbox are relative to /work (bwrap) or the workdir (none). */
export const inSandbox = (o: SandboxOpts, workdir: string, rel: string) => (o.mode === "bwrap" ? `/work/${rel}` : path.join(workdir, rel));

export async function makeWorkdir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dr-job-"));
  await fs.chmod(dir, 0o700);
  await fs.mkdir(path.join(dir, "in"));
  await fs.mkdir(path.join(dir, "out"));
  return dir;
}
