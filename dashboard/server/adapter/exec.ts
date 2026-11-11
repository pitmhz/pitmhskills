import { execFile } from "node:child_process";

export type ExecResult = { code: number; stdout: string; stderr: string; ms: number; timedOut: boolean };

const CAP = 64 * 1024;

// The commands recorded in RECON.md. Nothing else is ever spawned.
export const CMD = {
  router: (task: string, session: string) => ["bun", ["src/cli.ts", "route", task, "--session", session, "--json"]],
  validate: () => ["bun", ["src/cli.ts", "cards", "--check"]],
  rebuild: () => ["bun", ["src/cli.ts", "index"]],
  bench: () => ["bun", ["src/cli.ts", "eval"]],
} as const satisfies Record<string, (...a: string[]) => readonly [string, string[]]>;

/** execFile with an argv array. Never a shell string. Output capped at 64 KB. */
export function run(
  bin: string,
  argv: string[],
  o: { cwd?: string; timeout?: number; maxBuffer?: number } = {},
): Promise<ExecResult> {
  const t0 = Date.now();
  return new Promise((done) => {
    execFile(
      bin,
      argv,
      { cwd: o.cwd, timeout: o.timeout ?? 60_000, maxBuffer: o.maxBuffer ?? 8 * 1024 * 1024, windowsHide: true, shell: false },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
        const code = e ? (typeof e.code === "number" ? e.code : 1) : 0;
        done({
          code,
          stdout: String(stdout).slice(0, o.maxBuffer ? undefined : CAP),
          stderr: String(stderr).slice(0, CAP) || (e && typeof e.code === "string" ? e.message : ""),
          ms: Date.now() - t0,
          timedOut: Boolean(e?.killed),
        });
      },
    );
  });
}

export async function runCmd(spec: readonly [string, string[]], cwd: string, timeout?: number) {
  return run(spec[0], spec[1], { cwd, timeout });
}
