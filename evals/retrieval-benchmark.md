# Retrieval benchmark — 1453-card scale

Date: 2026-10-15. Scope: wall-clock latency of the route pipeline at the current library size.

## Machine context

| Fact | Value |
|---|---|
| OS | Windows (win32) |
| Runtime | Bun 1.4.2 |
| Cards in DB | 1453 (`cards` = 1453, `cards_fts` = 1453, `vecs` = 1453) |
| DB file | `pitmhskills.db`, 8,372,224 bytes |
| Config | `top_k_retrieve` 12, floor 60, margin 10, `pick_floor` 80, delivery cap 3000 B |
| cwd for all runs | `C:\Users\Mattchine\pitmhskills` |

## Method

- `routeWith` called with `{ lock: false, log: false }`. Verified in `src/route.ts:27-28`: `doLock`/`doLog` gate all three `log()` callsites (ABSTAIN/ASK/PICK) and the `lockSkill` call, so no `route_logs` rows and no session-lock writes occur.
- `runDiagnose` is read-only by construction (no lock/log calls in `src/diagnose.ts`).
- FTS probe used a dedicated `new Database(path, { readonly: true })` handle, `SELECT` only.
- Each number: 3 warmup iterations (discarded) + 21 timed iterations; reported median + p95 (nearest-rank).
- No-write evidence: `SELECT COUNT(*) FROM route_logs` = 5107 before and 5107 after all loops.
- NOT run: `eval`, `index`, `cards`, `calibrate` (no `bun src/cli.ts eval/index/cards/calibrate` invocation). Live DB never written.

## 1. Full `routeWith` — total + per-stage split (ms)

Pool was 1450/1453 cards on every task (gate keeps nearly everything; only tier-C drops).

| Task (outcome → skill) | Total med / p95 | Setup med / p95 | Gate med / p95 | Retrieve med / p95 | Collapse+decide med / p95 | Deliver med / p95 |
|---|---|---|---|---|---|---|
| design PICK → `local__desktop-dashboard-ui` (conf 100, margin 49) | 273.2 / 290.7 | 184.0 / 197.5 | 2.8 / 3.4 | 82.5 / 88.9 | 0.5 / 0.7 | 0.6 / 0.8 |
| backend PICK → `supabase__supabase-postgres-best-practices` (84 / 19) | 268.9 / 287.4 | 178.8 / 193.4 | 2.9 / 5.2 | 78.3 / 85.5 | 0.5 / 0.6 | 0.5 / 0.5 |
| ABSTAIN chit-chat → NONE (57 / 0) | 262.4 / 272.5 | 186.1 / 199.2 | 3.2 / 3.5 | 77.9 / 82.6 | 0.5 / 0.6 | 0.0 / 0.0 |
| ASK ambiguity → `pocock__grill-with-docs` (67 / 6) | 286.5 / 337.0 | 180.8 / 190.2 | 3.0 / 5.3 | 79.7 / 89.7 | 0.4 / 0.5 | 0.3 / 0.4 |
| motion PICK → `mengto-skills__cinematic-scroll-storytelling` (88 / 22) | 278.0 / 317.4 | 186.1 / 195.9 | 3.0 / 9.4 | 84.7 / 100.4 | 0.4 / 0.6 | 0.8 / 0.9 |

Setup split (same protocol, med / p95): `openDb+initDb` 3.5 / 3.8, `loadConfig` 0.1 / 0.1, `detectSignals` 143.0 / 152.0, `loadAllCards` 37.2 / 43.8, `loadProfile` 0.0 / 0.0. Vec-arm micro-probe over 1450 cards (fetch embedding + `JSON.parse` 512 floats + cosine each): 56.5 / 61.1; one FTS OR-query for comparison: 0.5 / 0.6.

## 2. `loadBody` (cap 3000 B)

| Card | Raw file | Output bytes | Cap OK | ms med / p95 |
|---|---|---|---|---|
| `scandinavian-design__scandinavian-design` (52,792 B SKILL.md) | 52792 | 2433 | yes (≤ 3000) | 0.9 / 2.5 |
| `anthropic__template-skill` (146 B SKILL.md) | 146 | 308 | yes (≤ 3000) | 0.17 / 0.18 |

## 3. `runDiagnose` (backend task)

Median 326.4 ms, p95 401.1 ms, output 49 lines. (Slightly above one route because it re-derives gate/retrieval/collapse/decision plus TEACHES/SECTIONS blocks.)

## 4. FTS OR-query latency vs token count (read-only, LIMIT 200)

| Query | Rows | ms med / p95 |
|---|---|---|
| 1 token `"dashboard"` | 14 | 0.22 / 0.27 |
| 10 tokens OR (`dashboard sidebar grid typography postgres policy tenant motion scroll index`) | 157 | 2.06 / 2.14 |

~9x latency for 10x tokens; both negligible next to the ~80 ms retrieve stage.

## Budget proposal (p95, 1450-card scale, this machine)

| Probe | Budget | Worst measured p95 | Headroom |
|---|---|---|---|
| `routeWith` total | < 400 ms | 337.0 | 1.19x |
| retrieve stage | < 120 ms | 100.4 | 1.20x |
| gate stage | < 15 ms | 9.4 | 1.6x |
| collapse + decide | < 5 ms | 0.7 | 7x |
| `loadBody` any card at cap | < 5 ms | 2.5 | 2x |
| `runDiagnose` | < 500 ms | 401.1 | 1.25x |
| single FTS query | < 5 ms | 2.1 | 2.4x |

## Interpretation (3 lines)

1. Time goes ~53% to `detectSignals` repo scan (~143 ms, cwd-dependent, not card-count-dependent), ~30% to retrieve (~80 ms), ~14% to `loadAllCards` full-table parse (~37 ms); gate/collapse/decide/deliver together are ~1.5% (~4 ms).
2. Brute-force vec scan is CONFIRMED as the retrieval-internal scaling suspect: inside retrieve, the per-card embedding fetch + `JSON.parse` + cosine over ~1450 pool cards costs ~56 ms while the FTS arm costs ~0.5 ms (~100x cheaper), so retrieve grows linearly with pool size and gate currently prunes nothing (1450/1453 kept).
3. Past ~2000 cards expect retrieve ≈ 110 ms+ and `loadAllCards` to grow in step (linear extrapolation of 56.5 ms and 37.2 ms at 1450); cheapest fixes are gate pruning (shrink the pool) or the sqlite-vec swap already noted in `src/db.ts`, since FTS/collapse/decide/deliver have no scale problem.

## Compliance

- Wrote only this file (`evals/retrieval-benchmark.md`); `src/`, `cards/`, `config.json` untouched.
- `eval`, `index`, `cards`, `calibrate` never run; no commit made.
- Live DB never written: all `routeWith` calls used `{ lock: false, log: false }`, diagnose/loadBody/FTS paths are read-only, `route_logs` count identical before/after (5107).
- Temp scripts lived under `%TEMP%` only and were deleted after the runs.
