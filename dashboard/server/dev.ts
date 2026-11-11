import { spawn } from "node:child_process";
import { join } from "node:path";

// Dev loop: rebuild the web bundle on change and restart the server on change.
const dash = join(import.meta.dirname, "..");
const vite = join(dash, "node_modules", "vite", "bin", "vite.js");
const procs = [
  spawn(process.execPath, [vite, "build", "--watch", "--mode", "development"], { cwd: dash, stdio: "inherit" }),
  spawn(process.execPath, ["--watch-path=server", "server/index.ts"], { cwd: dash, stdio: "inherit" }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
