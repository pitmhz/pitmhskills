# Delivery effectiveness probe - 2026-11-10

## Result first

The router did not give an agent a usable body in any of the 15 sampled cases.

- Bodies delivered: 5 of 15. All 5 arrived through an `ASK`, not a `PICK`.
- Usable as delivered: **0 / 15**. Needs one more `get_ref`: **4 / 15**. Unusable: **11 / 15**.
- Skill decision: 4 correct, 1 wrong, 7 missing, 3 correct abstains.
- Counterfactual body quality (the card the yaml names, packed by the same code at the same 3000 B cap): **0 / 12 usable as is**, 11 / 12 needs a second section, 1 / 12 unusable.
- High confidence did not mean a usable body. All 5 delivered bodies had a confidence at or above the abstain floor of 45. **5 of 5 were needs-ref or unusable.** The worst pair was case 6: confidence 46, wrong skill, body about landing pages.
- Clipping: 11 of the 12 routed cards had a source file over the cap, so sections were dropped. In **10 of those 11** a dropped section was more relevant to the task than every delivered section.
- MCP acceptance: the client worked. 15 probe tasks produced 0 usage rows because `ASK` does not take the session lock. A 17 task control group produced 11 PICKs and 11 usage rows. Probe slice acceptance: **12 / 12 (100%)**. Whole 1 day window: **12 accepted of 619 PICK offers = 1.9%**, because other agents never call `phase_done`.

## 1. Method

### 1.1 Sampling

Source: `evals/golden-long-digital-product.yaml` and `evals/golden-long-cybersec.yaml`.

15 cases. 8 from the digital product file, 7 from the cybersec file.

- Near miss cases (expected id is a rival named in `evals/long-corpora-notes.md`): 10. Cases 1, 2, 3, 4, 5, 9, 10, 11, 13, 14.
- NONE cases: 3. Cases 7, 8, 15.
- Categories covered: landing, pricing, growth, accessibility, performance, testing, content, threat-model, secrets, hardening, review, access-control.

Case numbers below are the position of the case inside its own yaml file.

### 1.2 Capture

Each case ran the real router with a fresh session id:

```
bun src/cli.ts route --task "<exact task text>" --session probe-<n>
```

Raw output for case n is in `.state/probe/case-<n>.txt` (scratch, gitignored). All 15 files exist. Every body in them is at or below 3000 bytes including the STYLE fence. The 5 bodies carry a STYLE fence, a `SECTIONS:` line and a `MORE:` line.

Two extra scratch scripts supplied the diagnostic detail:

- `.state/probe/counterfactual.ts` rebuilds the routing pipeline for each case and reports the rank and score of the card named by `expect`, plus the body that card would deliver.
- `.state/probe/clip.ts` and `.state/probe/pack-order.ts` list the sections of every card in the probe, their sizes, their task word hits and whether they were delivered, spilled to `MORE`, or dropped without a name.

### 1.3 Judge rubric

- **match**: does the body belong to the card the yaml names in `expect`?
- **usability**:
  - `usable-as-is` - the agent can start work from this body without asking for more.
  - `needs-ref` - the direction is right, one more `get_ref` fetch is needed. The section or reference file is named.
  - `unusable` - wrong skill, or the core method is missing, or no body was delivered.
- **coverage**: 1 to 5, how much of the task the body covers.
- **cost**: body bytes and the number of dropped sections.

Every `get_ref` path named in this report was tested against the live MCP server. All 16 returned content. The list of dropped sections and the body sizes come from `loadBody` in `src/deliver.ts`, the same function `route` calls.

### 1.4 Two tables

Table A judges what the agent actually received. Table B judges the body of the card named by `expect`, built by the same `loadBody` call with the same task text and the same 3000 B cap. Table B isolates body quality from routing quality. Without it, only 5 bodies exist to judge.

Machine-readable verdicts: `.state/probe/verdicts.json`, and the `json` block at the end of this file.

## 2. Per-case results

### Table A - what the agent received

| # | corpus | case | category | expected id | offered id | outcome | conf | margin | body B | dropped | usability | cov | note |
|---|--------|------|----------|-------------|------------|---------|------|--------|-------|---------|-----------|-----|------|
| 1 | digital | 4 | landing | `awesome-copilot__landing-page-conversion-audit` | none | ABSTAIN | 43 | 0 | 0 | 0 | unusable | 1 | correct card ranked 2nd at 40, floor 45 |
| 2 | digital | 9 | pricing | `design__dark-pattern-audit` | none | ABSTAIN | 41 | 0 | 0 | 0 | unusable | 1 | correct card ranked 1st at 41, floor 45 |
| 3 | digital | 10 | growth | `awesome-copilot__gtm-product-led-growth` | same | ASK | 50 | 16 | 2728 | 3 | needs-ref | 3 | fetch `Core Frameworks` |
| 4 | digital | 16 | accessibility | `accessibility-agents__forms-specialist` | same | ASK | 50 | 8 | 2976 | 5 + 3 silent | needs-ref | 3 | fetch `references/multi-step-forms-wizards.md` |
| 5 | digital | 19 | performance | `web-quality__performance` | none | ABSTAIN | 22 | 0 | 0 | 0 | unusable | 1 | expected card not in the 40 retrieved cards |
| 6 | digital | 33 | testing | `anthropic__webapp-testing` | `mengto-skills__product-proof-saas` | ASK | 46 | 5 | 2837 | 5 | unusable | 1 | landing page card offered for a Playwright test task |
| 7 | digital | 37 | content | NONE | none | ABSTAIN | 24 | 0 | 0 | 0 | unusable | 1 | correct abstain, but the gate demands a council |
| 8 | digital | 39 | content | NONE | none | ABSTAIN | 29 | 0 | 0 | 0 | unusable | 1 | correct abstain, but the gate demands a council |
| 9 | cybersec | 2 | threat-model | `openai__security-threat-model` | same | ASK | 77 | 45 | 2306 | 1 | needs-ref | 2 | fetch `Workflow` |
| 10 | cybersec | 7 | secrets | `awesome-copilot__secret-scanning` | same | ASK | 51 | 19 | 2551 | 5 + 1 silent | needs-ref | 2 | fetch `Core Workflow — Enable Secret Scanning` |
| 11 | cybersec | 18 | hardening | `uiskills-staged__harden` | none | ABSTAIN | 43 | 0 | 0 | 0 | unusable | 1 | expected card not in the 40 retrieved cards |
| 12 | cybersec | 21 | review | `awesome-copilot__security-review` | none | ABSTAIN | 33 | 0 | 0 | 0 | unusable | 1 | correct card ranked 1st at 33, floor 45 |
| 13 | cybersec | 27 | testing | `awesome-copilot__codeql` | none | ABSTAIN | 22 | 0 | 0 | 0 | unusable | 1 | expected card not in the 40 retrieved cards |
| 14 | cybersec | 29 | access-control | `supabase__supabase-postgres-best-practices` | none | ABSTAIN | 40 | 0 | 0 | 0 | unusable | 1 | expected card not in the 40 retrieved cards |
| 15 | cybersec | 36 | threat-model | NONE | none | ABSTAIN | 37 | 0 | 0 | 0 | unusable | 1 | correct abstain, but the gate demands a council |

Dropped section lists for the 5 cases with a body:

- Case 3: `Core Frameworks`, `Related Skills`, `Quick Reference`. Delivered: `When to Use`, `Decision Trees`, `Common Mistakes`.
- Case 4: `Help Text and Descriptions`, `Form Layout`, `Select Elements`, `Checkboxes and Radio Buttons`, `Date and Time Inputs`. Dropped and not named: `File Uploads`, `Redundant Entry (WCAG 3.3.7)`, `Output contract`.
- Case 6: `Implement Pricing and FAQ`, `Motion Defaults`, `Avoid`, `Establish the Story`, `Validate`. Delivered: `Compose the Page`, `Implement the Prompt-to-Output Story`, `Build the Visual System`.
- Case 9: `Workflow`. Delivered: `References`, `Quick start`, `Risk prioritization guidance`.
- Case 10: `Custom Patterns`, `Pre-Commit Scanning via AI Coding Agents`, `Core Workflow — Enable Secret Scanning`, `Alert Management`, `Reference Files`. Dropped and not named: `Core Workflow — Resolve Blocked Pushes`.

### Table B - body quality of the card the yaml names

Same card, same task, same `loadBody` call, same 3000 B cap.

| # | expected id | body B | clipped | usability | cov | section to fetch | why it is not usable as is |
|---|-------------|--------|---------|-----------|-----|-----------------|-------------------------------|
| 1 | `awesome-copilot__landing-page-conversion-audit` | 2614 | yes | needs-ref | 3 | `Procedure` | 7 report template slots delivered, the 3586 B method section dropped |
| 2 | `design__dark-pattern-audit` | 2548 | no | unusable | 1 | none | body is an install stub: `git clone https://github.com/SidKH/skills` |
| 3 | `awesome-copilot__gtm-product-led-growth` | 2727 | yes | needs-ref | 3 | `Core Frameworks` | 8788 B section holds the activation metric and the growth equation |
| 4 | `accessibility-agents__forms-specialist` | 2975 | yes | needs-ref | 3 | `references/multi-step-forms-wizards.md` | body names the file, but `Output contract` was dropped without a name |
| 5 | `web-quality__performance` | 2898 | yes | needs-ref | 3 | `Critical rendering path` | task names hero image, fonts, client component, caching; all 5 sections dropped |
| 6 | `anthropic__webapp-testing` | 2320 | yes | needs-ref | 3 | `Decision Tree: Choosing Your Approach` | only a wait rule and a file list were delivered |
| 9 | `openai__security-threat-model` | 2305 | yes | needs-ref | 2 | `Workflow` | 3634 B of 7 step method dropped for a pointer and a risk table |
| 10 | `awesome-copilot__secret-scanning` | 2550 | yes | needs-ref | 2 | `Core Workflow — Enable Secret Scanning` | setup, custom patterns and alert handling all dropped |
| 11 | `uiskills-staged__harden` | 2476 | yes | needs-ref | 3 | `Hardening Dimensions` | 6735 B of fixes dropped for a test checklist |
| 12 | `awesome-copilot__security-review` | 2713 | yes | needs-ref | 2 | `Execution Workflow` | workflow, severity scale and output rules dropped |
| 13 | `awesome-copilot__codeql` | 2911 | yes | needs-ref | 2 | `Core Workflow — GitHub Actions` | both workflow sections dropped, log reading kept |
| 14 | `supabase__supabase-postgres-best-practices` | 2831 | yes | needs-ref | 2 | `How to Use` | rule category table delivered, the rule file index dropped |

## 3. Summary counts

Table A, the body the agent received:

| verdict | count | share |
|---------|-------|-------|
| usable-as-is | 0 | 0 % |
| needs-ref | 4 | 27 % |
| unusable | 11 | 73 % |

Table B, the body of the card the yaml names, 12 routed cases:

| verdict | count | share |
|---------|-------|-------|
| usable-as-is | 0 | 0 % |
| needs-ref | 11 | 92 % |
| unusable | 1 | 8 % |

Skill decisions on the 15 cases: 4 correct, 1 wrong, 7 missing, 3 correct abstains. Routing hit rate on the 12 routed cases: 4 / 12 = 33 %. NONE precision: 3 / 3 = 100 %.

The 3 NONE cases are a special case. The skill choice was right, but the gate is wrong: all 3 returned `must_delegate=true` and `proceed_bare_allowed=false` with `BLOCK: ABSTAIN with close candidates - call council(task)`. A poem and a pizza order cannot be handed to a council. The router abstained and then blocked the agent anyway.

## 4. Confidence and margin against usability

High confidence did not predict a usable body.

| case | outcome | conf | margin | body B | usability |
|------|---------|------|--------|-------|-----------|
| 9 | ASK | 77 | 45 | 2306 | needs-ref |
| 10 | ASK | 51 | 19 | 2551 | needs-ref |
| 3 | ASK | 50 | 16 | 2728 | needs-ref |
| 4 | ASK | 50 | 8 | 2976 | needs-ref |
| 6 | ASK | 46 | 5 | 2837 | unusable |

Every case where the router named a skill and gave a body was high confidence, and every one of those bodies was needs-ref or unusable. 5 of 5.

The most dangerous case is 6. Confidence 46, body 2837 bytes of landing page copy, task was a Playwright test of a marketplace. The only matched token was `demo`. The expected card `anthropic__webapp-testing` was not in the 40 retrieved cards. The agent gets a full, confident body for the wrong product.

Case 9 is the second most dangerous. It has the highest confidence in the set (77) and the highest margin (45), and the body still drops the 3634 B `Workflow` section. A high margin means the second candidate was weak, not that the body is complete. Margin measures the ranking, not the body.

Case 4 had margin 8, below the configured margin of 10, so the router asked rather than picked, and the body was the right card. That is the only case where the margin helped.

No case in the sample reached the pick floor of 80. All 5 bodies arrived through `ASK`, and `ASK` sets `must_delegate=true` and `proceed_bare_allowed=false`. So even a usable body would have been gated behind a user pick.

## 5. Clipping analysis

Definition used here: a case is clipped when the source `SKILL.md` is larger than the 3000 B cap, so `loadBody` had to drop sections.

- Cases whose source file is over the cap: **11 of the 12** routed cards.
- Cases where the source file was under the cap: 1. `design__dark-pattern-audit`, 2318 B. It was not clipped, and it is a stub with no method.
- Largest body delivered: 2976 B (case 4). No body exceeded 3000 B.
- A more relevant section was dropped than every delivered section in **10 of the 11** clipped cases. The exception is case 4, where the delivered `Reference files` section names the wizard reference, so the agent can recover.
- The method section was dropped in 10 of the 11 clipped cases.
- Sections dropped and never named in the `MORE` line: **7 across 4 cases**. Case 4 has 3, case 5 has 2, case 10 has 1, case 13 has 1.

### Why the method section loses

`src/deliver.ts` scores a section on its first 400 bytes only. A long method section puts its keywords later in the text, so it under-counts. The packer then fills the budget in score order and skips any section that does not fit, so small orientation sections take the space first.

| case | section | first 400 B hits | full section hits | size | result |
|------|---------|-------------------|-------------------|------|--------|
| 1 | `Procedure` | 7 | 24 | 3586 B | dropped, `When not to use` (275 B, 11 hits) won |
| 3 | `Core Frameworks` | 9 | 31 | 8788 B | dropped, `When to Use` (468 B, 10 hits) won |
| 5 | `Critical rendering path` | 5 | 18 | 3854 B | dropped, `Starting performance budget` (838 B, 8 hits) won |
| 6 | `Example: Using with_server.py` | 2 | 7 | 1001 B | dropped, `Common Pitfall` (181 B, 4 hits) won |
| 9 | `Workflow` | 3 | 23 | 3634 B | dropped, `References` (269 B, 7 hits) won |
| 10 | `Core Workflow — Enable Secret Scanning` | 6 | 14 | 2199 B | dropped, `When to Use This Skill` (816 B, 12 hits) won |
| 11 | `Hardening Dimensions` | 1 | 23 | 6735 B | dropped, `Assess Hardening Needs` (978 B, 6 hits) won |
| 12 | `Execution Workflow` | 8 | 28 | 4211 B | dropped, `How This Skill Works` (595 B, 12 hits) won |
| 13 | `Core Workflow — GitHub Actions` | 6 | 17 | 4170 B | dropped, `When to Use This Skill` (657 B, 9 hits) won |

Across the 81 sections of the 12 cards, 54 sections (67 %) have more task word hits over the whole section than in the first 400 bytes. The top ranked section changes in **9 of the 12** cards when the full section is scored.

## 6. MCP acceptance numbers

The client is `.state/probe/mcp-client.ts`. It starts `bun src/serve.ts` over stdio, sends `initialize` and `notifications/initialized`, lists tools, then for each task calls `route` with a unique `session_id` and `phase_done` with the same `session_id` and `touched_files: []`.

Tools reported by the server: `route, council, note, compose, plan, get_ref, phase_done`.

The client ran with no error.

### Probe group, 15 tasks, sessions `probe-<n>`

| outcome | count |
|---------|-------|
| PICK | 0 |
| ASK | 5 |
| ABSTAIN | 10 |

Usage rows written: **0**. Every `phase_done` returned `no active skill`. `ASK` does not take the session lock (`src/route.ts:117` returns before `lockSkill` at `src/route.ts:131`), and `phase_done` writes a usage row only when a skill is locked (`src/serve.ts:110`, `src/serve.ts:149`). So the router offered a body in 5 cases and the acceptance table recorded none of them.

### Control group, 17 short tasks from `evals/golden.yaml`, sessions `probe-ctl-<n>`

Added because the 15 long prompts produce no `PICK` and therefore no usage rows. The control group exists to prove the pipeline writes real rows.

| outcome | count |
|---------|-------|
| PICK | 11 |
| ASK | 4 |
| ABSTAIN | 2 |

Usage rows written: **11**, one per `PICK`.

### `bun src/cli.ts analytics --days 1`

```
window days=1
offers total=1274
outcome PICK=619 ASK=300 ABSTAIN=355
usage rows=12
accepted=12
acceptance rate=1.9%
```

`bun src/cli.ts analytics --days 1 --json` returns valid JSON. It was parsed and saved to `.state/probe/analytics-1d.json`.

The 1.9 % figure is a measurement artefact, not a delivery result. The database is shared with other agents. 607 of the 619 `PICK` offers come from runs that never call `phase_done`, so every one of them counts as a rejection. Rows written by this probe. The `probe-*` prefix slice also holds 8 offer rows that other agents wrote under the same prefix, so the three rows below do not sum to it.

| slice | offers | PICK | ASK | ABSTAIN | usage rows | accepted | acceptance rate |
|-------|--------|------|-----|---------|------------|----------|-----------------|
| all `probe-*` sessions | 55 | 12 | 18 | 25 | 12 | 12 | 100 % (12 of 12 PICK offers) |
| this probe, sessions `probe-<n>` | 30 | 0 | 10 | 20 | 0 | 0 | n/a, no PICK offer |
| this probe, sessions `probe-ctl-*` | 17 | 11 | 4 | 2 | 11 | 11 | 100 % (11 of 11 PICK offers) |

By skill accept rate, probe slice:

| skill | offers | accepted | accept rate |
|-------|--------|----------|-------------|
| `supabase__supabase` | 2 | 2 | 100 % |
| `supabase__supabase-postgres-best-practices` | 2 | 2 | 100 % |
| `jakubkrehel-skills__better-colors` | 1 | 1 | 100 % |
| `local__cavemem` | 1 | 1 | 100 % |
| `local__obscura` | 1 | 1 | 100 % |
| `local__skill-router` | 1 | 1 | 100 % |
| `mengto-skills__audit-ai-design-slop` | 1 | 1 | 100 % |
| `neondatabase__neon-ai-gateway` | 1 | 1 | 100 % |
| `pocock__grill-with-docs` | 1 | 1 | 100 % |
| `x__y` | 1 | 1 | 100 % |

Usage rows with no matching offer: 0.

One note on the gate column. Most control phases report `gates pass=false`, for example `npx supabase db lint FAILED` with `ECONNREFUSED 127.0.0.1:54322`. The skill verify command needs a local service that is not running here. This is an environment failure, not a delivery failure. It does not change the count: `src/serve.ts:149` writes the usage row whatever the gate result is.

The acceptance rate of 100 % on the probe slice does not mean the agent found the body good. It means the agent closed the phase after the router offered a skill. Acceptance as defined in `src/analytics-agg.ts:81` measures "a usage row names the same skill within 30 minutes". It cannot tell whether the body was usable. The body quality in this report has to be judged by hand.

## 7. The three worst delivery problems

### Problem 1 - The router returns no skill for 7 of 12 routed long prompts, and it blocks the agent on the 3 NONE tasks

`src/route.ts:83` builds the near list with `ranking.slice(0, 3)`, so the list is full whenever any card was scored. `src/route.ts:89` then sets `proceedBare = near.length === 0 && abstainConf < floor * 0.5` and `src/route.ts:90` sets `mustDelegate = near.length > 0 || !proceedBare`.

Result: every `ABSTAIN` sets `must_delegate=true` and `proceed_bare_allowed=false`. The agent is told to open a council for a pizza order (case 7, top score 24), a poem (case 8, 29) and a poem about a firewall (case 15, 37). On the routed side, 7 cases had a card that should have answered but the score fell under the floor, and the agent got nothing at all.

Fix at `src/route.ts:89`: allow the bare path when the top score is far below the floor, whatever the near list holds, and keep `must_delegate` for a true near miss only, meaning `abstainConf >= floor * 0.5`. Add the `ABSTAIN` and `ASK` outcomes to the offer row so the acceptance table can see an offer that carried a body.

### Problem 2 - The section packer reads only the first 400 bytes of a section, so the method section loses the budget

`src/deliver.ts:128` scores a section with `taskWords(s.slice(0, 400))`. `src/deliver.ts:166` drops any section that does not fit and moves on to the next one, so a smaller, lower scoring section takes the space first.

Evidence: 54 of 81 sections (67 %) are under counted. The top section changes in 9 of 12 cards under full section scoring. Case 9 loses its 3634 B `Workflow` section to a 269 B `References` pointer. Case 11 loses its 6735 B `Hardening Dimensions` to a 978 B checklist.

Fix at `src/deliver.ts:128`: score the whole section. Fix at `src/deliver.ts:166`: when the highest ranked section does not fit, truncate it to the remaining budget instead of skipping it. A truncated method section beats a complete orientation section.

### Problem 3 - The `MORE` line names at most 5 dropped sections, and 150 cards carry an install stub instead of a method

`src/deliver.ts:156` takes `items.filter((e) => !inDel.has(e)).slice(0, 5)`. Any card with more than 5 dropped sections loses the rest without a name. 7 sections were dropped silently across 4 cases in this probe. The agent cannot fetch a section it was never told about.

The same probe found 150 of 2176 cards (6.9 %) whose body is only an install stub. 4 of the 70 expected ids in the two long corpora are stubs, including `design__dark-pattern-audit` (case 2) and `design__design-system-governance`, `design__content-strategy`, `design__software-ux-research`. The body of `design__dark-pattern-audit` tells the agent to `git clone https://github.com/SidKH/skills`. That is not a method and that repo is not installed.

Fix at `src/deliver.ts:156`: write every dropped section name, or write the count of the remainder, so the agent knows what it can fetch. Fix in `src/gate.ts:12`: drop a card whose body has no method, the way tier C cards are dropped, so a stub is never offered.

## Machine-readable verdicts

```json
{
  "probe": "2026-11-10",
  "summary": {
    "total": 15,
    "usable_as_is": 0,
    "needs_ref": 4,
    "unusable": 11,
    "skill_decisions": { "correct": 4, "wrong": 1, "missing": 7, "correct-abstain": 3 },
    "counterfactual": { "routed_cases": 12, "usable-as-is": 0, "needs-ref": 11, "unusable": 1 }
  },
  "cases": [
    { "n": 1, "case_no": 4, "category": "landing", "near_miss": true, "expect": "awesome-copilot__landing-page-conversion-audit", "offered": null, "outcome": "ABSTAIN", "confidence": 43, "margin": 0, "body_bytes": 0, "usability": "unusable", "coverage": 1, "ref_needed": null },
    { "n": 2, "case_no": 9, "category": "pricing", "near_miss": true, "expect": "design__dark-pattern-audit", "offered": null, "outcome": "ABSTAIN", "confidence": 41, "margin": 0, "body_bytes": 0, "usability": "unusable", "coverage": 1, "ref_needed": null },
    { "n": 3, "case_no": 10, "category": "growth", "near_miss": true, "expect": "awesome-copilot__gtm-product-led-growth", "offered": "awesome-copilot__gtm-product-led-growth", "outcome": "ASK", "confidence": 50, "margin": 16, "body_bytes": 2728, "usability": "needs-ref", "coverage": 3, "ref_needed": "Core Frameworks" },
    { "n": 4, "case_no": 16, "category": "accessibility", "near_miss": true, "expect": "accessibility-agents__forms-specialist", "offered": "accessibility-agents__forms-specialist", "outcome": "ASK", "confidence": 50, "margin": 8, "body_bytes": 2976, "usability": "needs-ref", "coverage": 3, "ref_needed": "references/multi-step-forms-wizards.md" },
    { "n": 5, "case_no": 19, "category": "performance", "near_miss": true, "expect": "web-quality__performance", "offered": null, "outcome": "ABSTAIN", "confidence": 22, "margin": 0, "body_bytes": 0, "usability": "unusable", "coverage": 1, "ref_needed": null },
    { "n": 6, "case_no": 33, "category": "testing", "near_miss": false, "expect": "anthropic__webapp-testing", "offered": "mengto-skills__product-proof-saas", "outcome": "ASK", "confidence": 46, "margin": 5, "body_bytes": 2837, "usability": "unusable", "coverage": 1, "ref_needed": null },
    { "n": 7, "case_no": 37, "category": "content", "near_miss": false, "expect": "NONE", "offered": null, "outcome": "ABSTAIN", "confidence": 24, "margin": 0, "body_bytes": 0, "usability": "unusable", "coverage": 1, "ref_needed": null },
    { "n": 8, "case_no": 39, "category": "content", "near_miss": false, "expect": "NONE", "offered": null, "outcome": "ABSTAIN", "confidence": 29, "margin": 0, "body_bytes": 0, "usability": "unusable", "coverage": 1, "ref_needed": null },
    { "n": 9, "case_no": 2, "category": "threat-model", "near_miss": true, "expect": "openai__security-threat-model", "offered": "openai__security-threat-model", "outcome": "ASK", "confidence": 77, "margin": 45, "body_bytes": 2306, "usability": "needs-ref", "coverage": 2, "ref_needed": "Workflow" },
    { "n": 10, "case_no": 7, "category": "secrets", "near_miss": true, "expect": "awesome-copilot__secret-scanning", "offered": "awesome-copilot__secret-scanning", "outcome": "ASK", "confidence": 51, "margin": 19, "body_bytes": 2551, "usability": "needs-ref", "coverage": 2, "ref_needed": "Core Workflow — Enable Secret Scanning" },
    { "n": 11, "case_no": 18, "category": "hardening", "near_miss": true, "expect": "uiskills-staged__harden", "offered": null, "outcome": "ABSTAIN", "confidence": 43, "margin": 0, "body_bytes": 0, "usability": "unusable", "coverage": 1, "ref_needed": null },
    { "n": 12, "case_no": 21, "category": "review", "near_miss": false, "expect": "awesome-copilot__security-review", "offered": null, "outcome": "ABSTAIN", "confidence": 33, "margin": 0, "body_bytes": 0, "usability": "unusable", "coverage": 1, "ref_needed": null },
    { "n": 13, "case_no": 27, "category": "testing", "near_miss": true, "expect": "awesome-copilot__codeql", "offered": null, "outcome": "ABSTAIN", "confidence": 22, "margin": 0, "body_bytes": 0, "usability": "unusable", "coverage": 1, "ref_needed": null },
    { "n": 14, "case_no": 29, "category": "access-control", "near_miss": true, "expect": "supabase__supabase-postgres-best-practices", "offered": null, "outcome": "ABSTAIN", "confidence": 40, "margin": 0, "body_bytes": 0, "usability": "unusable", "coverage": 1, "ref_needed": null },
    { "n": 15, "case_no": 36, "category": "threat-model", "near_miss": false, "expect": "NONE", "offered": null, "outcome": "ABSTAIN", "confidence": 37, "margin": 0, "body_bytes": 0, "usability": "unusable", "coverage": 1, "ref_needed": null }
  ]
}
```

Full records, including the counterfactual rows, the pipeline ranks and the section lists: `.state/probe/verdicts.json`.

## Files used

Scratch, gitignored, not committed:

- `.state/probe/case-1.txt` to `.state/probe/case-15.txt` - raw router output for each case.
- `.state/probe/run-cases.ts` - capture driver.
- `.state/probe/counterfactual.ts` - pipeline rank and counterfactual body.
- `.state/probe/clip.ts`, `.state/probe/pack-order.ts` - section inventory and pack order.
- `.state/probe/sections.ts` - section sizes per card.
- `.state/probe/mcp-client.ts` - MCP stdio client.
- `.state/probe/ref-check.ts` - get_ref reachability check.
- `.state/probe/verdicts.ts`, `.state/probe/verdicts.json` - machine-readable verdicts.
- `.state/probe/analytics-slice.ts`, `.state/probe/analytics-1d.json` - analytics slices.
- `.state/probe/mcp-client.log`, `.state/probe/section-inventory.txt`, `.state/probe/pack-order.txt`, `.state/probe/clip-analysis.txt` - run logs.

No file in `src/`, `evals/` or `cards/` was changed. Nothing was committed.
