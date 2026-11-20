# Integration audit - 2026-11-10

Audit of `src/` in `C:\Users\Mattchine\pitmhskills` (Bun + SQLite deterministic skill router).
Scope: every module in `src/`, the seam between modules, error handling, and one end-to-end
integration test (`tests/integration.test.ts`).

Method: every claim below was read from the source and, where noted, measured with a live
probe against the real DB and the real card corpus (2176 cards, 76 sources).

- Counts: **51 reachable**, **12 script** (standalone entry points), **1 test-only module**
  (`combos.ts`), **0 dead modules** - but **36 dead exported symbols** and **1 whole dead
  module** (`harness.ts`). See section 1.
- Card fields written but never read by any consumer: **7** (section 4).
- `config.json` keys never read: **4** (section 5).
- Bugs: **12** (section 8). Highest severity: **P1 x 4**.
- Integration test: **8 pass / 0 fail**, 61 assertions, ~18 s.

`src/` grew from 58 to 64 files during this audit: another agent added `src/audit-render.ts`,
`src/audit-report.ts`, `src/audit-views.ts`, `src/bench.ts`, `src/bench-report.ts` and
`src/sweep-fail.ts` changed shape. They are listed for completeness.

No `src/` file was modified by this audit. Only `docs/integration-audit-2026-11-10.md` and
`tests/integration.test.ts` were added.

---

## 1. Module inventory

`src/` holds 64 `.ts` files (58 at the start of the audit; another agent added
`src/audit-render.ts`, `src/audit-report.ts`, `src/audit-views.ts`, `src/bench.ts` and
`src/bench-report.ts` while it ran). They are listed for completeness.

Reachability rule used (computed, not guessed - see the appendix):

- **reachable** - imported transitively by `src/cli.ts` (CLI entry) or `src/serve.ts`
  (MCP entry). 51 modules.
- **script** - a standalone entry point run by `bun src/<file>.ts`; no src module imports it
  and it has no `import.meta.main` guard (it runs on import) or does. 12 modules.
- **test-only module** - no src importer; only `tests/*.ts` imports it. 1 module
  (`combos.ts`).
- **dead module** - no importer at all, in src or in tests. **0 modules by that rule**, but
  `harness.ts` is dead in practice: nothing imports it and no test covers it, so it is
  listed under dead code in section 2.

| File | Purpose | Status | Called by |
|---|---|---|---|
| `add.ts` | Register a source, ingest it, build cards + index, probe routing | reachable | `cli.ts` (`add`) |
| `analytics.ts` | Write `skill_offers` / `skill_usage` rows; re-export aggregate | reachable | `cli.ts`, `route.ts`, `serve.ts` |
| `analytics-agg.ts` | Aggregate offers + usage into accept/reject/latency stats | reachable | `analytics.ts`, `analytics-report.ts` |
| `analytics-report.ts` | Format an `Aggregate` as plain text | reachable | `analytics-agg.ts` |
| `audit-render.ts` | Render the audit document (strings only) | script | `audit-report.ts` |
| `audit-report.ts` | Write/check `docs/audit/*` from `findings.json` | script | (CLI entry) |
| `audit-views.ts` | Long markdown pages for the audit document | script | `audit-render.ts` |
| `bench.ts` | Long-corpus bench harness (determinism + metrics) | script | (CLI entry) |
| `bench-report.ts` | Metrics and text output for the bench harness | script | `bench.ts` |
| `calibrate.ts` | Fit `floor`/`margin` on the tune set, write `config.json` | reachable | `cli.ts` (`calibrate`) |
| `card.ts` | Build `cards/*.json` from raw `SKILL.md`; derive Card v2 fields | reachable | `cli.ts` (`cards`), `add.ts`, `eval-parsers.ts` |
| `cardtext.ts` | Pure text derivation: slug, domain, task types, keywords, sections | reachable | `card.ts` |
| `cli.ts` | CLI dispatcher: ingest/cards/index/route/run/council/note/compose/eval/cover/calibrate/learn/init/add/doctor/diagnose/analytics | reachable | (CLI entry) |
| `cli-council.ts` | CLI surface of the council: open / note / compose | reachable | `cli.ts` |
| `collapse.ts` | Shortlist: dedup, per-cluster cap, variant claim test | reachable | `route.ts`, `council.ts`, `diagnose.ts`, `init.ts`, `scoring.ts` |
| `combos.ts` | Derive A->B phase-sequence pairs from route logs; apply to `pairs_with` | **test-only** | `tests/combos.test.ts` only |
| `council.ts` | Council lifecycle: shortlist, spawn plan, `recordNote` | reachable | `serve.ts` (council/note), `cli-council.ts` |
| `council-briefs.ts` | Prompts for the specialist and critic subagents | reachable | `council.ts` |
| `council-compose.ts` | Merge verdicts into one decision + one brief | reachable | `serve.ts` (compose), `cli-council.ts` |
| `council-store.ts` | Council temp memory: sqlite rows + `.state/council/` file drop | reachable | `council.ts`, `council-compose.ts`, `council-types.ts`, `route.ts`, `serve.ts` |
| `council-types.ts` | Shapes exchanged by the council | reachable | `council.ts`, `council-compose.ts` |
| `db.ts` | Open the sqlite DB, schema + migrations, `cardFromRow`, `loadConfig` | reachable | 22 modules |
| `decide.ts` | `scoreCandidates` wrapper + `decide` (PICK/ASK/ABSTAIN) + ask question | reachable | `route.ts`, `council.ts`, `diagnose.ts`, `init.ts` |
| `deliver.ts` | Byte-capped body + style fence + scope fence + paired guard | reachable | `route.ts`, `council.ts`, `council-compose.ts`, `cli.ts`, `taskeval.ts` |
| `diagnose-components.ts` | Per-candidate component table for the diagnose trace | reachable | `diagnose.ts` |
| `diagnose.ts` | Read-only routing trace (gate/retrieval/collapse/decision/sections/teaches) | reachable | `cli.ts` (`diagnose`) |
| `disambiguator.ts` | Parse `<situation> -> this` into positive/negative clauses | reachable | `collapse.ts`, `scoring.ts` |
| `doctor.ts` | Install-health audit; always exit 0 | reachable | `cli.ts` (`doctor`) |
| `eval.ts` | Golden-set scoring: tune/heldout/verbose/paraphrase/adversarial/coverage/parsers | reachable | `cli.ts` (`eval`, `cover`), `doctor.ts`, `calibrate.ts` |
| `eval-parsers.ts` | Frontmatter parser golden cases | reachable | `eval.ts` |
| `gate.ts` | Hard filter: tier C, `requires`, `do_not_use_when`, profile block | reachable | `route.ts`, `council.ts`, `diagnose.ts`, `init.ts` |
| `gates.ts` | Run verify commands; build the executor prompt; slop gate | reachable | `cli.ts` (run), `serve.ts` (phase_done) |
| `grill.ts` | Build init questions and apply a grill answer to the profile | reachable | `init.ts` |
| `harness.ts` | Manifest check for agent file reads (`checkHarnessManifest`) | **dead** | nobody (`AGENTS.md:9` names it, no code calls it) |
| `index.ts` | Rebuild `pitmhskills.db` from `cards/*.json`; `checkCards`; `shaFile` | reachable | `cli.ts` (`index`, `cards --check`), `doctor.ts`, `card.ts`, `add.ts` |
| `ingest.ts` | Fetch pinned source repos into `skills/`; `loadSources` | reachable | `cli.ts` (`ingest`), `card.ts`, `doctor.ts`, `add.ts` |
| `init.ts` | Create/refresh the repo profile; propose mandatory pins | reachable | `cli.ts` (`init`) |
| `learn.ts` | Usage summary, boost proposals, promotion candidates; re-export rivals | reachable | `cli.ts` (`learn`), `doctor.ts` |
| `lexicon-stats.ts` | Corpus df/IDF lexicon, cached by corpus fingerprint | reachable | `route.ts`, `council.ts`, `decide.ts`, `diagnose.ts`, `init.ts`, `retrieve.ts`, `scoring.ts` |
| `lexicon-synonyms.ts` | Domain synonym groups (data only) | reachable | `lexicon.ts` |
| `lexicon.ts` | Tokenizer, stemmer, stopwords, synonyms, `cardText` | reachable | `collapse.ts`, `deliver.ts`, `disambiguator.ts`, `lexicon-stats.ts`, `retrieve.ts`, `scoring.ts`, `text-match.ts` |
| `mandate.ts` | Build the session mandate; distill a paired skill to a guard | reachable | `deliver.ts`, `init.ts` |
| `mcp-smoke.ts` | Spawn the MCP server and call its tools over stdio | script | (CLI entry) |
| `plan.ts` | `detectPhases` -> ordered single-skill phases | reachable | `cli.ts` (`run`), `serve.ts` (`plan`) |
| `profile.ts` | Repo profile schema, load/save, validation | reachable | 11 modules |
| `retrieve-cache.ts` | Card list + stored vectors, cached by `dbKey` | reachable | `retrieve.ts` |
| `retrieve.ts` | Hybrid retrieval: FTS5 BM25 + hashed-vector cosine, `embed`, `trimToRarest` | reachable | 17 modules |
| `rivals.ts` | Derive implicit rivals; apply `conflicts_with` edges | **test-only** | `tests/rivals.test.ts` only (`learn.ts:121` re-exports it, no caller) |
| `route.ts` | The router: filter -> retrieve -> collapse -> score -> decide -> deliver -> lock | reachable | `cli.ts`, `serve.ts`, `plan.ts`, `eval.ts`, `learn.ts`, `calibrate.ts`, `bench.ts`, `taskeval.ts`, `add.ts` |
| `scoring.ts` | Raw signals (weight-independent) + weight application + ranking | reachable | `decide.ts`, `diagnose.ts`, `diagnose-components.ts`, sweeps |
| `scoring-types.ts` | `ScoreSignals` / `ScoredCandidate` shapes | reachable | `scoring.ts` |
| `serve-ref.ts` | `get_ref`: one section by name, or a file inside the skill dir | reachable | `serve.ts` (`get_ref`) |
| `serve.ts` | MCP stdio server: route, council, note, compose, plan, get_ref, phase_done | reachable | (MCP entry) |
| `session.ts` | Session lock file (`.state/<id>.json`): lock, phase, retries | reachable | `route.ts`, `serve.ts` |
| `signals.ts` | Detect repo stack + files from `cwd` | reachable | `route.ts`, `council.ts`, `diagnose.ts`, `init.ts` |
| `slop.ts` | Slop pattern scanner over touched files | reachable | `gates.ts` (static), `serve.ts` (dynamic import) |
| `sweep.ts` | Weight sweep over the tune/heldout/verbose sets | script | (CLI entry) |
| `sweep-cover.ts` | Coverage sweep: which Tier-A card fails to self-route | script | (CLI entry) |
| `sweep-fail.ts` | Failure sweep: print the component table for each miss | script | (CLI entry) |
| `sync-router.ts` | Deploy the canonical `skill-router/SKILL.md` to every consumer | script | (CLI entry) |
| `taskeval.ts` | Prepare/score a task in a scratch repo (observes, never tunes) | script | (CLI entry) |
| `text-match.ts` | Clause coverage + longest meaningful run | reachable | `scoring.ts` |
| `types.ts` | `Card` / `Signals` / `RankedCard` / `RouteResult` + zod schema | reachable | 27 modules |
| `weights.ts` | Weight set + score-shaping constants | reachable | `route.ts`, `council.ts`, `scoring.ts`, `decide.ts`, `diagnose.ts` |

**Counts: 51 reachable, 12 script, 1 test-only module (`combos.ts`), 0 dead modules by the
importer rule.**

"test-only module" - `combos.ts` is imported only by `tests/combos.test.ts`; nothing in `src/`
calls it and `cli.ts` has no `combos` command.

`harness.ts` is the one module that is dead in practice: it has no importer in `src/` and no
test, so it is unreachable from every CLI command and MCP tool. It is listed under dead code
in section 2.

The following modules are **reachable** but have **exports that only tests call** - the module
is on the production path, the symbol is not:
`cardtext.ts` (`guessDomain`, `specFrontmatter`), `collapse.ts` (`claimsTask`),
`lexicon-stats.ts` (`buildLexicon`), `mandate.ts` (`MANDATE_CAP`), `retrieve.ts` (`VEC_DIM`),
`rivals.ts` (`deriveRivalries`), `combos.ts` (`deriveCombos`, `applyCombos`).

Fully dead symbols (never called from src or tests): **36**, listed in section 2.

---

## 2. Dead code list

A symbol is dead when it is exported and never referenced outside its own file and the test
suite. File:line is the export site.

| File:line | Symbol | Why it is dead |
|---|---|---|
| `src/harness.ts:26` | `checkHarnessManifest` | The manifest checker. `AGENTS.md:9` says the harness denies `**/SKILL.md` reads through it, but no module imports `harness.ts`. The `hooks/` scripts call `bun src/cli.ts route` only. The whole module is unreachable from any CLI command or MCP tool. |
| `src/harness.ts:9` | `logDeny` | Only called by `checkHarnessManifest` (`harness.ts:31`), which is itself dead. Writes a `DENY` row to `route_logs`; the table currently holds 2 such rows from an older build. |
| `src/combos.ts:54` | `proposeCombos` | Read-only "which A->B pairs should be paired" derivation. Never called by `cli.ts` (the file has no CLI command) nor by any test. `deriveCombos` (the pure part) is test-only. |
| `src/learn.ts:147` | `promoteCandidates` | Tier-A promotion candidate list. No CLI command calls it; `cli.ts:126-158` (`learn`) calls `proposeRerank`, `boostSuggestions`, `backupProfileToTmp`, `applyPreferredBoosts` only. |
| `src/learn.ts:133` | `scorePromotion` | Only called by `promoteCandidates` (`learn.ts:169`), which is dead. |
| `src/lexicon-stats.ts:90` | `invalidateLexicon` | The lexicon cache is keyed by a corpus fingerprint (`lexicon-stats.ts:74`) and self-invalidates; the manual invalidator is never called. The one case that needs it - a card edited in place without a count change - is not covered (see BUG-09). |
| `src/lexicon.ts:110` | `expandCompounds` | Returns `[]` always (`lexicon.ts:111`). Its doc comment says compound identifiers are already handled by `tokenize()`, so the function is a stub that was never removed. |
| `src/lexicon.ts:153` | `routingText` | "Everything about a card that says WHEN to use it." `cardText` (`lexicon.ts:148`) and `scoring.ts:81` build their own haystacks; this third variant is never used. |
| `src/session.ts:35` | `getSessionPhase` | Read-only phase counter. `route.ts` uses `getSession(...).active_skill` instead; `phaseDone` increments `phase` directly. |
| `src/session.ts:39` | `recordRetry` | Retry counter. `Session.retries` is written here and reset at `session.ts:30`, but nothing ever calls `recordRetry`, so `retries` is always 0. |
| `src/types.ts:163` | `checkGoalCoverage` | "Goal coverage warnings (non-fatal)." `card.ts:16` returns a `goalCoverage` counter but nothing calls this function; `doctor.ts:120` counts empty goals by re-reading `cards/*.json` instead. |
| `src/db.ts:138` | `dbExists` | "Does the DB file exist." Nothing calls it; `openDb` uses `create: true` so the file is made on demand. |
| `src/retrieve.ts:102` | `retrieve` | Legacy 5-arg wrapper around `retrieveWith`. Every caller uses `retrieveWith` (`route.ts:69`, `council.ts:55`, `diagnose.ts:178`, `init.ts:39`, sweeps). |
| `src/deliver.ts:42` | `styleFence` | The style fence builder. Exported, but `loadBody` calls it internally (`deliver.ts:78`); no other module imports it. |
| `src/council-store.ts:74` | `dirFor` | Exported but only used inside `council-store.ts` (`council-store.ts:144`, `:157`). |
| `src/council-store.ts:123` | `pruneDeliberation` | Exported but only called by `pruneExpired` (`council-store.ts:139`). |
| `src/council.ts:31` | `councilId` | Exported but only called inside `council.ts` (`council.ts:72`). |
| `src/route.ts:165` | `pickPair` | Exported but only called inside `route.ts` (`route.ts:144`). |
| `src/db.ts:14` | `dbPath` | Exported but only called inside `db.ts` (`db.ts:21`). |
| `src/analytics.ts:42` | `taskHash` | Exported but only called inside `analytics.ts` (`analytics.ts:64`). |
| `src/profile.ts:64,65,66,73` | `MandatoryPinSchema`, `PreferredBoostSchema`, `GrillAnswerSchema`, `RepoProfileSchema` | Exported but only used to compose `RepoProfileSchema` inside `profile.ts` (`profile.ts:73-84`). |
| `src/profile.ts:41` | `PROFILE_NAME` | Exported but only used inside `profile.ts` (`profile.ts:44`). |
| `src/init.ts:46` | `proposeMandatory` | Exported but only called inside `init.ts` (`init.ts:93`). |
| `src/eval.ts:20,28,38,43` | `loadGolden`, `loadFrontend`, `loadParaphrase`, `loadAdversarial` | Exported but only called inside `eval.ts` (`eval.ts:135-139`). `loadHeldout` (`eval.ts:24`) is the same shape and also internal. |
| `src/slop.ts:11,46` | `loadPatterns`, `scanText` | Exported but only used inside `slop.ts` (`slop.ts:93`, `:112`) and by the `import.meta.main` demo block. |
| `src/taskeval.ts:28,46,58` | `prepareTask`, `scoreDiff`, `loadTasks` | Exported but only used inside `taskeval.ts`'s `import.meta.main` block (`taskeval.ts:79`). |
| `src/sync-router.ts:33` | `syncSkillRouter` | Exported but only called inside `sync-router.ts`'s `import.meta.main` block (`sync-router.ts:58`). |
| `src/card.ts:122` | `deriveGoals` | Exported but only called inside `card.ts` (`card.ts:53`, `:58`, `:169`). |
| `src/card.ts:152` | `summarizeCard` | Exported and never called anywhere, including tests. Wraps `deriveGoals` for a `Partial<Card>`; `card.ts:169` inlines the same call. |
| `src/card.ts:155` | `templateCard` | Exported but only called inside `card.ts` (`card.ts:48`, `:58`). |
| `src/cardtext.ts:30` | `PROVIDER_DOMAINS` | Exported but only used inside `cardtext.ts` (`cardtext.ts:54`). |
| `src/audit-render.ts` | `summarise`, `renderReadme`, `renderCsv` | Exported but only used inside `audit-render.ts`. |
| `src/audit-report.ts:19` | `loadDoc` | Exported but only used inside `audit-report.ts`. |
| `src/bench-report.ts` | `rowFor`, `bucketOf` | Exported but only used inside `bench-report.ts`. |

**Dead count: 1 whole module (`harness.ts`) + 36 exported symbols** that are never called from
`src/` or `tests/`. Separately, 9 exported symbols are called only from `tests/`
(`deriveCombos`, `applyCombos`, `deriveRivalries`, `guessDomain`, `specFrontmatter`,
`claimsTask`, `buildLexicon`, `MANDATE_CAP`, `VEC_DIM`) - test-only, not dead.

---

## 3. Computed-but-unused values

Values produced by one module and dropped on the floor. These are the seams where the parts do
not blend.

| File:line | Value | Who should read it |
|---|---|---|
| `src/route.ts:85,122,150` | `recordOffer(...)` | Written on every route call **even when `log:false`**. `doLog` (`route.ts:33`) guards only the `route_logs` insert (`route.ts:79,121,149`), not the `skill_offers` insert. Measured: one `routeWith(..., {log:false})` call added exactly 1 `skill_offers` row and 0 `route_logs` rows. The `log` flag does not do what its name says, so the eval and bench harnesses pollute the analytics table they are supposed to measure from. One `bun src/cli.ts eval` run adds 173 `route_logs` rows and 438 `skill_offers` rows. |
| `src/route.ts:83` | `near` (top-3 candidates) | Written into `candidates` and `council_hint` with **no floor filter**. Measured: the task `"asdf qwer zxcv"` returns `ABSTAIN` with `confidence: 2` and `candidates` scoring 2, 2 and 1, yet `council_hint` says "close candidates exist". A card 22 points below the floor is not close. The same task passed to `council()` returns **0 candidates and an empty spawn plan** (`council.ts:60` filters at `max(20, floor*0.5)`), so the hint points at a council that has nothing to do. |
| `src/route.ts:89` | `proceedBare` | `proceedBare = near.length === 0 && abstainConf < floor * 0.5`. `near` is never empty (the A/B pool always yields at least one scored card), so **`proceed_bare_allowed` is always `false`**. The `AGENTS.md:9` contract "Proceed bare only when `proceed_bare_allowed==true`" is therefore a dead branch: the harness can never proceed bare, not even on a total miss. |
| `src/route.ts:128` | `locked` | Initialised `true` and only reassigned inside `if (doLock && d.top)` (`route.ts:131`). With `lock:false` the caller gets `locked: true` although no lock was taken. The MCP `route` tool (`serve.ts:45`) uses the default `route()`, which locks, so the field is correct there - but every `routeWith` caller with `lock:false` (`eval.ts:74,114`, `learn.ts:166`, `calibrate.ts:19`, `bench.ts:64`, `taskeval.ts:29`) reads a value that does not describe what happened. |
| `src/route.ts:41` | `o.weights` | The spread order is `{...DEFAULT_WEIGHTS, ...o.weights, ...cfg.weights}`. `config.json` always has a `weights` object, so **`cfg.weights` always wins and the caller's `weights` option is ignored**. Measured: passing `weights: {bm25: 0.99, cover: 0.01, ...}` produced a byte-identical result to the default. `routeWith` advertises a `weights` option (`route.ts:29`) that has no effect. The same bug is in `council.ts:41` (`opts.weights`) and `diagnose.ts:180` (config-only, no override offered). |
| `src/route.ts:144` | `partner` (from `pickPair`) | Only 1 of 2176 cards has `pairs_with` set (`ponytail__ponytail -> pocock__code-review`). The ponytail auto-pair path (`route.ts:172-175`) needs `profile.ponytail_mode` to be `"full"` or `"ultra"`, and `ponytail_mode` is never set by `init.ts` (`profile.ts:115` `blankProfile` omits it) nor by `grill.ts`. The paired-guard delivery path is reachable only when a user hand-writes the profile. |
| `src/collapse.ts:126` | `Shortlist.unclaimed` | Pushed at `collapse.ts:173`, returned at `collapse.ts:181`, read by **nobody**. `route.ts:73`, `council.ts:56`, `diagnose.ts:181`, `init.ts:40` all use `.kept` only. |
| `src/collapse.ts:122` | `Shortlist.capped` | Returned, read only by `tests/collapse.test.ts:30`. No production consumer. |
| `src/collapse.ts:124` | `Shortlist.deduped` | Returned, read only by `tests/collapse.test.ts:19`. No production consumer. |
| `src/collapse.ts:163-174` | `enforceClaims` branch | `enforceClaims` is never `true` in production. `collapse.ts:143-150` documents that the claim rule measured *worse* (tune 97.8 vs 98.9) and was therefore not enforced - but the `claimants` set is still computed on every shortlist call (`collapse.ts:160`), so `claimsTask` runs for every variant on every route and the result is thrown away. |
| `src/collapse.ts:85-99` | `primaryDefaults` | Computes a set of cluster-primary ids, consumed by `scoring.ts:77` into `primaryBonus`, which is multiplied by `PRIMARY_DEFAULT_BONUS = 0` (`weights.ts:98`). The whole signal is dead by design, but the computation still runs on every candidate on every route. |
| `src/scoring.ts:153` | `variantPenalty` | `variant_unclaimed: 0` in `config.json`, so `scoring.ts:183` subtracts 0. Computed per candidate, never applied. |
| `src/scoring.ts:154` | `rareHit` | `rare_match: 0` in `config.json`, so `scoring.ts:184` adds 0. Computed per candidate, never applied. |
| `src/scoring.ts:191` | `ScoredCandidate.predicate` | Set to `s.predBonus > 0`. No reader. `diagnose-components.ts:15` prints `d.predBonus` from `detail` instead. |
| `src/scoring.ts:114` | `ScoreSignals.bm` | Computed at `scoring.ts:114` and stored on the signal object, then **recomputed** at `scoring.ts:176` from `s.bm25`. The stored `bm` is never read. |
| `src/scouncil-types.ts:47` | `ShortlistEntry.matched` | Written at `council.ts:63`. `council-briefs.ts` uses `entry.card`, `entry.score`, `entry.reason` - never `entry.matched`. |
| `src/council.ts:87` | `persisted[].reason` | Persisted into `deliberations.candidates`. `council-compose.ts:61` parses it back into `PersistedCandidate.reason` (`council-store.ts:46`) and never uses it. Only `id` and `score` are read (`council-compose.ts:82`). |
| `src/council-compose.ts:92` | `scoreOf` for unknown skills | `for (const n of notes) if (!scoreOf.has(n.skill_id)) scoreOf.set(n.skill_id, 0)` - any note for a skill outside the persisted candidate list gets score 0, so it sorts last among survivors. Combined with `council-compose.ts:85-91` this is the "re-score missing entries" fallback: it calls `councilShortlist` again (`council-compose.ts:87`), re-running the whole filter/retrieve/collapse/score pipeline a second time inside compose. |
| `src/council-compose.ts:160-161` | `notedCandidates` / `isIncomplete` | `isIncomplete` counts only notes whose `skill_id` is in `candidateIds` (`council-compose.ts:160`). A note for a skill outside the candidate list is recorded (`council.ts:175` returns `ok: true`) but does not count, so compose reports `incomplete: true` with `0 of 4 have verdicts` while having a valid decision. Measured: recording a `keep` for `local__cavemem` (not a candidate) yields `ok: true, skill_id: local__cavemem, incomplete: true, message: "incomplete: 0 of 4 have verdicts; decided local__cavemem"`. |
| `src/council-compose.ts:141` | `main` from `survivors.find(keep)` | A `__critic__` note with verdict `keep` becomes a survivor. `byId.get("__critic__")` is undefined, so compose returns `ok:false, message:"card for __critic__ is missing"`. Measured. The critic is a pseudo-candidate, not a skill. |
| `src/deliver.ts:105,107,182` | `bytes` from `loadBody` | The return value `{ body, bytes }` - `bytes` is never read by any caller (`route.ts:120,139`, `council.ts:101`, `council-compose.ts:146`, `cli.ts:100` all destructure `{ body }` only). |
| `src/diagnose.ts:99-143` | `sectionLines` result | Included in the diagnose output at `diagnose.ts:188`. This one is consumed. Recorded here only to note that `sectionLines` re-implements `deliver.ts`'s packing logic (`diagnose.ts:88-92` says so) instead of calling it, so the two can drift. |
| `src/index.ts:32,36,37` | `keywords` folded into `use_when` | `index.ts:36` writes `use_when_text = [...use_when, ...kw]`. `db.ts:115` reads that column back into `use_when`. So **the DB's `use_when` is 13 entries longer than the card file's** for 1157 of 2176 cards. Measured on `accessibility-agents__a11y-core`: file `use_when` has 1 entry, the DB row has 9 (the extra 8 are keywords). The comment at `index.ts:34-36` claims "Guards slice `use_when[0..3]`, so appended keywords never surface in delivered bodies or ASK questions" - but `council-briefs.ts:31` does `card.use_when.slice(0, 3)`, and for **1099 cards** a keyword lands in that slice. The specialist prompt reads `USE WHEN: Shared contract for the Accessibility Agents skills... | tiers | output`. |
| `src/db.ts:104-136` | `cardFromRow` field list | `cardFromRow` restores 26 of the 31 `Card` fields. It drops `keywords`, `curated`, `body_tokens` and does not restore `origin` as an array of `repo@sha` (it does, at `db.ts:109`). The dropped fields are listed in section 4. |
| `src/retrieve-cache.ts:12-19` | `dbKey` | `count:max(hash)` is used as the cache key. A card edited **without changing the row count or the maximum hash** keeps the same key, so the cached card list stays stale. Measured: updating `cards.purpose` for `anthropic__frontend-design` left `dbKey` unchanged and `loadAllCards` returned the old purpose. The same applies to `vecsCache` (`retrieve-cache.ts:31`). |
| `src/profile.ts:36` | `budget.always_on_bytes`, `budget.per_task_bytes` | Written into every profile (`profile.ts:124`, `grill.ts:87`, `mandate.ts:56`), validated by the schema (`profile.ts:81`), and **read by nobody**. `mandate.ts:20` builds the mandate without them; `deliver.ts` uses the fixed `DELIVER_CAP = 3000` (`deliver.ts:9`). The byte budget is a declared-but-unenforced limit. |
| `src/profile.ts:10` | `MandatoryPin.guard_bytes` | Set by `init.ts:64` and `grill.ts:66` (both `1800`), never read. `deliver.ts:52` uses a hardcoded `maxBytes = 1800` for `pairGuard` instead of the pin's own value. |
| `src/db.ts:72-76` | `eval_runs` table | Created by `initDb`. Never inserted into, never selected from. |
| `src/db.ts:55` | `cards.body_cache` column | Inserted as `""` by `index.ts:38`. Never read. |
| `src/db.ts:33` | `cards.provider` column | Written by `index.ts:38`, never read back - `cardFromRow` ignores it, and `analytics-agg.ts:73` derives the provider from the id instead. |
| `src/session.ts:8` | `Session.phases` | Always `1`. `phaseDone` (`session.ts:29`) increments `phase`, not `phases`. Never read. |
| `src/types.ts:39` | `CardSection.when` | Written by `cardtext.ts:151`, stored in `sections_text`, read only by `diagnose.ts:154` (TEACHES) and `diagnose.ts:101`. The delivery path (`deliver.ts`) uses only `name` and `bytes`. So the section-level "when" hints never influence which sections a body carries. |
| `src/types.ts:11` | `CardSection.bytes` | Written by `cardtext.ts:149`, stored, read only by `diagnose.ts:118,131,137,139`. `deliver.ts` measures section size from the raw file instead. |
| `src/route.ts:87` | `route_logs.confidence` | Written at `route.ts:158`, read only by `doctor.ts:26-34`... which selects `skill_id` only. Never read. |
| `src/council-store.ts:107` | `deliberation_notes.bytes` | Written at `council.ts:181`, read back into `CouncilNote.bytes` (`council-store.ts:179`) and never used. |
| `src/council-store.ts:105` | `deliberation_notes.score` | Written at `council.ts:181` from `recordNote`'s `score` parameter, which **defaults to 0 and is never passed by any caller** (`council.ts:154`, `serve.ts:71` pass 5 args). Read back at `council-store.ts:179` and never used - compose uses the persisted candidate score instead (`council-compose.ts:82`). |
| `src/council-store.ts:103` | `deliberation_notes.role` | Written (`council.ts:181`), read back (`council-store.ts:179`), never used to filter. A critic note and a specialist note for the same `skill_id` **overwrite each other**: `council.ts:178` deletes the prior row for `(deliberation_id, skill_id)` and the file drop at `council-store.ts:79` is keyed by `skill_id` alone. Measured: a specialist `keep` followed by a critic `drop` on the same skill flips the decision to dropped. |
| `src/db.ts:37` | `cards.origin` | Written by `index.ts:38`, restored by `db.ts:109`, read by `doctor.ts`... no. Read by nobody in production. It is provenance metadata only, surfaced by `add.ts` / `card.ts`. Acceptable as metadata, but it costs a column and an index write per card. |
| `src/types.ts:20` | `Card.license` | Read by `doctor.ts:51` (UNKNOWN count) and `learn.ts:173` (`licensed`). The promotion path that consumes it is dead, so in production only the doctor reads it. |

---

## 4. Card fields never read

`Card` is defined at `src/types.ts:16-48`. The table lists every field `card.ts` writes
(`card.ts:155-171`, `card.ts:170`) that **no consumer in the routing / scoring / delivery /
council path reads**.

| Field | Written at | Read by | Status |
|---|---|---|---|
| `body_tokens` | `card.ts:166` (`Math.ceil(raw.length / 4)`) | nobody | **Never read.** Not even stored: `index.ts:38` has no column for it, so `cardFromRow` cannot restore it and it is lost at DB build time. |
| `core_bytes` | `card.ts:166` (`Buffer.byteLength(raw)`) | nobody in the routing path | **Never read for a decision.** Stored (`index.ts:38`, `db.ts:125`) and printed by no one. `doctor.ts` does not use it, `deliver.ts` measures the body it actually reads. It is the only size number the system records and nobody consults it. |
| `curated` | `card.ts:167` (`curated: false`) | `doctor.ts:70,118`, `card.ts:45,56`, `combos.ts:108`, `rivals.ts:121`, `cardtext.ts:52` | **Never read from a DB-loaded card.** `cardFromRow` (`db.ts:104-136`) does not restore it, so every card the router sees has `curated === undefined`. `doctor.ts` re-reads `cards/*.json` from disk to count curated cards (`doctor.ts:118`), so the router and the doctor disagree about the same field. |
| `keywords` | `card.ts:167` | `index.ts:32` (folded into the FTS text) and `diagnose.ts:154` | **Never read as a card field.** `cardFromRow` does not restore it, so `diagnose.ts:154` (`(c.keywords ?? []).join(" ")`) always sees an empty list - the TEACHES block silently loses the keyword signal for all 2176 cards. The keywords still reach the index via `index.ts:37`, but only as unstructured text appended to `use_when`. |
| `when_not_to_use` | `card.ts:170` (`deriveGoals`) | nobody | **Never read.** The gate uses `do_not_use_when` (`gate.ts:26`), not `when_not_to_use`. Stored (`index.ts:38`, `db.ts:131`) and used by no one. Only 141 of 2176 cards even have a value. |
| `example` | `card.ts:170` | `types.ts:125` (Tier-A validation only) | **Never read at runtime.** It is required for Tier A (`types.ts:125`) and then never surfaced. The council brief (`council-briefs.ts:22-40`) does not include it. |
| `counter_example` | `card.ts:170` | `types.ts:125` (Tier-A validation only) | **Never read at runtime.** Same as `example`. |
| `origin` | `card.ts:162` | `doctor.ts` via `card.ts:37,51` only | Metadata. Stored and restored (`db.ts:109`) but never read for a routing decision. Acceptable as provenance, listed for completeness. |
| `hash` | `card.ts:162` | `index.ts:68` (stale check), `doctor.ts:73` | Read for staleness only, never for routing. Acceptable. |
| `license` | `card.ts:162` | `doctor.ts:51`, `learn.ts:173` (dead path) | Read by the doctor only. Acceptable. |
| `verify` | `card.ts:167` | `route.ts:103,124,152`, `serve.ts:116-124`, `cli.ts:88,89,102,103,104` | **Read.** Used for the gate commands. |
| `provides` | `card.ts:170` | `deliver.ts:62` (goal bias) | **Read.** |
| `goal` | `card.ts:170` | `deliver.ts:62,87,143`, `lexicon.ts:149,156`, `council-briefs.ts:29,49` | **Read.** |
| `when_to_use` | `card.ts:170` | `deliver.ts:87`, `lexicon.ts:149,158`, `council-briefs.ts:32,50,53` | **Read.** |
| `sections` | `card.ts:167` | `deliver.ts:92,97,98,104,126,157`, `serve-ref.ts:31`, `diagnose.ts:94-143` | **Read.** |
| `requires` | `card.ts:166` | `gate.ts:13-21` | **Read.** |
| `conflicts_with` | `card.ts:166` | `council-compose.ts:41-42` | **Read** (council path only). |
| `pick_over_primary_when` | `card.ts:165` | `collapse.ts:46`, `diagnose.ts:70` | **Read.** |
| `pairs_with` | `card.ts:165` | `route.ts:168` | **Read** (1 card). |
| `cluster_role` | `card.ts:165` | `collapse.ts:68,91,94,157,160,171`, `scoring.ts:153` | **Read.** |
| `disambiguator` | `card.ts:165` | `collapse.ts:70`, `scoring.ts:128`, `decide.ts:54,55` | **Read.** |
| `domain` | `card.ts:163` | `scoring.ts:81`, `deliver.ts:45`, `plan.ts:30,33,35`, `route.ts:173` | **Read.** |
| `task_types` | `card.ts:163` | `scoring.ts:81`, `route.ts:173` | **Read.** |
| `do_not_use_when` | `card.ts:164` | `gate.ts:26,30` | **Read.** |
| `scope` | `card.ts:164` | `deliver.ts:186`, `mandate.ts:38`, `cli.ts:101,103` | **Read.** |
| `use_when` | `card.ts:164` | `scoring.ts:81`, `gate.ts:26`, `council-briefs.ts:31,34,50` | **Read** (but polluted with keywords, see section 3). |
| `purpose` | `card.ts:163` | `scoring.ts:81,136,137`, `deliver.ts:87`, `council-briefs.ts:27,52` | **Read.** |
| `tier` | `card.ts:162` | `gate.ts:12`, `route.ts:60`, `eval.ts:97`, `doctor.ts:112` | **Read.** |
| `id` | `card.ts:162` | everywhere | **Read.** |

**Answer: 7 card fields are written but never read by any consumer** -
`body_tokens`, `core_bytes`, `curated` (from a DB-loaded card), `keywords` (from a DB-loaded
card), `when_not_to_use`, `example`, `counter_example`.

Two of them (`curated`, `keywords`) are **dropped at the DB boundary** - `cardFromRow`
(`db.ts:104-136`) has no column for them, so the router sees a card that is not the card the
builder wrote. `doctor.ts` re-reads `cards/*.json` from disk to count curated cards
(`doctor.ts:118`), so the router and the doctor disagree about the same field. This is the
highest-value fix in this audit.

The other five are stored and restored correctly but nothing consumes them:
`body_tokens` has no DB column at all (`index.ts:38` drops it); `core_bytes`,
`when_not_to_use`, `example` and `counter_example` round-trip through the DB and then go
unused.

---

## 5. `config.json` key usage

`config.json` has 15 top-level keys (18 including the 8 `weights` sub-keys).

| Key | Value | Read by | Notes |
|---|---|---|---|
| `floor` | 45 | `route.ts:35`, `council.ts:60`, `diagnose.ts:184`, `init.ts:47`, `plan.ts:21`, `calibrate.ts:29`, `sweep.ts`, `sweep-cover.ts:65`, `sweep-fail.ts:39` | Read. |
| `margin` | 10 | `route.ts:36`, `diagnose.ts:184`, `sweep.ts:100-102`, `calibrate.ts:30` | Read. |
| `pick_floor` | 80 | `route.ts:37`, `diagnose.ts:184` | Read. |
| `top_k_retrieve` | 12 | **nobody** | **Never read.** Declared in the `loadConfig` return type (`db.ts:9`) but no code reads it. The retrieval depth is `score_pool` (`route.ts:68`). A dead key that looks meaningful. |
| `score_pool` | 40 | `route.ts:68`, `council.ts:54`, `diagnose.ts:177`, `init.ts:39`, `sweep.ts:39`, `sweep-cover.ts:27`, `sweep-fail.ts:30` | Read. |
| `query_terms` | 12 | `route.ts:69`, `council.ts:55`, `diagnose.ts:178`, `sweep.ts:44` | Read for **retrieval only**. `scoring.ts:43` calls `trimToRarest(task, lex, 12)` with a **hardcoded 12**, so the scoring cover denominator ignores `query_terms`. The two arms disagree the moment the key changes. See BUG-08. |
| `max_per_cluster` | 8 | `route.ts:73`, `council.ts:56`, `diagnose.ts:181`, `init.ts:40`, sweeps | Read, but the fallback literal is `3` in six of eight call sites (`route.ts:73`, `council.ts:56`, `diagnose.ts:181`, `init.ts:40`, `sweep.ts:45`, `sweep-fail.ts:36`) and `8` in `sweep-cover.ts:35`. The `collapse.ts:130` default is `3`. The config value `8` wins in production; the `3` fallbacks are dead but misleading. |
| `weights.bm25` | 0.45 | `route.ts:41`, `council.ts:41`, `diagnose.ts:180` -> `scoring.ts:177` | Read. |
| `weights.cover` | 0.4 | same -> `scoring.ts:177` | Read. |
| `weights.vec` | 0.05 | same -> `scoring.ts:177` | Read. |
| `weights.unknown` | 1 | same -> `scoring.ts:174` | Read. |
| `weights.variant_unclaimed` | 0 | same -> `scoring.ts:183` | Read but the value is `0`, so the penalty never applies. |
| `weights.rare_match` | 0 | same -> `scoring.ts:184` | Read but the value is `0`, so the bonus never applies. |
| `weights.rare_df` | 2 | same -> `decide.ts:24` -> `scoring.ts:31,100` | Read. |
| `weights.position_decay` | 0.6 | same -> `decide.ts:24` -> `scoring.ts:31` | Read. |
| `council_size` | 4 | `council.ts:74` | Read. |
| `max_bytes` | 20480 | **nobody** | **Never read.** The delivery cap is the hardcoded `DELIVER_CAP = 3000` (`deliver.ts:9`). `max_bytes` is in the `loadConfig` return type (`db.ts:9`) and nothing reads it. The `profile.budget.per_task_bytes = 20480` value (`profile.ts:124`) is a different number for a different purpose and is also unread. |
| `avg_bytes_target` | 12288 | **nobody** | **Never read.** No code compares a body size to a target average. |
| `max_skills_per_task` | 2 | `route.ts:144`, `council-compose.ts:71` | Read. The two call sites use **different fallback literals** (`?? 1` at `route.ts:144`, `?? 2` at `council-compose.ts:71`), so if the key is ever removed the pairing path and the compose path disagree on the cap. |
| `db_path` | "pitmhskills.db" | `db.ts:16` | Read. |
| `fitted_at` | "2026-11-10" | **nobody** | **Never read.** A provenance stamp with no reader. |

**Summary: 4 keys never read** - `top_k_retrieve`, `max_bytes`, `avg_bytes_target`, `fitted_at`.
**3 keys read but hardcoded elsewhere** - `query_terms` (hardcoded `12` in `scoring.ts:43`),
`max_per_cluster` (hardcoded `3` in six call sites), `max_skills_per_task` (hardcoded `1` vs `2`
in two call sites). `weights` is read correctly, but two of its eight values (`variant_unclaimed`,
`rare_match`) are `0`, so the signals they gate are computed and discarded.

---

## 6. Pipeline seam table

| Seam | Holds / broken | Evidence |
|---|---|---|
| task -> `route()` | holds | `src/route.ts:22-24` |
| `route` -> `gate.hardFilter` | holds | `src/route.ts:56`; `gate.ts:5-34` returns `{kept, dropped}`; `dropped` is used by `diagnose.ts:174` only. |
| `gate` -> `retrieve.retrieveWith` | holds | `src/route.ts:60,69`; pool is tier A+B only. |
| `retrieve` -> `collapse.shortlist` | holds | `src/route.ts:73`; `collapse.ts:129-181`. `sl.kept` is used. `sl.capped/deduped/unclaimed` are dropped. |
| `collapse` -> `decide.scoreCandidates` | holds | `src/route.ts:75`; `decide.ts:18-25` -> `scoring.ts:27` -> `scoring.ts:163`. |
| `scoring` -> `decide.decide` | holds | `src/route.ts:76`; `decide.ts:27-51`. `decide.ts:47` (`void collapsed`) discards the `collapsed` argument the caller passed at `route.ts:76`. |
| `decide` -> `deliver.loadBody` | holds | `src/route.ts:120,139`; `deliver.ts:77-183`. Body is byte-capped and carries the style fence + `SECTIONS:` header. |
| `deliver` -> `session.lockSkill` | holds, but ordering is wrong for ASK | `src/route.ts:131-138`. The lock is taken **after** the body is built, and the ASK branch (`route.ts:117-125`) never locks at all - deliberate (`route.ts:113-115`), and correct. |
| `route` -> `analytics.recordOffer` | **broken** | `src/route.ts:85,122,150` ignore the `log:false` flag. `route.ts:33` guards only `route_logs`. |
| `route` -> `session.lockSkill` -> `getSession` | holds | `src/route.ts:132-136`; `session.ts:18-24`. `getSession` re-reads the file, so the "holder" note at `route.ts:134` is accurate. |
| route ABSTAIN/ASK -> `council.openCouncil` | **broken** | `route.ts:106` emits `council_hint` for any non-empty `near`; `council.ts:60` filters at `max(20, floor*0.5)`. The hint can point at an empty council. |
| `council` -> `council-briefs` prompts | holds | `src/council.ts:116,120` -> `council-briefs.ts:22,41`. |
| `council` -> `note` -> `council-store` | holds | `src/council.ts:148-195`; `council-store.ts:143-146` (file first) then sqlite, with the file removed if sqlite fails (`council.ts:174,184,190`). |
| `note` -> `compose` | **broken** | `council-store.ts:170-187` keys notes by `skill_id` alone. A specialist note and a critic note for the same skill overwrite each other (`council.ts:178` deletes by `(deliberation_id, skill_id)`; `council-store.ts:79` names the file by `skill_id`). Measured: critic `drop` overwrote a specialist `keep`. The `role` column exists but is never used to separate them. |
| `compose` -> `deliver.loadBody` | holds | `src/council-compose.ts:146`. |
| `compose` -> `session` | **broken (no link at all)** | `composeCouncil` writes `deliberations.status='decided'` (`council-compose.ts:166`) but never touches the session. The skill the council chose is **not locked**. A `route` call right after `compose` can pick a different skill and lock it, so the council decision and the executed skill can differ. |
| `phase_done` -> `gates.runGates` | holds, but the cwd is wrong | `src/serve.ts:124`: `runGates(verify, process.cwd())`. `process.cwd()` is the **MCP server's** cwd, not the repo the task is about. Measured: `runGates(["bun run lint"], <pitmhskills>)` fails with `Script not found "lint"` because the lint script belongs to a different package. |
| `gates` -> `slop.runSlopScan` | holds, but the cwd is wrong | `src/serve.ts:132`: `runSlopScan(process.cwd(), files)`. Measured: scanning `["README.md"]` from the server cwd read the **server's** README (14 hits at line 1), not the task repo's file. `touched_files` are therefore resolved against the wrong tree. |
| `slop` -> `session.phaseDone` | holds | `src/serve.ts:154` -> `session.ts:26-32`. The phase advances and the lock clears. |
| `serve.phase_done` -> `session.getSession` | holds | `src/serve.ts:109` reads the session **before** `phaseDone` clears it - correct, and the comment says so. |
| `plan.detectPhases` -> `cli.run` -> `gates.executorPrompt` | holds | `src/plan.ts:16-45` -> `src/cli.ts:79,103` -> `gates.ts:23-32`. |
| `plan.detectPhases` -> `route` | **broken (side effect)** | `src/plan.ts:17` calls `route(task, cwd)` with the **default session id** and default `lock:true, log:true`. So `bun src/cli.ts run "<task>"` takes a session lock on the shared `default` session and writes a `route_logs` row. Measured: `detectPhases` on a PICK task wrote `active_skill` into `.state/default.json` and added 1 `route_logs` + 1 `skill_offers` row. |
| `plan.detectPhases` -> candidate plan | **broken** | `plan.ts:18` uses `r.candidates` (the top-3 scores) but `plan.ts:23` requires `a.score >= floor && b.score >= floor` while the router's own outcome was `ASK`. `plan.ts` then re-orders by `domainRank` and returns phases. The plan's skills are not the skills the router would pick, and none of them is locked. |
| `doctor` -> `diagnose` | **broken (no link)** | `doctor.ts` imports `db`, `ingest`, `index`, `learn`, `retrieve`, `eval` - **not** `diagnose`. `diagnose.ts` imports `diagnose-components`. The two are separate CLI commands (`cli.ts:181` `doctor`, `cli.ts:184` `diagnose`) that share no code path. |
| `diagnose` -> `diagnose-components` | holds | `src/diagnose.ts:188` -> `diagnose-components.ts:8`. |
| `doctor` -> `learn.summarizeUsage` | holds | `src/doctor.ts:84` -> `learn.ts:20`. |
| `doctor` -> `eval.runCoverage` | holds | `src/doctor.ts:100` -> `eval.ts:89`. |
| `profile` -> `signals` | **broken** | `profile.ts:111` (`computeSignalsHash`) takes a `Signals` object but `profile.ts` does not import `signals.ts`. `init.ts:79` calls `detectSignals(cwd)` and `init.ts:80` calls `computeSignalsHash(sig)`, so the link exists at the caller, not in the module. `doctor.ts` never calls `computeSignalsHash`, so the `signals_sha` freshness check at `init.ts:79` has no auditor. |
| `ingest` -> `card.buildCards` | holds, but only via `cli.ts` | `ingest.ts` does not import `card.ts`. `card.ts:6` imports `ingest.ts` (the other direction: `loadSources`, `hashContent`). The chain is `cli.ts:46` (`ingest`) and `cli.ts:56` (`cards`) as two separate commands. |
| `card.buildCards` -> `index.buildIndex` | holds, but only via `cli.ts` | `card.ts:7` imports `shaFile` from `index.ts` - a utility, not the index build. `index.buildIndex` is called from `cli.ts:63` and `add.ts:132`. The router reads the **DB**, so a card edit on disk is invisible until `bun src/cli.ts index` runs. |
| `index.buildIndex` -> `db` -> `retrieve-cache` | holds | `index.ts:14-47` -> `db.ts:20` -> `retrieve-cache.ts:21,31`. |
| `retrieve-cache` -> `db.cardFromRow` | **broken (field loss)** | `retrieve-cache.ts:25` -> `db.ts:104`. `cardFromRow` restores 26 of 31 fields; `keywords`, `curated`, `body_tokens` are dropped. |
| `text-match` / `disambiguator` / `lexicon` / `lexicon-stats` / `lexicon-synonyms` / `weights` / `scoring-types` / `collapse` helpers | holds | `scoring.ts:2-14`; `collapse.ts:2-4`; `retrieve.ts:3-4`; `lexicon.ts:13`; `lexicon-stats.ts:1-3`; `lexicon-synonyms.ts:4`; `text-match.ts:1`; `weights.ts` (no imports); `scoring-types.ts:8`. `clauseCoverage` and `longestRun` feed `scoring.ts:130-132,120`. |
| `collapse.claimsTask` -> `scoring` | holds | `collapse.ts:160` computes `claimants`, `scoring.ts:123` uses `predicateMatch`. `claimsTask` (the richer test) is used only inside `collapse.ts` and is gated off in production. |
| `cardtext` -> `card` | holds | `card.ts:8` -> `cardtext.ts:7-157`. |

---

## 7. Error handling and safety seams

| Condition | Behaviour | Verdict | Evidence |
|---|---|---|---|
| Card file missing on disk, DB row exists | `loadBody` catches the read failure, gets `raw = ""`, and substitutes a synthetic stub body built from the card's own metadata: `# id\npurpose\nGoal: ...\n\n<use_when>\n\nScope: ...`. The response is still a valid body with a `SECTIONS:` header and the style fence, but it contains **no skill content**. | **fallback (silent-wrong)** | `src/deliver.ts:84-87`. Measured: a card with `skill_path` pointing at a missing file returns a 962-byte stub. |
| Card file missing **because `skill_path` is relative** | `deliver.ts:85` does `existsSync(p)` on the **raw relative path**, resolved against `process.cwd()`, not against the repo root. 380 of 2176 cards have a relative `skill_path`. | **silent-wrong** | `src/deliver.ts:82-86`. Measured: running the same load from a different cwd turned **all 380** relative-path cards into stubs. The MCP server inherits the client's cwd, so this fires in production. |
| `skill_path` outside the skill dir (`get_ref`) | `serve-ref.ts:7-9` rejects absolute paths and Windows drive letters; `:15-17` resolves the requested path against `dirname(card.skill_path)` and throws `ref not found` unless the result is inside that directory. | **safe (throws)** | `src/serve-ref.ts:6-17`. Measured: `../../../../Windows/win.ini`, `C:/Windows/win.ini` and `../brand-guidelines/SKILL.md` all threw `ref not found`. The MCP SDK converts the throw into an `isError` tool result - it does **not** kill the server (`node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js:89-99`). |
| `get_ref` for an unknown skill | Throws `unknown skill` (`serve-ref.ts:12`). Same SDK containment: error result, server survives. | **safe (throws)** | `src/serve-ref.ts:12` |
| `get_ref` for a card whose file is missing | `serve-ref.ts:25` swallows the read error, `skillText` stays `""`, `avail` stays empty, and the tool returns `unknown section "<path>". Available: (no sections in this skill)`. | **fallback (silent-wrong)** | `src/serve-ref.ts:24-51` |
| DB locked by another process (write) | `openDb` sets `PRAGMA journal_mode=WAL` (`db.ts:22`), so readers never block. A writer gets `database is locked` on the first write. **`route` survives**: the `route_logs` insert is wrapped in try/catch (`route.ts:159`), the `skill_offers` insert is wrapped in try/catch (`analytics.ts:75`), and `initDb` only runs DDL that already exists. Measured: `routeWith` returned a normal `ASK` result while another process held an `IMMEDIATE` transaction. | **fallback (analytics silently lost)** | `src/db.ts:20-24`; `src/route.ts:155-160`; `src/analytics.ts:56-76`. The offer row is dropped with no signal - the acceptance analytics under-report. |
| DB locked by another process (council note) | `recordNote` writes the file first (`council.ts:168`), the sqlite insert fails, `deleteNoteFile` removes the file, and the tool returns `ok:false, message:"sqlite write failed for <skill>"`. | **safe (returns ok:false)** | `src/council.ts:168-186`. Measured. |
| DB locked by another process (compose) | `composeCouncil` only reads before it writes; the read succeeds and the write is inside try/finally (`council-compose.ts:162-170`) with the error swallowed by the `finally`. The composed result is returned but the `deliberations` row is not updated. | **silent-wrong** | `src/council-compose.ts:162-170`. Measured: compose returned `ok:false, incomplete:true, "no verdicts recorded"` because the note write had failed earlier - the two failures compose into one confusing message. |
| DB locked by another process (prune) | `route.ts:45` wraps `pruneExpired` in try/catch; `serve.ts:18,26` does the same. Expired deliberations survive until a later run. | **fallback** | `src/route.ts:45`, `src/serve.ts:18,26` |
| `.state/` not writable - `session.lockSkill` | `writeFileSync` at `session.ts:22` throws. `lockSkill` does not catch, so the exception propagates out of `route()` and out of the MCP `route` tool. The SDK catches it (`mcp.js:89`) and returns an `isError` result. The **CLI** path (`cli.ts:69`) has no try/catch: `bun src/cli.ts route` exits with an unhandled exception. | **crash (CLI) / error-result (MCP)** | `src/session.ts:18-24`; `src/cli.ts:69` |
| `.state/` not writable - `phaseDone` | Same: `session.ts:31` throws out of `phase_done`. | **crash (CLI) / error-result (MCP)** | `src/session.ts:26-32` |
| `.state/` not writable - `council-store.writeNoteFile` | `mkdirSync` + `writeFileSync` at `council-store.ts:144-145` throw. `recordNote` does not catch it, so it propagates out of the `note` tool. | **crash (CLI) / error-result (MCP)** | `src/council-store.ts:143-146`; `src/council.ts:168` |
| `.state/council/<id>/` file drop unreadable | `readNoteFiles` catches per file (`council-store.ts:164`) and skips the bad one. | **fallback** | `src/council-store.ts:156-168` |
| `deliberations` row missing for `compose` | `council-compose.ts:57-59` returns `ok:false, incomplete:true, "unknown deliberation <id>"`. | **safe** | `src/council-compose.ts:56-59` |
| `note` for an unknown deliberation | `recordNote` writes the file, discovers there is no row, deletes the file and returns `ok:false, "unknown deliberation <id>"` (`council.ts:172-176`). | **safe** | `src/council.ts:171-176` |
| `note` with a skill id outside the council | Accepted. The note is stored and can become the compose winner. Measured: a `keep` for `local__cavemem` (not a candidate) produced `skill_id: local__cavemem`. | **silent-wrong** | `src/council.ts:148-195`; `src/council-compose.ts:77` |
| `note` for `__critic__` with verdict `keep` | Compose tries `byId.get("__critic__")`, gets undefined, and returns `ok:false, "card for __critic__ is missing"`. The whole council is lost. | **silent-wrong** | `src/council-compose.ts:141-145`. Measured. |
| `note` sqlite write fails after the file write | The file is deleted and `ok:false, "sqlite write failed"` is returned. | **safe** | `src/council.ts:177-186` |
| `cards/*.json` unreadable during `checkCards` | Caught per file, pushed to `bad` with the parse error. `cli.ts:54` exits 1. | **safe** | `src/index.ts:72-74` |
| `cards/*.json` unreadable during `buildIndex` | Caught per file, pushed to `errors`. The card is skipped, so the DB keeps the old row. | **fallback** | `src/index.ts:43-45` |
| `profile.json` corrupt | `loadProfile` returns `null` (`profile.ts:53-55`). `route.ts:51-53` catches the throw. Routing continues with no profile. | **fallback** | `src/profile.ts:47-56`; `src/route.ts:50-53` |
| `sources.yaml` missing/corrupt | `loadSources` throws from `readFileSync` (`ingest.ts:15`); `ingest` is not wrapped, so `cli.ts:46` crashes. `doctor.ts:21` wraps it and reports an empty source list. | **crash (CLI ingest)** | `src/ingest.ts:14-19` |
| `evals/slop-patterns.json` missing | `deliver.ts:30-32` falls back to the hardcoded `FALLBACK_WORDS` list (`deliver.ts:11`). The style fence still works but lists fewer patterns. | **fallback** | `src/deliver.ts:21-34` |
| `evals/slop-patterns.json` missing (scanner) | `slop.ts:12` throws - **no fallback**. `gates.ts:44` awaits it inside `runSlopScan`, and `serve.ts:127` wraps the dynamic import in try/catch so the MCP `phase_done` keeps `slop.pass = true` with the note "slop: skipped". | **fallback (MCP) / crash (direct)** | `src/slop.ts:11-13`; `src/serve.ts:126-143` |
| `git` unavailable for the slop gate | `gates.ts:37-42` returns `{pass:true, output:"slop: no diff available"}`. | **fallback (vacuous pass)** | `src/gates.ts:35-43` |
| A gate command times out | `execSync` with `timeout: 120000` throws; `gates.ts:13-18` catches it and returns `pass:false` with the stderr. | **safe** | `src/gates.ts:6-21` |
| A gate command writes to stdout | Output is captured, truncated to 3000 bytes, and appended to the gate log. | **safe** | `src/gates.ts:12` |
| `.pitmhskills/profile.json` missing (slop allow-marketing) | `slop.ts:96-101` catches, `allowMarketing` stays `false`. | **fallback** | `src/slop.ts:92-101` |
| `retrieved` vector missing for a card | `retrieve.ts:149-151` computes the embedding on the fly and catches. | **fallback** | `src/retrieve.ts:146-153` |
| FTS table empty | `retrieve.ts:126-131` catches the query error; `bmScore` stays empty; everything scores on the vector arm alone. | **fallback** | `src/retrieve.ts:124-132` |
| `dbKey` unchanged after a card edit | The cached card list is returned unchanged. **Silent-wrong**: the router serves the old text. | **silent-wrong** | `src/retrieve-cache.ts:12-29`. Measured. |
| `serve-ref.ts` card path | `cards/${base}.json` is **relative to `process.cwd()`**, not to the repo root (`serve-ref.ts:11`). The MCP server's cwd is the client's cwd. | **crash (error result) outside the repo root** | `src/serve-ref.ts:10-12`. Measured: running `fetchRef` from a different directory threw `unknown skill`. |

---

## 8. Bugs found

Severity: **P0** blocks the router. **P1** breaks a documented contract or silently delivers the
wrong thing. **P2** is a real defect with a workaround. **P3** is cleanup.

### BUG-01 - P1 - `src/route.ts:85,122,150` - `log:false` still writes the analytics table

`doLog` (`route.ts:33`) guards the `route_logs` insert (`route.ts:79,121,149`) but **not** the
`skill_offers` insert (`route.ts:85,122,150`). Measured: one `routeWith(..., {log:false})` call
added 1 `skill_offers` row and 0 `route_logs` rows. One `bun src/cli.ts eval` adds 173
`route_logs` + 438 `skill_offers` rows.

Impact: the eval, coverage, bench and calibration harnesses - the things that measure the
router - write into the table that `analytics-agg.ts` reads to compute the acceptance rate.
The acceptance numbers are contaminated by measurement traffic. `doctor.ts:84` reports an
abstain rate computed from the same table.

Fix sketch: move the three `recordOffer` calls inside `if (doLog) { ... }`, or pass
`doLog` through to `recordOffer` and skip the insert there.

### BUG-02 - P1 - `src/route.ts:83` - the `council_hint` fires on candidates that are not close

`near = ranking.slice(0, 3)` has no floor filter. A task whose best candidate scores 2
against a floor of 45 still produces `council_hint: "close candidates exist: call council(task)"`.
The council it points at then filters at `max(20, floor*0.5)` (`council.ts:60`) and returns
**zero candidates and an empty spawn plan**.

Measured: `"asdf qwer zxcv"` -> `ABSTAIN`, `confidence: 2`, candidates `[2, 2, 1]`,
`council_hint` set. The same task through `openCouncil` -> `candidates: 0`, `plan: 0`.

Impact: an agent following the hint spawns zero subagents and gets no decision. The contract
in `AGENTS.md:4` ("if route says ABSTAIN but close candidates exist (council_hint), call
council") cannot be honoured.

Fix sketch: filter `near` to `ranking.filter(r => r.score >= floor * 0.5).slice(0, 3)` and
emit `council_hint` only when the filtered list is non-empty.

### BUG-03 - P1 - `src/route.ts:89` - `proceed_bare_allowed` is always `false`

`proceedBare = near.length === 0 && abstainConf < floor * 0.5`. `near` is never empty (the A/B
pool always yields at least one scored card), so the first term is always false.

Impact: `AGENTS.md:9` says "Proceed bare only when `proceed_bare_allowed==true`". That branch
is unreachable, so a harness that obeys the contract can never proceed bare - not even for a
task that matches nothing. A total miss is reported as `must_delegate: true` with
`block_reason: "ABSTAIN with close candidates - call council(task) to decide, do not proceed bare"`.

Fix sketch: `proceedBare = abstainConf < floor * 0.5` (drop the `near.length` term), and let
BUG-02's filtered `near` drive `mustDelegate`.

### BUG-04 - P1 - `src/council-store.ts:79,170-187` - critic and specialist notes overwrite each other

Notes are keyed by `skill_id` alone, in sqlite (`council.ts:178` deletes by
`(deliberation_id, skill_id)`) and in the file drop (`council-store.ts:79` names the file
`<skill_id>.json`). The `role` column (`council-store.ts:103`) is written and read back but
never used to keep the two apart.

Measured: specialist `keep` on `inclusive-design__information-density`, then a critic `drop`
on the same skill -> the compose result flips to dropped with the critic's evidence. The
specialist's verdict is lost.

Impact: the critic is spawned with a full brief listing every candidate
(`council-briefs.ts:41-57`) and is instructed to "Write a short verdict for each candidate"
(`council-briefs.ts:57`), so it is *designed* to collide with the specialists. The compose
result depends on write order.

Fix sketch: key notes by `(deliberation_id, skill_id, role)`, and in `readNotes` merge roles -
specialist verdicts decide survival, critic verdicts add dissent.

### BUG-05 - P2 - `src/route.ts:41` - the `weights` option on `routeWith` is ignored

The spread is `{ ...DEFAULT_WEIGHTS, ...o.weights, ...cfg.weights }`. `config.json` always
has a `weights` object, so `cfg.weights` wins over the caller's value.

Measured: `routeWith(..., { weights: { bm25: 0.99, cover: 0.01, ... } })` produced a
byte-identical result (same skill, same confidence 52) to the default.

Impact: `routeWith`'s `weights` option (`route.ts:29`) is a documented knob that does nothing.
The same ordering bug is in `council.ts:41` (`opts.weights`).

Fix sketch: `{ ...DEFAULT_WEIGHTS, ...cfg.weights, ...o.weights }` - caller wins last.

### BUG-06 - P2 - `src/route.ts:128` - `locked` is reported `true` when `lock:false`

`let locked = true` and the assignment happens only inside `if (doLock && d.top)`
(`route.ts:131-132`). With `lock:false` the caller receives `locked: true` although no lock
was taken, and `must_delegate: !locked` (`route.ts:152`) becomes `false`, telling the harness
"you may proceed" for a call that never locked anything.

Impact: `eval.ts:74,114`, `learn.ts:166`, `calibrate.ts:19`, `bench.ts:64` and
`taskeval.ts:29` all run with `lock:false` and all read a `locked` value that misdescribes
the call.

Fix sketch: initialise `locked = false` and set it to `true` only after a successful
`lockSkill`.

### BUG-07 - P2 - `src/council-compose.ts:146-155` - compose never locks the skill it chose

`composeCouncil` writes `chosen_id` into `deliberations` (`council-compose.ts:166`) and returns
the skill, but nothing calls `lockSkill`. The session lock still holds whatever `route`
locked earlier, or nothing.

Impact: after a council decides skill X, a `route` call can lock skill Y. The council's
decision and the executed skill can differ, with no error anywhere.

Fix sketch: `composeCouncil` should call `lockSkill(sessionId, main.skill_id)` before
returning `ok:true`. The deliberation row already stores `session_id`
(`council-store.ts:87`), so the session id is available.

### BUG-08 - P2 - `src/scoring.ts:43` - the scoring arm hardcodes `12` and ignores `config.query_terms`

`scoring.ts:43` calls `trimToRarest(task, lex, 12)` with a literal. The retrieval arm reads
`config.json`'s `query_terms` (`route.ts:69`, `council.ts:55`, `diagnose.ts:178`).

Impact: changing `query_terms` desynchronises the two arms - retrieve trims to N terms while
scoring still trims to 12, so the cover denominator (`scoring.ts:174`) is computed over a
different term set than the one that retrieved the card. This is the "same trim core" claim in
the comment at `scoring.ts:36-38`, and it is only true while the config value happens to be 12.

Fix sketch: thread `query_terms` through `scoreCandidates` / `scoreSignals` the same way
`rare_df` and `position_decay` are threaded (`decide.ts:24`).

### BUG-09 - P2 - `src/retrieve-cache.ts:12-19` - the card cache key misses in-place card edits

`dbKey` is `count:max(hash)`. Editing a card whose hash is not the maximum leaves the key
unchanged, so `loadAllCards` returns the stale card list for the life of the process.

Measured: `UPDATE cards SET purpose = ... WHERE id = 'anthropic__frontend-design'` left
`dbKey` unchanged and `loadAllCards` returned the old purpose. The same holds for
`vecsCache` (`retrieve-cache.ts:31`).

Impact: the MCP server is long-lived. After a `bun src/cli.ts index` that changes a
non-maximal-hash card, the server keeps serving the old routing text until it is restarted.

Fix sketch: include a content hash of the row set in the key, or drop the cache and rely on
sqlite's own page cache.

### BUG-10 - P2 - `src/deliver.ts:85` and `src/serve-ref.ts:11` - two path bases, and neither is the repo root

`deliver.ts:85` calls `existsSync(c.skill_path)` on a path that may be relative, resolved
against `process.cwd()`. 380 of 2176 cards have a relative `skill_path`.
`serve-ref.ts:11` reads `cards/${base}.json` relative to `process.cwd()`.

Measured: from a directory other than the repo root, **all 380** relative-path cards deliver
the metadata stub instead of the real body, and `fetchRef` throws `unknown skill` for every
skill.

Impact: the MCP server inherits the client's cwd. Both failures are silent on the routing
path (a stub body looks like a short body) and fatal on the `get_ref` path.

Fix sketch: resolve `skill_path` against the repo root (`deliver.ts` already computes `ROOT`
at `deliver.ts:8`), and do the same in `serve-ref.ts` for the card path.

### BUG-11 - P2 - `src/serve.ts:124,132` - `phase_done` runs the gates and the slop scan in the wrong directory

`runGates(verify, process.cwd())` and `runSlopScan(process.cwd(), files)` use the MCP
server's cwd, not the repo the task is about.

Measured: `runGates(["bun run lint"], <pitmhskills>)` fails with `Script not found "lint"` -
the lint script belongs to a different package. Scanning `touched_files: ["README.md"]` read
the **server's** README (14 hits at line 1).

Impact: every `phase_done` runs the wrong gates against the wrong tree and reports a failure
that has nothing to do with the task, or a vacuous pass.

Fix sketch: add a `cwd` parameter to the `phase_done` tool (`serve.ts:106`) and use it for
both `runGates` and `runSlopScan`, the way `route`, `council`, `compose` and `plan` already do.

### BUG-12 - P3 - `src/plan.ts:17` - `detectPhases` locks the shared `default` session and logs a route

`detectPhases` calls `route(task, cwd)`, which defaults to `sessionId: "default"`,
`lock: true`, `log: true`.

Measured: `detectPhases` on a PICK task wrote `active_skill: awesome-copilot__github-actions-hardening`
into `.state/default.json` and added 1 `route_logs` + 1 `skill_offers` row.

Impact: `bun src/cli.ts run "<task>"` silently locks a skill on the shared `default` session,
so a later `route` on `default` reports `locked: false` and demands `phase_done`. It also
contaminates the analytics tables (see BUG-01).

Fix sketch: `routeWith(task, cwd, { sessionId: "plan", lock: false, log: false })`.

---

## 9. Integration test result

`tests/integration.test.ts` (new, 193 lines) exercises the whole blend with the real
functions - no mocks, no stubs. It runs from the repo root, uses a unique session id
(`integration-<pid>-<ts>`), and cleans up the session file, the council note files, the
`deliberations` rows, the `skill_offers` rows and the `skill_usage` rows it creates.
Step 5 talks to the MCP server over real stdio using the SDK client
(`@modelcontextprotocol/sdk/client/index.js`), so the tool boundary is exercised, not
simulated.

| # | What it covers | Result |
|---|---|---|
| 1 | `routeWith` -> PICK/ASK with a skill id, a body, and the gate contract (`must_delegate`, `proceed_bare_allowed`, `block_reason`) | pass |
| 2 | `openCouncil` -> one brief per candidate + one critic, `plan_batches` all <= 3, batches flatten back to `plan` | pass |
| 3 | `recordNote` -> `ok:true`, `notes:1`, quoted evidence, note file on disk | pass |
| 4 | `composeCouncil` -> zero notes gives `ok:false` + "no verdicts recorded"; one note gives `ok:true` + "incomplete: N of M have verdicts"; the two messages differ; dissent lists the un-noted candidates | pass |
| 5 | `runGates` pass and fail paths; `phase_done` over real MCP stdio returns `phase closed pass=...`, `gates pass=...`, `slop pass=...`, names the skill, and releases the lock | pass |
| 6 | `loadBody` on a Tier A card -> bytes <= 3000, actual body bytes <= 3000, `SECTIONS:` and `STYLE:` present | pass |
| 7 | `fetchRef` returns only the requested section; traversal, drive letters and unknown skills are refused | pass |
| 8 | `bun src/cli.ts doctor` exits 0 and reports `cards check ok=` | pass |

```
bun test tests/integration.test.ts
 8 pass
 0 fail
 61 expect() calls
 Ran 8 tests across 1 file. [~18 s]
```

Run three times in a row: 8 pass / 0 fail each time. After the run, no `integration-*` session
file, no council note directory, and no `skill_offers` / `skill_usage` / `deliberations` row
with the test's session id remains.

The test asserts the **current** behaviour of the two flagged defects rather than the
intended behaviour, with a `BUG NOTE` comment naming the file and line:

- `route.ts:128` - `locked` is `true` under `lock:false` (BUG-06).
- `route.ts:85` - `log:false` does not stop the `skill_offers` write (BUG-01); the cleanup in
  `afterAll` deletes those rows by `session_id` and says why.

### Regression checks (unchanged by this audit)

```
bun src/cli.ts eval
tune top1=97.8% n=90
heldout top1=97.2% n=36
verbose top1=92.9% n=14
paraphrase top1=100.0% n=25 wrong=0.0% none_prec=100.0%
adversarial top1=100.0% n=8 wrong=0.0% none_prec=100.0%
coverage top1=100.0% n=70
parsers pass=9/9
```

```
bun src/cli.ts cards --check
ok=2175 bad=1
  local__tldraw-offline.json: stale: sha mismatch, needs re-review
```

```
bun src/cli.ts doctor
... exit 0
cards check ok=2175 bad=1
```

`bun src/cli.ts doctor` takes ~19 s (it runs the full coverage probe). `bun src/cli.ts cards
--check` exits 1 because of the one stale card - that is the pre-existing state, unchanged.

### Note on the rest of the unit suite

`bun test tests/` reports **1311 pass / 331 fail** across 202 files. That number includes the
third-party skill test suites that live under `skills/` (the `understand-anything`,
`vercel-optimize` and `tldraw` suites) - they fail on missing CLIs (`vercel` not installed)
and Windows path assumptions, not on router code.

Scoped to this project's own 10 unit files, the result is **93 pass / 2 fail**. The 2 failures
are in `tests/decide.test.ts`:

```
(fail) decide outcome > PICK when top clears floor with margin even below pickFloor
(fail) decide outcome > PICK for a lone candidate above floor (margin defaults to 99)
```

Both come from another agent's **uncommitted** change to `src/decide.ts` (the new `pickFloor`
gate at `decide.ts:41-44`, which turns a floor-clearing result with a clear margin into `ASK`
instead of `PICK`). Stashing that one file makes both tests pass:

```
git stash push -- src/decide.ts && bun test tests/decide.test.ts   # 13 pass / 0 fail
git stash pop
```

This audit did not touch `src/decide.ts`. The change is worth flagging on its own: it makes
every `route()` result with a score under `pick_floor` an `ASK` rather than a `PICK`. The
dashboard task used by the integration test scores 91 - above `pick_floor` (80) - so it still
returns `PICK`, but a task scoring between `floor` (45) and `pick_floor` (80) now returns
`ASK`.

---

## Appendix: how to reproduce the measurements

Every measured claim above came from a throwaway script under
`%TEMP%/opencode/`, run with `bun` from the repo root. The shapes used:

- **keywords fold** - read `cards/<id>.json` and compare `use_when` with the DB row's
  `use_when` from `loadAllCards(db)`.
- **log:false leak** - count `route_logs` and `skill_offers` before and after one
  `routeWith(..., {log:false})`.
- **weights ignored** - two `routeWith` calls with different `weights`, compare
  `skill_id` and `confidence`.
- **lock:false misreport** - one `routeWith(..., {lock:false})`, read `locked`.
- **stale cache** - `UPDATE cards SET purpose` in place, compare `dbKey` before and after.
- **relative skill_path** - count cards whose `skill_path` is not absolute, then call
  `loadBody` from a different working directory.
- **note collision** - `recordNote(same_skill, "keep")` then `recordNote(same_skill, "drop")`,
  then `composeCouncil`.
- **critic as candidate** - `recordNote(id, "__critic__", "keep")` then `composeCouncil`.
- **council_hint on noise** - `routeWith("asdf qwer zxcv")` then `openCouncil` on the same task.
- **wrong cwd for phase_done** - `runGates(["bun run lint"], ROOT)` and
  `runSlopScan(ROOT, ["README.md"])`.
