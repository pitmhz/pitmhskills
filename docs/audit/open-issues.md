# Open work queue

Generated from `docs/audit/findings.json`. Do not edit by hand.

Open items: 23

| Id | Severity | Area | Title | Phase | Files |
| --- | --- | --- | --- | --- | --- |
| AUD-BEN-002 | P0 | scoring | pick_floor of 80 is unreachable for long prompts, so a correct first candidate becomes ASK | 3 | src/decide.ts, config.json |
| AUD-BEN-003 | P0 | retrieval | Retrieval drops the correct card on long text before the scorer can see it | 3 | src/retrieve.ts, src/scoring.ts, src/lexicon.ts |
| AUD-DLV-001 | P0 | delivery | Section packer scores only the first 400 bytes of a section | 3 | src/deliver.ts |
| AUD-DLV-002 | P0 | delivery | Oversized top section is skipped instead of truncated | 3 | src/deliver.ts |
| AUD-DLV-003 | P0 | delivery | Delivered body is never usable without a second fetch | 3 | src/deliver.ts, src/deliver-cap.ts |
| AUD-DLV-004 | P0 | delivery | Confidence does not predict body quality | 3 | src/deliver.ts, src/route.ts |
| AUD-INT-002 | P0 | cards | Seven card fields are written and never read | 3 | src/db.ts, src/index.ts, src/lexicon.ts, src/deliver.ts, src/scoring.ts, src/gate.ts |
| AUD-RET-001 | P0 | retrieval | The Card v2 fields never reach the retriever | 2 | src/db.ts, src/index.ts, src/scoring.ts |
| AUD-RET-002 | P0 | retrieval | Generic word mass pushes the right card out of the shortlist | 2 | src/lexicon-stats.ts, src/scoring.ts |
| AUD-RTE-002 | P0 | retrieval | Expected card is often not retrieved at all on long text | 3 | src/retrieve.ts, src/scoring.ts |
| AUD-SCR-004 | P0 | scoring | The cover denominator is length dependent, so the right card scores below the floor on long prompts | 3 | src/scoring.ts, src/scoring-types.ts, src/weights.ts |
| AUD-ANA-001 | P1 | analytics | Acceptance rate is polluted by harness sessions | 3 | src/analytics-agg.ts |
| AUD-ANA-002 | P1 | analytics | Harness runs write offer rows into the live analytics table | 3 | src/analytics.ts, src/analytics-agg.ts, src/route.ts |
| AUD-BEN-004 | P1 | scoring | The abstain floor of 45 is wrong for long prompts | 3 | src/decide.ts, config.json |
| AUD-BEN-008 | P1 | bench | One of seven long corpus cases carries a wrong or arbitrary label | 0 | evals/golden-long-digital-product.yaml, evals/golden-long-cybersec.yaml, src/bench.ts |
| AUD-BEN-009 | P1 | bench | The safety property was never actually tested | 1 | src/bench.ts |
| AUD-CRD-002 | P1 | cards | do_not_use_when was a generic template string for nearly every card | 3 | src/cardtext.ts, src/card.ts |
| AUD-EVL-003 | P1 | eval | The eval top1 metric measures surfacing, not commitment | 1 | src/eval.ts, src/bench.ts |
| AUD-EVL-004 | P1 | eval | The eval metric treats a routed ASK as a hit and a NONE ASK as a miss | 1 | src/eval.ts |
| AUD-INT-001 | P1 | enforcement | The whole module graph is wired, but the enforcement module is not | 3 | src/harness.ts, src/serve.ts, AGENTS.md |
| AUD-INT-003 | P1 | council | A critic verdict overwrites the specialist verdict for the same skill | 3 | src/council-store.ts, src/council.ts, src/council-compose.ts |
| AUD-RTE-003 | P1 | scoring | Right card is top ranked but scores under the floor | 3 | src/decide.ts, config.json |
| AUD-RTE-004 | P1 | analytics | ASK outcome never takes the session lock, so no usage row is written | 3 | src/serve.ts, src/session.ts |

## Fix order

### Phase 0

- **AUD-BEN-008** One of seven long corpus cases carries a wrong or arbitrary label
  - Fix: Review every label, and let a case accept more than one skill when the library has rivals.
  - Sketch: Add an expect_any list. The bench counts a hit when the offered card is in the list. Record the label version in the bench JSON so old and new numbers never mix.
  - Files: evals/golden-long-digital-product.yaml, evals/golden-long-cybersec.yaml, src/bench.ts

### Phase 1

- **AUD-BEN-009** The safety property was never actually tested
  - Fix: Treat the safety claim as untested. Measure wrong picks after the threshold work, not before.
  - Sketch: The bench must report wrong picks and false picks on every run so the property is measured once picks exist.
  - Files: src/bench.ts
- **AUD-EVL-003** The eval top1 metric measures surfacing, not commitment
  - Fix: Report three numbers everywhere: surfaced, committed, and committed correct.
  - Sketch: Add a committed column to the eval table and print it next to top1. A green eval with a red committed count is the signal that the router is asking instead of acting.
  - Files: src/eval.ts, src/bench.ts
- **AUD-EVL-004** The eval metric treats a routed ASK as a hit and a NONE ASK as a miss
  - Fix: Make the eval report picks, asks and abstains separately, plus a committed-only hit rate.
  - Files: src/eval.ts

### Phase 2

- **AUD-RET-001** The Card v2 fields never reach the retriever
  - Fix: Put goal, when_to_use and keywords into the FTS index and into the cover hay stack.
  - Sketch: Add goal_text, when_to_use_text, provides_text and keywords_text columns with the migration pattern already in db.ts. Extend the FTS insert and drop and recreate cards_fts in buildIndex because the column set changed. Add goal and when_to_use to the hay stack in scoring.ts with purpose still first.
  - Files: src/db.ts, src/index.ts, src/scoring.ts
- **AUD-RET-002** Generic word mass pushes the right card out of the shortlist
  - Fix: Cap the contribution of a generic word and stop the unknown word mass from growing with prompt length.
  - Sketch: Extend the generic list with team, deadline, budget, review, compliance, week, users, existing, codebase and work. Give a generic word a small fraction of a specific word. Make the unknown mass a function of the unseen content words and not of the prompt length.
  - Files: src/lexicon-stats.ts, src/scoring.ts

### Phase 3

- **AUD-BEN-002** pick_floor of 80 is unreachable for long prompts, so a correct first candidate becomes ASK
  - Fix: Make the pick floor relative: a clear first candidate with a margin above the runner up should pick, whatever the absolute score.
  - Sketch: Pick when score is at or above floor and the margin over the runner up is at least the margin value, or when the score is at or above pick_floor. Lower pick_floor for long tasks.
  - Files: src/decide.ts, config.json
- **AUD-BEN-003** Retrieval drops the correct card on long text before the scorer can see it
  - Fix: Score the intent clause of the request separately from the context, and stop trimming the query so hard on long input.
  - Sketch: Split the task into the first sentence and the rest. Retrieve with the first sentence plus the rare terms of the whole task. Add the intent score as its own signal so context words cannot dilute it.
  - Files: src/retrieve.ts, src/scoring.ts, src/lexicon.ts
- **AUD-DLV-001** Section packer scores only the first 400 bytes of a section
  - Fix: Score the whole section text, not a 400 byte prefix.
  - Sketch: Use taskWords(s) over the full section; if that is too slow, raise the window to 2000 bytes and add a second pass over the tail.
  - Files: src/deliver.ts
- **AUD-DLV-002** Oversized top section is skipped instead of truncated
  - Fix: Truncate the top scoring section to the remaining budget instead of skipping it.
  - Sketch: When a section does not fit, cut it to the remaining bytes, mark it partial in the SECTIONS line, and stop adding further sections.
  - Files: src/deliver.ts
- **AUD-DLV-003** Delivered body is never usable without a second fetch
  - Fix: Deliver the goal plus the first complete method section, then raise the cap only if the body still fits.
  - Sketch: Split the budget: goal and core first, then one whole method section. Keep DELIVER_CAP 3000 as the default but allow a per card override for skills whose core is short.
  - Files: src/deliver.ts, src/deliver-cap.ts
- **AUD-DLV-004** Confidence does not predict body quality
  - Fix: Add a body coverage signal to the route result and to the gate.
  - Sketch: loadBody returns a coverage flag: did a whole method section fit. route exposes body_complete. must_delegate becomes true when confidence is high but body_complete is false.
  - Files: src/deliver.ts, src/route.ts
- **AUD-INT-002** Seven card fields are written and never read
  - Fix: Give every field a consumer. The retrieval half is tracked as AUD-RET-001 and is a P0.
  - Files: src/db.ts, src/index.ts, src/lexicon.ts, src/deliver.ts, src/scoring.ts, src/gate.ts
- **AUD-RTE-002** Expected card is often not retrieved at all on long text
  - Fix: Stop trimming the query to the rarest 12 terms when the task is long, and rank on the intent clause first.
  - Sketch: Raise query_terms for long tasks, or score the first sentence separately and add its score as a separate signal so intent is never diluted by context words.
  - Files: src/retrieve.ts, src/scoring.ts
- **AUD-SCR-004** The cover denominator is length dependent, so the right card scores below the floor on long prompts
  - Fix: Add an intent-clause signal: score the card against the first sentence of the request, not against the whole prompt, and give that signal its own weight.
  - Sketch: Extract the intent clause as the first sentence or the first 12 content words. Compute its cover against the card. Add it as a separate signal with its own weight so a long prompt cannot bury it under the whole-prompt denominator. Do not use it as a gate: a flat cover floor of 0.35 keeps 137 of 162 right cards and drops 4 of 37 wrong ones, but it would also drop 7 of 21 NONE cases, so it belongs in the score, not in the threshold.
  - Files: src/scoring.ts, src/scoring-types.ts, src/weights.ts
- **AUD-ANA-001** Acceptance rate is polluted by harness sessions
  - Fix: Separate agent traffic from harness traffic in the aggregate.
  - Sketch: Exclude session ids that start with eval, cover, calibrate, bench, or default. Add an agent_only flag and report both numbers.
  - Files: src/analytics-agg.ts
- **AUD-ANA-002** Harness runs write offer rows into the live analytics table
  - Fix: Tag the source of each offer row and filter by source in the aggregate.
  - Sketch: Add source values harness and agent. Pass harness from the eval and coverage call sites, agent everywhere else.
  - Files: src/analytics.ts, src/analytics-agg.ts, src/route.ts
- **AUD-BEN-004** The abstain floor of 45 is wrong for long prompts
  - Fix: Scale the floor with task length, or drop the floor when the first candidate is clearly ahead of the field.
  - Files: src/decide.ts, config.json
- **AUD-CRD-002** do_not_use_when was a generic template string for nearly every card
  - Fix: Mine the negative triggers from the skill body and write them into do_not_use_when.
  - Sketch: Mine lines that match do not use, not for, and use X instead. Keep the template only as a last resort and mark it as generic so the gate can skip it.
  - Files: src/cardtext.ts, src/card.ts
- **AUD-INT-001** The whole module graph is wired, but the enforcement module is not
  - Fix: Wire harness.ts into the read path or delete it and drop the claim from AGENTS.md.
  - Sketch: Call checkHarnessManifest from the MCP tool that serves file reads, or publish the manifest for the host harness to enforce. If the host cannot enforce it, remove the enforcement claim from the guide.
  - Files: src/harness.ts, src/serve.ts, AGENTS.md
- **AUD-INT-003** A critic verdict overwrites the specialist verdict for the same skill
  - Fix: Key notes by skill id and role, and let compose read the specialist verdict as the primary one.
  - Sketch: notePath uses skill_id plus role. readNotes returns both, and compose prefers the specialist verdict, falling back to the critic verdict.
  - Files: src/council-store.ts, src/council.ts, src/council-compose.ts
- **AUD-RTE-003** Right card is top ranked but scores under the floor
  - Fix: Make the floor depend on task length, or lower it when the top candidate is clearly ahead of the field.
  - Sketch: Use a lower floor for tasks above 60 words, and keep pick_floor for the high confidence path.
  - Files: src/decide.ts, config.json
- **AUD-RTE-004** ASK outcome never takes the session lock, so no usage row is written
  - Fix: Record the ASK candidate as a provisional usage so the acceptance rate covers blocked decisions.
  - Sketch: Store the ASK top candidate in the session as pending_skill, and have phase_done write a usage row for it when no skill was locked.
  - Files: src/serve.ts, src/session.ts
