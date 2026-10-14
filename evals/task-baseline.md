# Task-output baseline (Stage 5 / D6)

Measured 2026-10-14. Harness: `bun src/taskeval.ts evals/tasks <provision|prepare|score>`.
Inputs committed (`evals/tasks/tasks.yaml`, provision script in `src/taskeval.ts`),
scratch repos reproducible via `provision`.

## What this measures
What happens AFTER the pick. The harness makes no model calls: `prepare` emits the
harness-built prompt, `score` reads a committed diff vs the `baseline` tag and reports
diff lines, changed files, test pass, slop hits.

## Harness self-test (verified live)
- 10 scratch repos provisioned with `baseline` tags: OK.
- `prepare` emitted prompts for all 10 tasks with DONE WHEN lines: OK.
- `score` on repos with zero committed work: diff=0L everywhere: OK.
- `score` after committing a 1-word typo fix: `trivial-typo: diff=2L files=1 tests=true slop=0`: OK.
  The detector works; numbers below are the honest current state.

## Baseline table (agent-executed, single run, awaiting executor sessions)

| task | expect_skill | diff lines | files | tests | slop hits |
|---|---|---|---|---|---|
| frontend-hero | frontend-design | - | - | - | - |
| frontend-anim | gsap-framer | - | - | - | - |
| backend-rls | supabase-postgres | - | - | - | - |
| backend-query | supabase-postgres | - | - | - | - |
| workflow-grill | grill-with-docs | - | - | - | - |
| workflow-ponytail | ponytail | - | - | - | - |
| browser-capture | obscura | - | - | - | - |
| security-audit | NONE | - | - | - | - |
| trivial-typo | NONE | 2 (self-test) | 1 | true | 0 |
| trivial-deadcode | NONE | - | - | - | - |

`-` = not yet executed. The table fills as executor sessions run the 10 tasks; claims
must never exceed this table.

## How to run a task
1. `bun src/taskeval.ts evals/tasks provision` (once)
2. `bun src/taskeval.ts evals/tasks prepare` — give the emitted prompt to the agent,
   with cwd = the task's repo path
3. Commit the agent's work in that repo
4. `bun src/taskeval.ts evals/tasks score` — record the row

## Limits (honest)
- Single executor, single run, no model comparison yet.
- Gates are heuristic (`bun run test` present in provisioned repos; real repos use
  card `verify[]`).
- Slop scan covers the diff only.
