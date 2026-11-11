import { existsSync } from "node:fs";
import { join } from "node:path";
import { CARDS_DIR, ROOT, hasGit } from "./repo.ts";
import { discoverSchema } from "./schema.ts";
import { loadCards } from "./skills.ts";
import { MANDATE_MODE } from "./mandate.ts";

export type Flag =
  | "HAS_ROUTER" | "HAS_JSON_OUTPUT" | "HAS_ABSTAIN" | "HAS_CARDS" | "HAS_TIERS" | "HAS_CLUSTERS" | "HAS_PROVENANCE"
  | "HAS_BLOCKLIST" | "HAS_REBUILD" | "HAS_VALIDATE" | "HAS_BENCH" | "HAS_MANDATE_GEN" | "HAS_GIT";

const cli = join(ROOT, "src", "cli.ts");

/** Flags proven in RECON.md. File-existence checks are re-run live; behavior flags are recorded evidence. */
export function flags(): Record<Flag, boolean> {
  const hasCli = existsSync(cli);
  const cards = existsSync(CARDS_DIR) ? loadCards() : [];
  return {
    HAS_ROUTER: hasCli,
    HAS_JSON_OUTPUT: hasCli, // `route ... --json` added in S0 (RECON)
    HAS_ABSTAIN: hasCli, // "wordpress theme development" -> ABSTAIN (RECON)
    HAS_CARDS: cards.length > 0,
    HAS_TIERS: cards.length > 0 && cards.every((c) => typeof c.tier === "string"),
    HAS_CLUSTERS: cards.some((c) => typeof c.cluster === "string" && c.cluster !== ""),
    HAS_PROVENANCE: cards.some((c) => Array.isArray(c.origin) && c.origin.length > 0),
    HAS_BLOCKLIST: false, // blocklists live per target repo in .pitmhskills/profile.json; none at root (RECON)
    HAS_REBUILD: hasCli,
    HAS_VALIDATE: hasCli,
    HAS_BENCH: hasCli && existsSync(join(ROOT, "evals", "golden.yaml")),
    HAS_MANDATE_GEN: false, // `init` prints a mandate but writes no agent file (RECON)
    HAS_GIT: hasGit(),
  };
}

export function capabilities() {
  const cards = loadCards();
  return {
    flags: flags(),
    slice_key: "domain",
    slices: [...new Set(cards.map((c) => String(c.domain)))].sort(),
    schema: discoverSchema(cards),
    mandate_mode: MANDATE_MODE,
    router_cmd: ["bun", "src/cli.ts", "route", "<task>", "--json"],
  };
}
