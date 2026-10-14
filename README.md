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
bun src/cli.ts eval          # routing accuracy gates
```

Useful next steps: `bun src/cli.ts init` (repo profile + mandatory skills),
`bun src/cli.ts add owner/repo` (register a new source), `bun src/cli.ts run "<task>"`
(harness-built phased prompt), `bun src/serve.ts` (MCP server: route/get_ref/phase_done).

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

## Repo layout

```
AGENTS.md            # the only file agents preload (~60 tokens)
sources.yaml         # pinned skill upstreams (repo@sha, never branches)
cards/               # routing cards: the committed source of truth
skills/              # raw checkouts (gitignored, rebuilt by ingest)
evals/               # golden sets (tune + held-out) + slop patterns
src/                 # 27 modules, each <=200 lines, zero deps
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
