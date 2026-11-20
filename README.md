# pitmhskills — deterministic skill router for AI agents

## Project Name and Description

pitmhskills is a deterministic skill router. One service collects `SKILL.md` files
from many providers, compiles each into a small routing card, and answers one
question: which skill should this agent use for this task?

The executor model never sees the library, never picks a skill by name, and
loads at most one skill body at a time. A hook or MCP call routes before the
model acts. Routing is arithmetic, not a model opinion.

`route(task)` returns a `PICK`, an `ASK`, or an `ABSTAIN`. A contested task can
be handed to a council of readers. Multi-phase work is split by `plan()` into a
sequence of single-skill phases.

## Key Features

- **Token discipline.** `AGENTS.md` is about 10 lines. The generated mandate is
  capped at 600 bytes (`src/mandate.ts`). A routed body is capped at 3000 bytes
  (`src/deliver.ts`). A paired guard is capped at 1800 bytes. Per-task byte
  budget is 20480 bytes in `config.json`.
- **No manual `/skill` picking.** The router decides before the model acts.
- **Mechanical quality.** Routing eval, byte caps, card schema checks, unit
  tests, and an AI-slop scanner run in the harness. Nothing is self-reported.
- **Contested-task council.** Close candidates go to readers, not to a guess.
  One skill wins. Silence is a dropped verdict.
- **Session lock.** One active skill per phase. A different pick while locked
  is returned with `must_delegate: true` so the harness forces a phase close.
- **Local and offline after install.** One SQLite file. No LLM or API calls on
  the hot path.

## Getting Started

```sh
git clone <this-repo> && cd pitmhskills
bun install
bun src/cli.ts ingest        # fetch pinned skill sources into skills/ (gitignored)
bun src/cli.ts cards         # compile routing cards
bun src/cli.ts index         # build pitmhskills.db (gitignored, rebuildable)
bun src/cli.ts route "your task"
bun src/cli.ts eval          # routing gates: tune, heldout, verbose, parsers
bun test ./tests/            # scoped unit suite (see Testing)
```

Useful next steps:

```sh
bun src/cli.ts init                    # repo profile + mandatory skills
bun src/cli.ts add owner/repo           # register a new source
bun src/cli.ts run "<task>"             # harness-built phased prompt
bun src/cli.ts cover                    # Tier-A self-route coverage
bun src/cli.ts doctor                   # install-health audit, read-only
bun src/cli.ts diagnose "<task>"        # routing trace
bun src/cli.ts learn [--apply]          # usage-driven rerank proposals
bun src/cli.ts council "<task>"         # open a council for a contested task
bun src/serve.ts                        # MCP server
```

MCP tools: `route`, `council`, `note`, `compose`, `plan`, `get_ref`, `phase_done`.

## Project Architecture

### Offline build

```
sources.yaml (repo@sha pins)
   -> ingest  -> skills/       (gitignored vendor checkouts)
   -> cards   -> cards/*.json  (committed routing metadata)
   -> index   -> pitmhskills.db (FTS5 + 512-dim vectors, rebuildable)
```

### Hot path

`src/route.ts` runs this chain. No LLM is involved.

```
detectSignals(cwd)      stack detection, no LLM
   -> hardFilter        tier gate, requires, do_not_use_when, profile blocks
   -> retrieveWith      BM25 + vector recall, score_pool 40, corpus-wide IDF
   -> shortlist         near-duplicate collapse, category cap, cluster arbitration
   -> scoreCandidates   BM25 0.45, cover 0.4, vec 0.05, intent clause as extra signal
   -> decide            floor 45, margin 15 -> PICK / ASK / ABSTAIN
   -> deliver           byte-capped body, STYLE fence, SECTIONS / MORE header
   -> session lock      PICK only: one active skill per phase
```

Scoring is IDF-weighted. A card matching only common words ("page", "form",
"build") does not outrank a card matching a rare word, and a long request does
not dilute itself into ABSTAIN.

**Two thresholds, one margin.** `decide` uses a floor and a margin, not an
absolute pick score. `PICK` means the leader clears the floor and beats the
runner-up by the margin. `ASK` means the floor is met but two cards are close.
`ABSTAIN` means nothing clears the floor, or the leader is not a leader.
`pick_floor: 80` only marks a strong contest in the reason; it is not a gate.
`ask_min_margin: 3` stops near-ties from wasting a user turn.

**Two queries, one for retrieval and one for scoring.** Retrieval keeps only
words the corpus holds, so an unseen word cannot take a query slot from a word
that matches. Scoring keeps unseen words, so a card that only partly answers
is penalised. Set `match_trim` in `config.json` to switch the retrieval rule.
Measurements live in `docs/audit/metrics.md`.

**The intent clause.** A long request states intent first and context after.
The whole-prompt cover treats both as one bag of words, so a long request
dilutes itself. `src/intent.ts` extracts the first sentence; `src/scoring.ts`
scores it as a separate signal, never a gate.

**Delivery.** `src/deliver.ts` keeps the core text, then adds task-relevant
sections until the 3000-byte cap is reached. It emits a `SECTIONS:` header for
what was kept and a `MORE:` header pointing to `get_ref`. The STYLE fence comes
from `evals/slop-patterns.json`.

### Council sub-flow

The deterministic router finds the right neighbourhood but not always the last
mile. When three skills score 70/66/61, that is a judgement.

```
council(task, cwd) -> { id, candidates, plan, plan_batches }
   -> one specialist brief per candidate, plus a critic brief
   -> briefs are chunked into batches of max 3, processed in order
   -> one subagent per brief reads ONE skill and writes a verdict with note()
   -> compose(id) -> { skill_id, brief, dissent }
```

Verdicts are `keep`, `drop`, or `merge`. A candidate with no verdict is
dropped. Deliberations expire after 30 minutes; notes live in `.state/council/`
so another process can write without contention. Quoted evidence is the quality
signal. The council never returns more than one skill body.

### Harness sub-flow

`phase_done()` reads the active skill, runs its `verify[]` commands through
`execSync`, runs the slop scan on `touched_files`, records usage, and clears the
lock. Without `touched_files` the slop scan reports a hint instead of a real
result. `src/harness.ts` denies direct reads of any `SKILL.md`; `get_ref` is the
sanctioned body fetch.

## Technology Stack

- Bun 1.4.2, TypeScript, one SQLite file via Bun's built-in client.
- Runtime packages: `@modelcontextprotocol/sdk` 1.12.0, `js-yaml` 4.1.0, `zod` 3.25.76.
- Dev dependency: `@types/bun`.
- No LLM, vector database, or external service on the hot path.

## Project Structure

```
AGENTS.md            about 10 lines; the only file agents preload
sources.yaml         pinned skill upstreams (repo@sha, never branches)
cards/               routing cards: the committed source of truth
skills/              raw checkouts (gitignored, rebuilt by ingest)
evals/               golden sets (tune, heldout, verbose) + slop patterns + benchmarks
src/                 router modules (200-line cap; see Known gate status)
tests/               unit suite (first-party harness only, run scoped)
hooks/               prompt-hook scripts for agent clients
skill-router/        canonical skill-router body, deployed to every client
harness-manifest.json  read-deny rules for agent read tools
pitmhskills.db       derived index (gitignored, rebuilt by index)
```

## Development Workflow

1. Edit `cards/*.json` for routing text, or `src/*.ts` for engine behaviour.
2. Run `bun src/cli.ts cards --check` for schema and stale-hash checks.
3. Run `bun test ./tests/`.
4. Run `bun src/cli.ts eval` before changing routing weights.
5. Use `bun src/cli.ts learn` for read-only rerank proposals; `learn --apply`
   refuses on any tune drop.
6. Rebuild the index with `bun src/cli.ts index` after card changes. It is
   gitignored, so a stale local DB can make tests fail until rebuilt.

## Coding Standards

- Match with tokens, not substrings. `typo` must not match `typography`;
  `page` must not match `pages`.
- Keep `do_not_use_when` lines to 2–3 distinctive words. Every word longer than
  three characters must appear as an exact token for the gate to fire. Put
  boundary statements in `disambiguator` instead.
- Tier C cards are user-invoked only and never enter the route pool.
- Card `license` must be recorded. Cards with `license: UNKNOWN` are not
  committed; `ingest` fetches those skills locally on demand.
- Edited cards carry `curated: true`. Template rebuilds never overwrite them;
  upstream drift is reported stale for human review.
- Keep modules at or under 200 lines and write plain words. No corporate
  buzzwords or AI-slop patterns.

## Testing

```sh
bun test ./tests/
```

That runs the scoped first-party suite: 95 tests across 10 files. Bare
`bun test` also collects pre-existing vendor `skills/*/tests` trees, which are
unrelated upstream failures. The Windows shell treats `bun test tests/*.test.ts`
as a filter and fails, so use `./tests/`.

Routing gates:

```sh
bun src/cli.ts cards --check
bun src/cli.ts cover
bun src/cli.ts eval
```

### Known gate status

Current worktree state, recorded at the last release:

- `cards --check`: 2175 ok, 1 stale SHA on `local__tldraw-offline.json`. That
  card is tracked and unmodified; the failure predates this work.
- `eval`: 4 routing mismatches remain (heldout, verbose, and two false picks).
- Module cap: `src/scoring.ts` is 215 lines and `src/retrieve.ts` is 203 lines.
  Both exceed the 200-line standard.

These were accepted at push time. They are not regressions introduced by the
README.

## Authoring cards

Tier A promotion is staged, never mass-applied:

1. Schema: non-empty `use_when` and `do_not_use_when`, checked by `CardSchema`.
2. Golden coverage: the card self-routes from its own `use_when[0]`.
3. Usage signals: frequent PICKs, low ASKs, a disambiguator when ASK-heavy.
   An UNKNOWN license blocks promotion.
4. Approval: human review and eval-gated `learn --apply`.

Card field groups: identity (`id`, `tier`, `origin`, `license`, `hash`,
`skill_path`, `curated`), routing text (`purpose`, `use_when`,
`do_not_use_when`, `domain`, `task_types`, `keywords`), differentiation
(`cluster`, `pick_over_primary_when`, `disambiguator`, `requires`,
`conflicts_with`, `pairs_with`), delivery (`scope`, `verify`, `sections`,
`body_tokens`, `core_bytes`). Derived edges for rivals, combos, and the
teaches-graph are computed at index or route time and never enter agent context.

## Contributing

- Keep changes scoped. `cards/` is the committed source of truth; `skills/` is
  never committed.
- Source verify commands from the card's `verify[]` list. Prefer `rtk` per
  output class; see `evals/token-benchmark.md`. Use `rtk test -- <cmd>` for test
  output, `rtk log` for logs, `rtk rg` for recursive grep, `rtk diff` only for
  "what changed", and native commands for directory listings on Windows.
- Keep raw `git diff` when output must apply as a patch, and raw `rtk json`
  output only for schema questions.
- Run the full gate chain before proposing a change. Do not bypass hooks.

## License

Harness code: MIT (see `LICENSE`). Skills: see each card's `license` field and
the vendor repositories in `sources.yaml`.
