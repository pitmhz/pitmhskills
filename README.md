# pitmhskills — deterministic skill router for AI agents

One service collects `SKILL.md` files from many providers, compiles each into a small
routing card, and exposes one decision: `route(task)` returns exactly one skill
(or a sequenced plan of single skills), one clarifying question, or ABSTAIN.
The executor model never sees the library, never picks a skill, never loads more
than one skill body at a time.

- **Token discipline:** ~60-token always-on mandate, ≤3KB routed body, ≤2KB
  mandatory guards, ≤23KB per task (vs 56KB naive baseline).
- **No manual `/skill` picking.** A hook or MCP call routes before the model acts.
- **Quality is mechanical:** routing eval, byte caps, lint/type/test gates, and an
  AI-slop scanner run in the harness — never self-reported by the model.
- **Stack:** Bun + TypeScript, one SQLite file. Zero dependencies.

## Quickstart (fresh clone, for humans and agents)

```sh
git clone <this-repo> && cd pitmhskills
bun install
bun src/cli.ts ingest        # fetch pinned skill sources into skills/ (gitignored)
bun src/cli.ts cards         # compile routing cards
bun src/cli.ts index         # build pitmhskills.db (gitignored, rebuildable)
bun src/cli.ts route "your task"
bun src/cli.ts eval          # routing accuracy gates (tune + heldout + parsers)
bun test tests/*.test.ts     # unit suite (scoped: bare `bun test` fans out into vendor skills/*/tests)
```

Useful next steps: `bun src/cli.ts init` (repo profile + mandatory skills),
`bun src/cli.ts add owner/repo` (register a new source), `bun src/cli.ts run "<task>"`
(harness-built phased prompt), `bun src/cli.ts cover` (Tier-A self-route coverage),
`bun src/cli.ts doctor` (install-health audit, read-only), `bun src/cli.ts diagnose "<task>"`
(routing trace: gate drops → retrieval ranks → collapse winners → scores),
`bun src/cli.ts learn [--apply]` (usage-driven rerank proposals, eval-gated),
`bun src/serve.ts` (MCP server: route/get_ref/phase_done/plan).

## How routing works

`signals` (repo stack detection, no LLM) → `gate` (tier/license/blocks) →
`retrieve` (FTS5 BM25 + vector cosine, RRF hybrid) → `collapse` (one candidate per
cluster) → `decide` (calibrated floor/margin → PICK / ASK / ABSTAIN) → `deliver`
(byte-capped body + scope fence + slop fence).

### Authoring do_not_use_when

`do_not_use_when` lines gate in `src/gate.ts`: a card is dropped only if EVERY
word (len > 3) of one line appears as an exact token in the task. Substring does
not count (`typo` never matches `typography`; `page` never matches `pages`).
Keep each line to 2-3 distinctive words. Never write `(use X)` pointers — their
words never co-occur with the rest of the line, so the line can never fire.
Put boundary statements in the card's `disambiguator` field instead (shown on
ASK, never gated).
Fires: `"Bot-protected page"` drops the card on a bot-protected-page task
(`bot` + `protected` + `page` all match).
Never fires: `"Fixing typos and spelling mistakes in documentation (use code-review)"`
— all seven long words must co-occur, so it never drops anything.
Tier C cards are user-invoked-only and never enter the route pool (see `src/gate.ts` tier-C freeze; mirrors Agent Skills `disable-model-invocation`).
Staged skills get spec frontmatter via `specFrontmatter(card)` in `src/cardtext.ts`: card `use_when[0..2]` maps to `when_to_use` on staging.

### Verify commands

Cards carry `verify: string[]`, run as gates at `phase_done` (`src/gates.ts`:
shell `execSync`, nonzero exit fails the phase). Prefer the `rtk` 0.50.0 winner
per output class (see `evals/token-benchmark.md`; rtk wins every measurable
class 6x–2500x, `--ultra-compact` inert, never stack compressors):

- test output → `rtk test -- <cmd>` (failures-only; exit code still signals
  pass; passing-test console noise stripped, counts kept).
- logs → `rtk log` (800 lines → 23; severity counts kept, order lost).
- recursive grep → `rtk rg`, not `rtk grep` (`grep` binary absent on Windows;
  totals/paths intact, long lines truncated).
- diffs → `rtk diff` for "what changed" only; keep raw `git diff` whenever the
  output must apply as a patch (rtk drops context/hunk headers).
- large JSON → `rtk json` for schema/shape questions only; keep raw output for
  name enumeration (rtk collapses rows, per-row names lost).
- directory listings → native commands (`rtk ls` broken on Windows).

Edited verify cards are marked `curated: true` so template rebuilds keep the
convention (builder never overwrites curated cards; upstream drift is reported
stale for human re-review instead).
Fresh template cards ship schema-conformant on first build: `cluster` defaults
to `domain` (`cluster_role: primary`), `sections[]` backfilled from `##`/`###`
headings, `license: UNKNOWN` until the stamp step resolves it, `curated: false`,
and empty-but-present `disambiguator`/`pick_over_primary_when`/`pairs_with`/
`conflicts_with`/`keywords` defaults (`add` prints per-card empties after build).

### Tier-A ladder (B→A promotion gate; candidates only, never mass-promoted)

1. Schema fields: Tier A needs non-empty `use_when` + `do_not_use_when`
   (enforced by `CardSchema` in `src/types.ts`; check `bun src/cli.ts cards --check`).
2. Golden coverage: the card must self-route from its own `use_when[0]`
   (enforced by `bun src/cli.ts cover`).
3. Usage signals: frequent PICKs, low ASKs, disambiguator present when
   ASK-heavy (ranked read-only by `promoteCandidates` in `src/learn.ts`,
   surfaced through the `learn` flow; UNKNOWN license blocks).
4. Approval: human + eval-gated — `learn --apply` refuses on any tune drop.

### Card schema (what each field group does)

Cards are compiled metadata, not skill text — agents decide on cards (~1–2KB),
bodies load only after the pick (≤3KB). Field groups:

- **Identity/provenance:** `id` (`<source>__<name>`), `tier` (A/B/C), `origin`
  (repo@sha), `license`, `hash` (source sha256), `skill_path`, `curated`
  (hand-touched text the builder never overwrites; drift reported stale).
- **Routing text (indexed):** `purpose`, `use_when` (+ mined vendor triggers),
  `do_not_use_when` (gate), `domain`, `task_types`, `keywords` (heading terms).
- **Differentiation:** `cluster`/`cluster_role`/`pick_over_primary_when`
  (one candidate per cluster; predicate-hit variant wins), `disambiguator`
  (ASK questions), `requires` (stack/files), `conflicts_with` (rival edges —
  derived by `rivals.ts`, proposed not hand-written), `pairs_with` (combo
  guard delivered alongside the pick — mined from `route_logs` by `combos.ts`).
- **Delivery:** `scope` (fence), `verify[]` (phase gates), `sections[]`
  (per-`##`-section name/bytes/trigger words → `SECTIONS:`/`MORE:` map header
  inside the byte cap), `body_tokens`/`core_bytes` (budget inputs).

Derived edges (rivals, combos, teaches-graph) are computed at index/route time,
proposed through eval-gated flows, and never enter agent context.

### Tests

`tests/*.test.ts` (bun:test, 83 tests): collapse/decide/gate/cardtext/retrieve/
mandate/rivals/combos/diagnose, including the recorded traps (help/helper,
typo/typography, edge-cases prose). Run scoped — `bun test tests/*.test.ts` —
because bare `bun test` also collects pre-existing vendor `skills/*/tests`
trees (unrelated upstream failures, out of scope). Commit-worthy: tests cover
first-party harness code only, no secrets, no fixtures outside the repo.

## Repo layout

```
AGENTS.md            # the only file agents preload (~60 tokens)
sources.yaml         # pinned skill upstreams (repo@sha, never branches)
cards/               # routing cards: the committed source of truth
skills/              # raw checkouts (gitignored, rebuilt by ingest)
evals/               # golden sets (tune + held-out) + slop patterns + benchmark notes
src/                 # 32 modules, each <=200 lines, zero deps
tests/               # unit suite (first-party harness only; run scoped)
hooks/               # prompt-hook scripts for agent clients
```

## Skills and licensing

Raw skill files belong to their vendors and are **not** committed here (`skills/`
is gitignored). Committed `cards/` carry only short routing metadata for skills
whose licenses allow local use (MIT/Apache-2.0 recorded per card). Skills without
a recorded license are excluded from this repo — `ingest` fetches them into your
local copy on demand; see `sources.yaml` and `bun src/cli.ts add owner/repo`.

## License

Harness code: MIT (see LICENSE). Skills: see each card's `license` field and the
vendor repositories in `sources.yaml`.
