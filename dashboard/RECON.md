# RECON

Measured 2026-11-11 on Windows, Node v26.13.0, npm 11.20.0, Bun (router runtime).

## Repo facts
- Language: TypeScript on Bun + SQLite (`pitmhskills.db`, 29 MB). Root `package.json` only (Bun scripts).
- Skills: 2,176 cards in `cards/*.json` (one per skill). SKILL.md bodies live at each card's absolute `skill_path` (mostly `skills/`, gitignored).
- Tiers: A 70, B 2,103, C 3. Domains: frontend 539, workflow 532, gpu-compute 523, general 373, backend-data 73, cloudflare-edge 70, memory 64, other 2.
- Licenses: MIT 882, UNKNOWN 760, Apache-2.0 466, other 68. Every card has `origin`.
- Git: tree dirty before the dashboard (AGENTS.md, README.md and many cards modified by the owner). Dashboard commits stage only `dashboard/` and `src/cli.ts`.

## Flags
- HAS_ROUTER = true — `bun src/cli.ts route "add scroll animation to a landing page"` -> `OUTCOME: PICK SKILL: mengto-skills__cinematic-scroll-storytelling CONFIDENCE: 79`
- HAS_JSON_OUTPUT = true — added `--json` to `route` in `src/cli.ts` (prints the computed `RouteResult`; no scoring change) -> `{"outcome":"ABSTAIN","skill_id":null,...}`
- HAS_ABSTAIN = true — `route "wordpress theme development" --json` -> `"outcome":"ABSTAIN"`, `why: top ... score 44 < floor 45`
- HAS_CARDS = true — `ls cards | measure` -> `Count: 2176`
- HAS_TIERS = true — every card has `tier` in A/B/C (`src/types.ts` z.enum)
- HAS_CLUSTERS = true — every card has `cluster` + `cluster_role` (152 variants)
- HAS_PROVENANCE = true — every card has `origin`; license recorded per card
- HAS_BLOCKLIST = false — blocklists are per target repo (`.pitmhskills/profile.json` `blocked`, `src/gate.ts:31`); none at the repo root
- HAS_REBUILD = true — `bun src/cli.ts index` -> `indexed cards=N errors=0` (rebuilds SQLite index from cards)
- HAS_VALIDATE = true — `bun src/cli.ts cards --check` -> `ok=2175 bad=1` / `local__tldraw-offline.json: stale: sha mismatch` (exit 1, ~1.0 s)
- HAS_BENCH = true — `bun src/cli.ts eval` -> `top1=..% wrong=..% none_prec=..% n=..` over `evals/golden.yaml` (+ heldout reported)
- HAS_MANDATE_GEN = false — `src/init.ts:131` prints `buildMandate(p)` to stdout; no command writes an agent file
- HAS_GIT = true — `.git` exists

## Adapter map
| Contract | Real file / command |
|---|---|
| router | `bun src/cli.ts route <task> --session dashboard-playground --json` (cwd = repo root) |
| validate_cmd | `bun src/cli.ts cards --check` |
| rebuild_cmd | `bun src/cli.ts index` |
| bench_cmd | `bun src/cli.ts eval` |
| ingest_cmd | `bun src/cli.ts ingest` (reads `sources.yaml`; takes no selection -> S6 uses the copy path) |
| cards | `cards/<id>.json`, schema `src/types.ts` (`CardSchema`, `validateCard`) |
| config | `config.json` (floor 45, margin 15, max_bytes 20480, avg_bytes_target 12288, max_skills_per_task 2) |
| eval set | `evals/golden.yaml` (train), `evals/golden-heldout.yaml` (heldout); NONE extras in `golden-adversarial.yaml` |
| last bench | newest `.state/bench/*.json` (`overall.top1`, `overall.nonePrecision`) |
| mandate | Mode B: `AGENTS.md` (2,131 B). Agent files found: AGENTS.md only |

## Schema discovered
Required (from `validateCard` required set in `src/types.ts`): id, tier, purpose, domain, task_types, use_when, do_not_use_when, scope.
Enums: tier A/B/C, cluster_role primary/variant. Tier A also needs goal, disambiguator, example, counter_example, use_when ≥ 2.
Other fields observed per card are listed live by `GET /api/capabilities` (`schema[].observed`).

## Slice key
domain (present on 100% of cards) -> chosen: domain

## Findings vs prior audit
- 787 skills, 4 JSON files: fixed/changed — 2,176 per-skill cards + SQLite index.
- No abstention, always returns 3: fixed — router returns PICK / ASK / ABSTAIN. LEGACY_LIST kept as a type only.
- 684 skills without provenance: changed — 0 without origin, 760 with license UNKNOWN (counted as no provenance).
- 10.3 KB always-on: changed — AGENTS.md is 2,131 B (over the 600 B target and 1 KB cap).
- Role taxonomy non-discriminating: n/a — no role filter built.
- `strength` ranking: n/a — no strength editor built.

## Blocked
- Dropped/collapsed list in Playground: router JSON has no drop list. Unblock: router exposes `dropped` (separate PRD).
- Blocklist badge and ingest conflict check: HAS_BLOCKLIST false.
- `get_ref` MCP tool returns `unknown skill` (server cwd is not the repo). Design sections were read by calling `fetchRef` from `src/serve-ref.ts` with cwd = repo.

## Decisions
- Server runs on Node's native TypeScript type stripping (Node ≥ 23.6; this machine has 26). No tsx.
- shadcn primitives hand-written on the single `radix-ui` package: runtime deps = 11.
- Provenance = non-empty `origin` AND license not `UNKNOWN*`.
- Router session `dashboard-playground`: its lock file `.state/dashboard-playground.json` is removed before each call so Playground runs are independent.
- Eval cases append to `evals/golden.yaml` / `golden-heldout.yaml` (the repo's benchmark files), not a new `cases.jsonl`.
- Validator already fails on 1 stale card: the write post-step compares the bad set before/after and reverts only on new failures (S3).

## Design QA
Recorded in S8.
