# ADR 2026-11-10 — Router v2

## Context

Router picks at most one skill per task from 2176 cards. Old scorer used raw word overlap. Common words like "build", "page", "form" then outranked rare words like "wizard". Long prompts diluted scores and forced ABSTAIN.

Eval sets cover tune 90, heldout 36, verbose 14, paraphrase 25, adversarial 8, Tier A self-route 70, parsers 9. Scores at Phase 8: tune 97.8, heldout 97.2, verbose 92.9, paraphrase 100, adversarial 100, coverage 100.

## Decision

### Tier definition

Tier A means the card must self-route from `use_when[0]` and must carry `goal`, `disambiguator`, `example`, `counter_example`. Tier B is the default pool. Tier C is user-only and never enters the route pool. Vendor tiers do not count.

### Card v2

Cards add `goal` (one-line outcome, max 200 chars), `when_to_use` (max 5, supplements `use_when`), `when_not_to_use` (max 5), `provides` (max 3 section names), `example`, `counter_example`. `goal` is required for Tier A and tested at schema level. Tier B without `goal` is a warning only, via `checkGoalCoverage`. No scoring weight depends on `goal` alone.

### Council batching

`council` returns `plan` (full list) and `plan_batches` (same list in batches of max 3). Callers process batches in order; max 3 subagents run at once. Each subagent writes one verdict with `note`. `compose` reads persisted scores from `deliberations.candidates` (`{id, score, reason}`) and picks one skill plus one merged brief.

### Deliver cap 3000

Routed body is capped at 3000 bytes via `DELIVER_CAP` in `src/deliver.ts`. `loadBody` slices the body, `scopeFence` and `scope fence` text stay outside the cap. Home prompt target stays 60 tokens mandate, 23 KB per task.

### Gate fields

`route` returns `must_delegate`, `proceed_bare_allowed`, `block_reason`, `locked`. ABSTAIN with candidates and ASK block when `must_delegate==true`; `block_reason` says next step (council or user pick). Proceed bare only when `proceed_bare_allowed==true`. A locked session (`locked==false` on a PICK) needs `phase_done` first.

### Doctor

`bun src/cli.ts doctor` reports tier counts, curated count, empty-field counts, domain balance, cache rows/files/max hash, council expired list, slop status, size over 200. Doctor always exits 0; `cards --check` remains the hard gate offline. Size is a warning only.

## Consequences

Good: routing uses rare-term signals; long prompts no longer dilute; council limits parallel subagents and records scores; delivery stays small; doctor gives offline health in plain lines.

Bad: domain counts are skewed (frontend 536, workflow 532, gpu-compute 523 of A+B 2173). No single domain flags over 25% now, but balance must be watched. Unknown license count 760 blocks Tier A promotion. One stale curated card (`local__tldraw-offline`) keeps `cards --check` at bad 1.

## Rollback note

Revert the phase that moved a score. Run `bun src/cli.ts cards --check`, `bun src/cli.ts index`, `bun src/cli.ts eval`, `bun src/cli.ts doctor`, and `bun test tests/decide.test.ts tests/gate.test.ts tests/retrieve.test.ts`. Any gate drop reverts. No card content, goldens, or config weights change without eval proof.
