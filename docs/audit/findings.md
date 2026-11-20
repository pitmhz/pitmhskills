# Audit findings

Generated from `docs/audit/findings.json`. Do not edit by hand.

- Findings: 70
- Open 41, fixed 23, accepted 5, reported 1

## Index

| Id | Severity | Status | Area | Title |
| --- | --- | --- | --- | --- |
| AUD-BEN-002 | P0 | open | scoring | pick_floor of 80 is unreachable for long prompts, so a correct first candidate becomes ASK |
| AUD-BEN-003 | P0 | open | retrieval | Retrieval drops the correct card on long text before the scorer can see it |
| AUD-DLV-001 | P0 | open | delivery | Section packer scores only the first 400 bytes of a section |
| AUD-DLV-002 | P0 | open | delivery | Oversized top section is skipped instead of truncated |
| AUD-DLV-003 | P0 | open | delivery | Delivered body is never usable without a second fetch |
| AUD-DLV-004 | P0 | open | delivery | Confidence does not predict body quality |
| AUD-INT-002 | P0 | open | cards | Seven card fields are written and never read |
| AUD-RET-001 | P0 | open | retrieval | The Card v2 fields never reach the retriever |
| AUD-RET-002 | P0 | open | retrieval | Generic word mass pushes the right card out of the shortlist |
| AUD-RTE-002 | P0 | open | retrieval | Expected card is often not retrieved at all on long text |
| AUD-SCR-004 | P0 | open | scoring | The cover denominator is length dependent, so the right card scores below the floor on long prompts |
| AUD-BEN-001 | P0 | fixed | bench | Router picks the right skill on 1 of 80 realistic long prompts |
| AUD-RET-003 | P0 | fixed | retrieval | The query trim prefers the noise because rare and unknown words outrank the intent |
| AUD-RTE-001 | P0 | fixed | router | Every ABSTAIN with any candidate row forces a council |
| AUD-SEC-001 | P0 | fixed | enforcement | get_ref allowed path escapes |
| AUD-ANA-001 | P1 | open | analytics | Acceptance rate is polluted by harness sessions |
| AUD-ANA-002 | P1 | open | analytics | Harness runs write offer rows into the live analytics table |
| AUD-BEN-004 | P1 | open | scoring | The abstain floor of 45 is wrong for long prompts |
| AUD-BEN-008 | P1 | open | bench | One of seven long corpus cases carries a wrong or arbitrary label |
| AUD-BEN-009 | P1 | open | bench | The safety property was never actually tested |
| AUD-CRD-002 | P1 | open | cards | do_not_use_when was a generic template string for nearly every card |
| AUD-EVL-003 | P1 | open | eval | The eval top1 metric measures surfacing, not commitment |
| AUD-EVL-004 | P1 | open | eval | The eval metric treats a routed ASK as a hit and a NONE ASK as a miss |
| AUD-INT-001 | P1 | open | enforcement | The whole module graph is wired, but the enforcement module is not |
| AUD-INT-003 | P1 | open | council | A critic verdict overwrites the specialist verdict for the same skill |
| AUD-RTE-003 | P1 | open | scoring | Right card is top ranked but scores under the floor |
| AUD-RTE-004 | P1 | open | analytics | ASK outcome never takes the session lock, so no usage row is written |
| AUD-BEN-010 | P1 | fixed | bench | The threshold work has a measured ceiling of twenty of seventy |
| AUD-CNC-001 | P1 | fixed | council | Council spawn count exceeded the parallel limit |
| AUD-CNC-002 | P1 | fixed | council | Compose re-scored the shortlist instead of using the opened state |
| AUD-CNC-003 | P1 | fixed | council | Expiring deliberations were never cleaned |
| AUD-CRD-001 | P1 | fixed | cards | Card purpose was a 200 character description slice |
| AUD-CRD-005 | P1 | fixed | cards | Tier meant nothing because 91 percent of cards were tier B |
| AUD-ENF-001 | P1 | fixed | enforcement | The no direct scan rule was advisory only |
| AUD-EVL-001 | P1 | fixed | eval | Eval set was fitted to short prompts |
| AUD-RET-006 | P1 | accepted | retrieval | The two trim rules trade long-prompt coverage against one verbose case |
| AUD-SCR-001 | P1 | fixed | scoring | Unknown query words counted against a card at full strength |
| AUD-CRD-003 | P2 | open | cards | requires was empty for every templated card |
| AUD-DLV-005 | P2 | open | delivery | MORE line names at most five dropped sections |
| AUD-DLV-006 | P2 | open | cards | Card metadata disagrees with the file on disk |
| AUD-EVL-002 | P2 | open | eval | None precision on the tune set was 66.7 percent |
| AUD-INT-004 | P2 | open | router | The weights option on routeWith has no effect |
| AUD-INT-005 | P2 | open | router | The locked flag reports true when locking is off |
| AUD-INT-006 | P2 | open | council | Compose does not lock the skill it chose |
| AUD-INT-007 | P2 | open | scoring | The scoring arm ignores the configured query term count |
| AUD-INT-008 | P2 | open | router | The card cache stays stale after an in place card edit |
| AUD-INT-009 | P2 | open | delivery | Relative skill paths resolve against the server working directory |
| AUD-INT-010 | P2 | open | enforcement | The phase gate runs in the server working directory, not the task repository |
| AUD-INT-012 | P2 | open | process | Four config keys are never read and three are hardcoded elsewhere |
| AUD-INT-013 | P2 | open | process | The test runner collects the vendored skill packages |
| AUD-OPT-001 | P2 | open | router | Card and vector caches were keyed on row count only |
| AUD-SCR-003 | P2 | open | scoring | The generic word list almost never fires because the corpus is too large for the cut |
| AUD-BEN-005 | P2 | fixed | router | The router never commits to a wrong card on the long corpora |
| AUD-CNC-004 | P2 | fixed | delivery | Council and router delivered different body sizes for the same skill |
| AUD-CRD-004 | P2 | fixed | cards | One domain held 39 percent of the routable library |
| AUD-DEC-001 | P2 | fixed | router | pick_floor was dead code |
| AUD-DLV-007 | P2 | reported | cards | Some cards carry install instructions instead of a method |
| AUD-ENF-002 | P2 | fixed | enforcement | The phase gate ran a vacuous slop scan |
| AUD-OPT-002 | P2 | fixed | council | Council notes were written without a transaction |
| AUD-OPT-003 | P2 | fixed | process | Source files grew past the two hundred line limit |
| AUD-RET-004 | P2 | accepted | retrieval | A deeper retrieval pool buys correct commits until it starts buying wrong ones |
| AUD-RTE-005 | P2 | fixed | enforcement | Session lock is advisory, not enforced |
| AUD-RTE-006 | P2 | fixed | council | ASK outcome carries no council hint |
| AUD-TST-001 | P2 | accepted | eval | Two decide tests expect PICK but the router now asks |
| AUD-BEN-007 | P3 | open | process | The corpora notes file holds stale router numbers |
| AUD-INT-011 | P3 | open | router | Phase detection routes with the default session and takes the lock |
| AUD-TST-002 | P3 | open | cards | One card is stale against its upstream file |
| AUD-BEN-006 | P3 | accepted | router | The router is deterministic and order independent |
| AUD-RET-007 | P3 | fixed | retrieval | The retrieval pool size no longer changes any outcome |
| AUD-SCR-002 | P3 | accepted | scoring | Three signals ship disabled |

## analytics

### AUD-ANA-001 Acceptance rate is polluted by harness sessions

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | measured | 3 | probe |

Impact: The window showed an acceptance rate of 1.9 percent while the live probe slice was 12 of 12. Six hundred of six hundred and nineteen PICK offers came from eval and cover runs that never close a phase.

Evidence

- src/analytics-agg.ts - aggregate counts every session

Measurement: window acceptance versus live slice acceptance = 1.9 percent versus 100 percent (analytics run after an MCP probe)

Fix: Separate agent traffic from harness traffic in the aggregate.

Files: src/analytics-agg.ts

Sketch: Exclude session ids that start with eval, cover, calibrate, bench, or default. Add an agent_only flag and report both numbers.

### AUD-ANA-002 Harness runs write offer rows into the live analytics table

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | confirmed | 3 | analytics |

Impact: Harness runs write offer rows into the live analytics table. The flag that was meant to stop this only stops the older route_logs write, so every measurement pollutes the table it reads. This is the same defect as AUD-INT-016.

Evidence

- src/eval.ts - routeWith is called with log false in the golden sets
- src/eval.ts - runCoverage calls routeWith with log false, yet the table gained cover rows

Measurement: offer rows written by one eval run = 438 skill_offers rows plus 173 route_logs rows, because the offer writer ignores the log flag (integration audit row count plus bench observation of 240 rows per run)

Fix: Tag the source of each offer row and filter by source in the aggregate.

Files: src/analytics.ts, src/analytics-agg.ts, src/route.ts

Sketch: Add source values harness and agent. Pass harness from the eval and coverage call sites, agent everywhere else.

### AUD-RTE-004 ASK outcome never takes the session lock, so no usage row is written

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | confirmed | 3 | probe |

Impact: ASK is a blocking outcome but it does not lock a skill, so phase_done reports no active skill and writes no usage row. Acceptance analytics is blind on every ASK, which is 300 of 1274 offers in the measured window.

Evidence

- src/route.ts - lockSkill is called only on the PICK path
- src/serve.ts - recordUsage is skipped when there is no active skill

Measurement: usage rows from an ASK only probe run = 0 of 5 ASK outcomes (MCP probe)

Fix: Record the ASK candidate as a provisional usage so the acceptance rate covers blocked decisions.

Files: src/serve.ts, src/session.ts

Sketch: Store the ASK top candidate in the session as pending_skill, and have phase_done write a usage row for it when no skill was locked.

## bench

### AUD-BEN-001 Router picks the right skill on 1 of 80 realistic long prompts

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | fixed | measured | 3 | bench |

Impact: The threshold work fixed the part that thresholds could fix. Committed picks on the long corpora went from 1 to 18 of 70, wrong commits from 0 to 1, and false picks on out of scope cases stayed at 0. The measured ceiling for threshold work is 20 of 70, so the remaining 50 cases need the retrieval work tracked as AUD-RET-003.

Evidence

- src/bench.ts - overall top1 1/80 1.3 percent
- docs/audit/metrics.md - bench top1 1.3 percent against a tune baseline of 97.8 percent

Measurement: committed correct on the long corpora = 1 of 70 before, 18 of 70 after, with a measured ceiling of 20 (bench with the new decision rule at margin 15)

Fix: Done. The decision rule is now score at or above floor and margin at or above margin. The pick floor no longer gates a pick.

Files: src/decide.ts, config.json

### AUD-BEN-008 One of seven long corpus cases carries a wrong or arbitrary label

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | measured | 0 | review |

Impact: Eleven of the seventy routed cases name an expected card whose text overlaps the prompt less than the card the router chose. Some are rivals by design and the corpus has room for only one answer. Others look like mistakes. Until the labels are reviewed the bench number is a trend line and cannot be a pass gate.

Evidence

- evals/golden-long-digital-product.yaml - the performance case expects a card with overlap one while the router chose a card with overlap eleven
- evals/golden-long-cybersec.yaml - the gdpr case expects a card with overlap six while the router chose a card with overlap nine

Measurement: cases whose expected card has lower lexical overlap than the router's choice = 11 of 70, 15.7 percent (lexical overlap comparison over every miss)

Fix: Review every label, and let a case accept more than one skill when the library has rivals.

Files: evals/golden-long-digital-product.yaml, evals/golden-long-cybersec.yaml, src/bench.ts

Sketch: Add an expect_any list. The bench counts a hit when the offered card is in the list. Record the label version in the bench JSON so old and new numbers never mix.

### AUD-BEN-009 The safety property was never actually tested

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | measured | 1 | review |

Impact: The router never committed to a wrong card on the long corpora, and that was recorded as a safety property. In fact the router almost never committed at all, one pick in eighty. A property that was never exercised cannot be relied on, and it must not block the threshold work that turns the asks into picks.

Evidence

- docs/audit/metrics.md - wrong pick 0 of 70, false pick 0 of 10, picked 1 of 80

Measurement: picks made = 1 of 80 cases (bench)

Fix: Treat the safety claim as untested. Measure wrong picks after the threshold work, not before.

Files: src/bench.ts

Sketch: The bench must report wrong picks and false picks on every run so the property is measured once picks exist.

### AUD-BEN-010 The threshold work has a measured ceiling of twenty of seventy

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | fixed | measured | 1 | review |

Impact: The ceiling was measured at 20 of 70 for threshold work and the implementation reached 18 of 70 with 1 wrong commit. The margin of 15 was chosen over the margin of 10 because it trades one correct commit for three fewer wrong commits.

Evidence

- src/decide.ts:41 - the pick floor gate
- src/route.ts - the score and margin thresholds

Measurement: correct and wrong commits by margin = margin 10 gives 19 and 4, margin 15 gives 18 and 1, margin 18 gives 15 and 1 (margin sweep over the long corpora)

Fix: Write the measured ceiling into the phase gate so a missed gate means a real failure.

Files: src/decide.ts, config.json

Sketch: Gate the threshold phase at 19 of 70 correct, 0 false picks on out of scope cases and no more than 4 wrong picks.

## cards

### AUD-INT-002 Seven card fields are written and never read

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | confirmed | 3 | integration |

Impact: Seven card fields are written and never read: body_tokens, core_bytes, curated, keywords, when_not_to_use, example and counter_example. Two of them, curated and keywords, are dropped at the database boundary, so the router reads a card that is not the card the builder wrote. The keywords field alone holds about 26k topical terms that never enter the index. The full consequence is tracked as AUD-RET-001.

Evidence

- src/db.ts:104 - no column for curated and no column for keywords
- src/card.ts - the builder writes goal, when_to_use, provides, example and counter_example
- src/doctor.ts - the doctor re-reads the json from disk, so it disagrees with the router

Measurement: card fields with no reader = 7 fields, 2 of them lost at the database boundary (consumer search per field)

Fix: Give every field a consumer. The retrieval half is tracked as AUD-RET-001 and is a P0.

Files: src/db.ts, src/index.ts, src/lexicon.ts, src/deliver.ts, src/scoring.ts, src/gate.ts

### AUD-CRD-002 do_not_use_when was a generic template string for nearly every card

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | confirmed | 3 | audit |

Impact: The negative gate needs every token of the string to appear in the task, so a template such as tasks unrelated to general never fires. The negative filter was dead for most of the library.

Evidence

- src/card.ts - do_not_use_when template text for every new card
- src/gate.ts:26 - the negative match needs every token present

Fix: Mine the negative triggers from the skill body and write them into do_not_use_when.

Files: src/cardtext.ts, src/card.ts

Sketch: Mine lines that match do not use, not for, and use X instead. Keep the template only as a last resort and mark it as generic so the gate can skip it.

### AUD-CRD-001 Card purpose was a 200 character description slice

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | fixed | confirmed | 3 | audit |

Impact: Retrieval matched on thin frontmatter text, so cards scored on nothing.

Fix: Added Card v2 fields goal, when_to_use, when_not_to_use, provides, example, counter_example with an offline summarizer.

Files: src/types.ts, src/card.ts, src/db.ts, src/index.ts

### AUD-CRD-005 Tier meant nothing because 91 percent of cards were tier B

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | fixed | measured | 4 | audit |

Impact: Twenty tier A cards against two thousand one hundred and fifty three tier B cards gave the tier gate no power.

Measurement: tier A count = 20 before, 70 after (distribution scan)

Fix: Promoted curated cards that pass the tier A rule and raised tier A to seventy.

Files: cards/

### AUD-CRD-003 requires was empty for every templated card

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | audit |

Impact: The stack and file preconditions in the hard filter never fire, so the router offers skills for stacks the repo does not use.

Evidence

- src/card.ts - requires is an empty object for template cards
- src/gate.ts:14 - the stack and file checks read requires

Fix: Fill stack_any and files_any from the skill body and the repo it came from.

Files: src/cardtext.ts, src/card.ts

### AUD-DLV-006 Card metadata disagrees with the file on disk

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | probe |

Impact: core_bytes is used for budget decisions but is stale for some cards, so the packer makes size calls on wrong numbers.

Evidence

- cards/local__skill-router.json - core_bytes 1886 while the source file is 3664 bytes
- cards/local__tldraw-offline.json - core_bytes 31654 while the source file is 32299 bytes

Measurement: cards with core_bytes off by more than 200 bytes = 2 (compare card json to file size on disk)

Fix: Read the byte count from disk when the card is loaded, not from the stored number.

Files: src/deliver.ts, src/card.ts

Sketch: loadBody already reads the file, so use its byte length. Keep core_bytes only as a hint.

### AUD-CRD-004 One domain held 39 percent of the routable library

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | fixed | measured | 4 | audit |

Impact: A general bucket of 847 cards crowded the shortlist and made cluster arbitration meaningless.

Measurement: largest domain share of tier A plus B = 39 percent before, 24.7 percent after (distribution scan)

Fix: Assigned domains from the source provider and capped every domain at 25 percent.

Files: cards/, src/cardtext.ts

### AUD-DLV-007 Some cards carry install instructions instead of a method

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | reported | reported | 3 | probe |

Impact: If the claim holds, the expected answer for some tasks is a stub, and the router cannot be blamed for picking a thin card.

Evidence

- cards/design__dark-pattern-audit.json - named as the expected answer for a case where the body was unusable

Measurement: cards with install-first source = claimed 150 of 2176, not reproduced (file size check found 63 cards under 1500 bytes and 0 missing)

Fix: Check the claim per card, then either demote the stubs to tier C or point the card at the real method file.

Files: src/card.ts, cards/

Sketch: Classify a card as a stub when its source has no method heading and only install steps. Stubs become tier C so the router stops offering them.

### AUD-TST-002 One card is stale against its upstream file

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P3 | open | measured | 0 | audit |

Impact: cards --check reports one bad card, so the check exits with code 1 and blocks a clean gate run.

Evidence

- cards/local__tldraw-offline.json - stale: sha mismatch, needs re-review

Fix: Rebuild that card from the current source and review the text.

Files: cards/local__tldraw-offline.json

## council

### AUD-INT-003 A critic verdict overwrites the specialist verdict for the same skill

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | confirmed | 3 | integration |

Impact: Notes are keyed by skill id alone. The critic and the specialist both judge the same card, so the second write replaces the first and one verdict is lost. The role column is written and never read.

Evidence

- src/council-store.ts:79 - the note file name is the skill id
- src/council-store.ts:170 - the delete and insert use skill_id without the role

Measurement: notes keyed by skill id only = 1 key for 2 roles (code read)

Fix: Key notes by skill id and role, and let compose read the specialist verdict as the primary one.

Files: src/council-store.ts, src/council.ts, src/council-compose.ts

Sketch: notePath uses skill_id plus role. readNotes returns both, and compose prefers the specialist verdict, falling back to the critic verdict.

### AUD-CNC-001 Council spawn count exceeded the parallel limit

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | fixed | confirmed | 7 | audit |

Impact: A council of four plus a critic is five subagents while the project rule allows three at a time, so candidates were dropped for silence that was caused by the cap.

Fix: Added plan_batches with a maximum of three prompts per batch.

Files: src/council.ts, src/council-types.ts

### AUD-CNC-002 Compose re-scored the shortlist instead of using the opened state

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | fixed | confirmed | 7 | audit |

Impact: A config change or index rebuild between council and compose changed the order and the confidence.

Fix: Candidate scores are persisted at open time and compose reads them.

Files: src/council.ts, src/council-compose.ts, src/council-store.ts

### AUD-CNC-003 Expiring deliberations were never cleaned

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | fixed | confirmed | 7 | audit |

Impact: The prune query bound its parameter wrongly and matched no rows, so expired rows and note files stayed forever.

Fix: Fixed the prune query and call prune on route, compose and server start, plus a timer.

Files: src/council-store.ts, src/route.ts, src/council-compose.ts, src/serve.ts

### AUD-INT-006 Compose does not lock the skill it chose

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | integration |

Impact: After a council decides, the session has no active skill, so phase_done reports no active skill and no usage row is written. The acceptance rate stays blind on the council path.

Evidence

- src/council-compose.ts:146 - the chosen skill is written to the deliberation row only

Fix: Lock the chosen skill in the session when compose succeeds.

Files: src/council-compose.ts, src/session.ts

Sketch: compose takes the session id and calls lockSkill with the chosen id.

### AUD-OPT-002 Council notes were written without a transaction

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | fixed | confirmed | 7 | audit |

Impact: A crash between the file write and the database write left the verdict in one place only.

Fix: The file is written first and removed when the database write fails.

Files: src/council.ts, src/council-store.ts

### AUD-RTE-006 ASK outcome carries no council hint

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | fixed | reported | 3 | audit |

Impact: ASK now carries a council hint, so the contested path points at the same shortlist the council opens instead of only asking for a number.

Evidence

- src/route.ts - council_hint is set on the ABSTAIN path only

Fix: Done.

Files: src/route.ts

## delivery

### AUD-DLV-001 Section packer scores only the first 400 bytes of a section

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | confirmed | 3 | probe |

Impact: A section whose task words sit past byte 400 scores zero, so the packer can drop the section that actually answers the request and deliver a less relevant one instead.

Evidence

- src/deliver.ts:128 - const st = taskWords(s.slice(0, 400));
- src/deliver.ts:139 - const st = taskWords(p.slice(0, 400));

Measurement: more relevant section dropped than delivered = 10 of 11 clipped cases (real model probe, 15 sampled tasks)

Fix: Score the whole section text, not a 400 byte prefix.

Files: src/deliver.ts

Sketch: Use taskWords(s) over the full section; if that is too slow, raise the window to 2000 bytes and add a second pass over the tail.

### AUD-DLV-002 Oversized top section is skipped instead of truncated

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | confirmed | 3 | probe |

Impact: The most relevant section is also the largest, so the greedy loop drops it whole. The agent loses the method and keeps the preamble.

Evidence

- src/deliver.ts:166 - if (encS(cand) > cap) continue;

Measurement: cases where the top scoring section was absent from the body = 9 of 12 cards (section ranking versus delivered sections)

Fix: Truncate the top scoring section to the remaining budget instead of skipping it.

Files: src/deliver.ts

Sketch: When a section does not fit, cut it to the remaining bytes, mark it partial in the SECTIONS line, and stop adding further sections.

### AUD-DLV-003 Delivered body is never usable without a second fetch

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | measured | 3 | probe |

Impact: Zero of fifteen delivered bodies were usable as is, and zero of twelve bodies for the correct card were usable as is. The agent must always call get_ref before it can act, so the router adds a round trip on every task.

Evidence

- docs/delivery-effectiveness-2026-11-10.md - usable-as-is 0/15, needs-ref 4/15, unusable 11/15

Measurement: usable as is = 0 of 15 (real model judged each delivered body)

Fix: Deliver the goal plus the first complete method section, then raise the cap only if the body still fits.

Files: src/deliver.ts, src/deliver-cap.ts

Sketch: Split the budget: goal and core first, then one whole method section. Keep DELIVER_CAP 3000 as the default but allow a per card override for skills whose core is short.

### AUD-DLV-004 Confidence does not predict body quality

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | measured | 3 | probe |

Impact: All five delivered bodies cleared the abstain floor of 45 and every one was needs-ref or unusable. The agent trusts a high score and gets an unusable body, which is worse than an abstain.

Evidence

- src/route.ts - confidence comes from the score, no signal about body completeness

Measurement: high confidence but unusable body = 5 of 5 (probe of every PICK outcome)

Fix: Add a body coverage signal to the route result and to the gate.

Files: src/deliver.ts, src/route.ts

Sketch: loadBody returns a coverage flag: did a whole method section fit. route exposes body_complete. must_delegate becomes true when confidence is high but body_complete is false.

### AUD-DLV-005 MORE line names at most five dropped sections

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | probe |

Impact: A long skill lists a fraction of what was dropped, and seven dropped sections had no name at all across four cases, so the agent cannot ask for them.

Evidence

- src/deliver.ts:156 - const spill = items.filter((e) => !inDel.has(e)).slice(0, 5);

Fix: Name every dropped section, or state the count when the list is too long.

Files: src/deliver.ts

Sketch: Print all dropped labels when there are 12 or fewer, otherwise print the count and the first five.

### AUD-INT-009 Relative skill paths resolve against the server working directory

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | integration |

Impact: About 380 cards store a relative skill path. loadBody and the get_ref reader resolve them against the current working directory, so the body is missing unless the server happens to run from the repository root.

Evidence

- src/deliver.ts:85 - the path is used as given
- src/serve-ref.ts:11 - the same relative resolution

Measurement: cards with a relative skill path = about 380 of 2176 (path inspection over cards)

Fix: Resolve relative skill paths against the repository root.

Files: src/deliver.ts, src/serve-ref.ts, src/card.ts

Sketch: Store absolute paths in the card at build time, or resolve a relative path against the package root in the reader.

### AUD-CNC-004 Council and router delivered different body sizes for the same skill

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | fixed | confirmed | 6 | audit |

Impact: The router sent three thousand bytes and the council sent twenty thousand for the same card, so an agent got different guidance depending on the path.

Fix: One DELIVER_CAP of 3000 for both paths, complements stay at an 1800 byte guard.

Files: src/deliver.ts, src/route.ts, src/council.ts, src/council-compose.ts

## enforcement

### AUD-SEC-001 get_ref allowed path escapes

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | fixed | confirmed | 1 | audit |

Impact: The path check only removed dot dot sequences, so an absolute path or a drive letter resolved outside the skill directory.

Fix: Resolve the requested path against the skill directory and refuse anything outside it.

Files: src/serve.ts, src/serve-ref.ts

### AUD-INT-001 The whole module graph is wired, but the enforcement module is not

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | confirmed | 3 | integration |

Impact: src/harness.ts has no importer and no test. AGENTS.md names it as the enforcement path, so the documented no direct scan rule is not enforced anywhere. The other 63 modules are reachable.

Evidence

- src/harness.ts - no importer in src, no test references it
- AGENTS.md:9 - the enforcement line points at the harness manifest

Measurement: reachable modules = 51 of 64, with harness.ts the only fully dead module (importer analysis over src)

Fix: Wire harness.ts into the read path or delete it and drop the claim from AGENTS.md.

Files: src/harness.ts, src/serve.ts, AGENTS.md

Sketch: Call checkHarnessManifest from the MCP tool that serves file reads, or publish the manifest for the host harness to enforce. If the host cannot enforce it, remove the enforcement claim from the guide.

### AUD-ENF-001 The no direct scan rule was advisory only

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | fixed | confirmed | 8 | audit |

Impact: Nothing stopped an agent from reading every skill file, which is the fallback when the router abstains.

Fix: Added a harness manifest with a deny list, a deny logger, and gate fields on the route result.

Files: harness-manifest.json, src/harness.ts, src/route.ts, src/types.ts

### AUD-INT-010 The phase gate runs in the server working directory, not the task repository

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | integration |

Impact: phase_done runs the gate commands and the slop scan in the process working directory. The checks then run against the wrong tree and pass without proving anything about the task.

Evidence

- src/serve.ts:124 - runGates receives process.cwd()
- src/serve.ts:132 - the slop scan receives process.cwd()

Fix: Take the working directory from the phase or the session, not from the process.

Files: src/serve.ts, src/session.ts

Sketch: Store the cwd with the session when the phase starts, and use it in phase_done.

### AUD-ENF-002 The phase gate ran a vacuous slop scan

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | fixed | confirmed | 8 | audit |

Impact: phase_done always scanned zero files, so the gate always passed.

Fix: phase_done accepts touched_files and passes them to the scanner.

Files: src/serve.ts

### AUD-RTE-005 Session lock is advisory, not enforced

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | fixed | confirmed | 3 | audit |

Impact: The locked flag now reports the real state, and the block on a conflicting pick is driven by a separate lockConflict flag. A pick made with locking disabled no longer claims a lock it never took, and no longer tells the agent to wait for a phase that will never end.

Evidence

- src/route.ts - locked false with block_reason, the skill is still returned

Fix: Done.

Files: src/route.ts

## eval

### AUD-EVL-003 The eval top1 metric measures surfacing, not commitment

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | confirmed | 1 | review |

Impact: The eval counts a case as a hit when the returned skill id equals the expected card. An ASK returns the leader as its skill id, so an ASK with the right card counts as a hit even though the router never committed. The bench counts only committed picks. The two numbers can move in opposite directions, and the eval number was the green one while the router committed to the right skill on 1 of 80 long prompts.

Evidence

- src/eval.ts:134 - the hit test compares the returned skill id with the expected card
- src/bench.ts - the bench counts a pick only when the outcome is PICK

Measurement: tune top1 before the threshold work, and committed picks over the same cases = 97.8 percent top1 against 1 committed pick in 80 (eval and bench side by side)

Fix: Report three numbers everywhere: surfaced, committed, and committed correct.

Files: src/eval.ts, src/bench.ts

Sketch: Add a committed column to the eval table and print it next to top1. A green eval with a red committed count is the signal that the router is asking instead of acting.

### AUD-EVL-004 The eval metric treats a routed ASK as a hit and a NONE ASK as a miss

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | confirmed | 1 | review |

Impact: The metric property is confirmed and it changes how every rule must be judged. A routed case counts as a hit whenever the returned skill id equals the expected card, and both PICK and ASK return a skill id. A NONE case counts as a hit only on ABSTAIN, because only ABSTAIN returns a null skill id. Any rule that moves a case from ASK to ABSTAIN must be checked against all five strata and the long corpora at once.

Evidence

- src/eval.ts:134 - the hit test compares the returned skill id with the expected card
- src/route.ts - ASK returns the leader as skill_id, ABSTAIN returns null

Measurement: eval strata after an ask_min_margin of 3 = tune 96.7, heldout 94.4, verbose 92.9, paraphrase 96.0 against a baseline of 97.8, 97.2, 92.9 and 100 (eval run with the rule applied)

Fix: Make the eval report picks, asks and abstains separately, plus a committed-only hit rate.

Files: src/eval.ts

### AUD-EVL-001 Eval set was fitted to short prompts

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | fixed | measured | 2 | audit |

Impact: The tune set was short prompts only, so a change that broke long input still passed.

Measurement: verbose top1 = 71.4 percent before, 92.9 percent after (eval)

Fix: Added paraphrase, adversarial and verbose strata plus a tier A coverage gate.

Files: src/eval.ts, evals/golden-paraphrase.yaml, evals/golden-adversarial.yaml, evals/golden-verbose.yaml

### AUD-EVL-002 None precision on the tune set was 66.7 percent

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | measured | 3 | audit |

Impact: On the original tune set the router still picks a skill on one of three tasks that should abstain.

Evidence

- evals/golden.yaml - wordpress theme and CUDA kernel cases expect NONE

Measurement: tune none precision = 66.7 percent (eval)

Fix: Add a topic check for the whole task domain before a pick is confirmed.

Files: src/scoring.ts, src/collapse.ts

Sketch: Use the cluster and domain of the task words to reject a card whose domain never appears in the task.

### AUD-TST-001 Two decide tests expect PICK but the router now asks

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | accepted | measured | 5 | audit |

Impact: The tests still expect the old behaviour where a score above the floor was always a pick. The new rule asks the user when the score sits between floor and pick_floor.

Evidence

- tests/decide.test.ts:86 - expects PICK
- tests/decide.test.ts:98 - expects PICK

Fix: Update the two test expectations to ASK, or restore the old rule.

Files: tests/decide.test.ts

## process

### AUD-INT-012 Four config keys are never read and three are hardcoded elsewhere

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | integration |

Impact: top_k_retrieve, max_bytes, avg_bytes_target and fitted_at are never read. query_terms is read in one place and hardcoded in another, max_per_cluster has six fallback values of 3 and max_skills_per_task has two fallback values that disagree, 1 and 2. Editing the config gives the impression of control that does not exist.

Evidence

- config.json - top_k_retrieve, max_bytes, avg_bytes_target, fitted_at
- src/scoring.ts:43 - the term count literal

Fix: Read every config key in one place and remove the keys that mean nothing.

Files: config.json, src/db.ts, src/route.ts, src/retrieve.ts, src/scoring.ts, src/collapse.ts, src/council-compose.ts

Sketch: Load the config once into a typed object, delete the four dead keys, and replace every fallback literal with the loaded value.

### AUD-INT-013 The test runner collects the vendored skill packages

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | measured | 3 | integration |

Impact: Running the tests without a path collects the skill suites under skills, which fail on a missing vercel command and on path assumptions. The report reads 331 failures for a project with 2 real ones, so the signal is useless.

Evidence

- package.json - no test script that scopes to the project tests

Measurement: failures reported by the unscoped run against the scoped run = 331 failures against 2 (bun test tests/ compared with bun test over the whole tree)

Fix: Scope the test command to the project tests and make it the documented command.

Files: package.json, README.md, AGENTS.md

Sketch: Add a test script that runs bun test tests/ and point the guide at it.

### AUD-OPT-003 Source files grew past the two hundred line limit

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | fixed | confirmed | 9 | audit |

Impact: retrieve.ts, eval.ts, serve.ts, lexicon.ts and doctor.ts were over the limit.

Fix: Split into eval-parsers, retrieve-cache, lexicon-synonyms and serve-ref modules.

Files: src/eval-parsers.ts, src/retrieve-cache.ts, src/lexicon-synonyms.ts, src/serve-ref.ts

### AUD-BEN-007 The corpora notes file holds stale router numbers

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P3 | open | measured | 3 | bench |

Impact: The corpora notes report a top one of 7 of 36 and 13 of 34 for candidate one. The router now gives 13 of 36 and 23 of 34. A reader of the notes would draw the wrong conclusion.

Evidence

- evals/long-corpora-notes.md - router findings recorded before the final scoring and tier changes

Fix: Regenerate the numbers in the notes file from the bench report, or point the file at the bench output instead of repeating numbers.

Files: evals/long-corpora-notes.md

## retrieval

### AUD-BEN-003 Retrieval drops the correct card on long text before the scorer can see it

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | measured | 3 | bench |

Impact: Twenty nine of seventy routed cases never had the correct card in the shortlist. The rate of the correct card appearing first falls from 67.6 percent at 60 to 79 words to 22.2 percent at 120 words and above. A scoring change cannot recover a card that never entered the shortlist.

Evidence

- src/retrieve.ts - the query is trimmed to the 12 rarest terms before the FTS match
- src/scoring.ts - the denominator counts every query word including unseen ones

Measurement: expected card in the top three = 70.3 percent at 60 to 79 words, 33.3 percent at 120 words and above (bench word length buckets)

Fix: Score the intent clause of the request separately from the context, and stop trimming the query so hard on long input.

Files: src/retrieve.ts, src/scoring.ts, src/lexicon.ts

Sketch: Split the task into the first sentence and the rest. Retrieve with the first sentence plus the rare terms of the whole task. Add the intent score as its own signal so context words cannot dilute it.

### AUD-RET-001 The Card v2 fields never reach the retriever

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | confirmed | 2 | review |

Impact: Phase 3 of the repair added goal, when_to_use, provides and keywords to every card. The FTS index is built from five columns and does not include goal. The cover hay stack does not include goal. cardText does include goal, but it feeds only the vector arm whose weight is 0.05. The keywords field holds roughly 26k topical terms across the library and is dropped at the database boundary. The largest asset the card work produced is invisible to the router.

Evidence

- src/index.ts:21 - INSERT INTO cards_fts (id, purpose, use_when_text, domain, task_types)
- src/scoring.ts:81 - const hay = [c.purpose, c.use_when.join(" "), c.domain, c.task_types.join(" "), c.id...]
- src/lexicon.ts:149 - cardText includes c.goal, and feeds only the vector arm with weight 0.05

Measurement: terms added to the library and never indexed = about 26000 keyword terms across 2176 cards (read of the index insert, the hay stack and the card schema)

Fix: Put goal, when_to_use and keywords into the FTS index and into the cover hay stack.

Files: src/db.ts, src/index.ts, src/scoring.ts

Sketch: Add goal_text, when_to_use_text, provides_text and keywords_text columns with the migration pattern already in db.ts. Extend the FTS insert and drop and recreate cards_fts in buildIndex because the column set changed. Add goal and when_to_use to the hay stack in scoring.ts with purpose still first.

### AUD-RET-002 Generic word mass pushes the right card out of the shortlist

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | measured | 2 | review |

Impact: All 70 Tier A cards self-route at 100 percent on their own short intent. Padded to 85 words with distractor context they self-route at 70 percent. Across unrelated padded prompts the same generic cards take the top slots with identical scores, so the true card is pushed to rank two or three or out of the shortlist. The cause is the denominator and the generic list, not the query trim.

Evidence

- src/lexicon-stats.ts - the generic word list does not contain the words that carry the noise
- src/scoring.ts - the unknown word mass grows with prompt length

Measurement: tier A self route after padding = 70 of 70 short, 49 of 70 padded, 13 failures with the right card at rank one and 8 with it missing from the top three (padded self route probe over all Tier A cards)

Fix: Cap the contribution of a generic word and stop the unknown word mass from growing with prompt length.

Files: src/lexicon-stats.ts, src/scoring.ts

Sketch: Extend the generic list with team, deadline, budget, review, compliance, week, users, existing, codebase and work. Give a generic word a small fraction of a specific word. Make the unknown mass a function of the unseen content words and not of the prompt length.

### AUD-RTE-002 Expected card is often not retrieved at all on long text

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | measured | 3 | corpora |

Impact: On a 138 word accessibility audit the router returned nvidia__tao-train-reid at 24. The same task shortened to 21 words put the right cards at 79 and 65 in the shortlist. Long input loses the card entirely, so no scoring fix can recover it.

Evidence

- evals/golden-long-digital-product.yaml - WCAG 2.2 audit case, 138 words

Measurement: abstain rate on long corpora = 30 of 40 per corpus (corpora build with the real router)

Fix: Stop trimming the query to the rarest 12 terms when the task is long, and rank on the intent clause first.

Files: src/retrieve.ts, src/scoring.ts

Sketch: Raise query_terms for long tasks, or score the first sentence separately and add its score as a separate signal so intent is never diluted by context words.

### AUD-RET-003 The query trim prefers the noise because rare and unknown words outrank the intent

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | fixed | measured | 2 | review |

Impact: The FTS query no longer fills its slots with words the corpus has never seen. The known trim puts the terms the corpus holds first, so the intent survives a padded request. The rule is configurable because the known trim and the rare trim trade one verbose case against three long-prompt commits, and the choice must be re-measured when the corpus changes.

Evidence

- src/retrieve.ts:79 - trimToRarest sorts by descending idf and slices the first n
- src/lexicon-stats.ts:52 - a term unknown to the corpus returns maxIdf, the highest score possible
- src/retrieve.ts:119 - the MATCH gets the trimmed terms joined by OR

Measurement: long corpus commits under each trim rule = known 22 commits, rare 19 commits, both with 1 wrong (trim rule probe)

Fix: Done. matchTerms for the FTS query, trimToRarest for the scoring denominator, match_trim in the config to switch between them.

Files: src/retrieve.ts, src/route.ts, config.json

### AUD-RET-006 The two trim rules trade long-prompt coverage against one verbose case

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | accepted | measured | 2 | review |

Impact: The known trim and the rare trim give identical results on all five short golden sets. They differ on long prompts and on one verbose case: the known trim wins 33 of 80 long hits and 22 commits against 30 and 19 for the rare trim, and loses one verbose case, 12 of 14 against 13 of 14. The trade is one case in fourteen against three long-prompt commits. The known trim is shipped because the long corpora are realistic traffic and the short sets are the tuned ones.

Evidence

- src/retrieve.ts:153 - the MATCH uses matchTerms by default and trimToRarest when match_trim is rare
- src/route.ts:74 - the route passes match_trim from the config

Measurement: long corpus hits and commits under each trim rule = known 33 hits and 22 commits, rare 30 hits and 19 commits, both with 1 wrong commit (trim rule probe over every golden set with the decision rule held fixed)

Fix: Shipped with match_trim known. The rule stays configurable so the trade can be re-measured when the corpus changes.

Files: config.json, src/retrieve.ts, src/route.ts

### AUD-RET-004 A deeper retrieval pool buys correct commits until it starts buying wrong ones

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | accepted | measured | 2 | review |

Impact: The earlier measurement showed a deeper pool buying three more correct commits and it was applied. Re-measured on the current code, every pool setting from 40 to 80 produces identical outcomes, and the deeper pool only costs latency. The pool stays at 40 with a cluster cap of 8. The gain was an artefact of the pre-trim-split retrieval.

Evidence

- config.json:6 - score_pool 40 and max_per_cluster 8
- src/collapse.ts:120 - the shortlist caps candidates per cluster

Measurement: hits and picks at pool 40, 60 and 80 = 201 hits and 138 picks at every setting (pool probe on the current code)

Fix: Reverted to score_pool 40 and max_per_cluster 8. Tracked as AUD-RET-007.

Files: config.json

### AUD-RET-007 The retrieval pool size no longer changes any outcome

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P3 | fixed | measured | 2 | review |

Impact: An earlier sweep on the pre-trim-split code showed a deeper pool buying three more correct commits, so the pool was raised to 80 with a cluster cap of 32. Re-measured on the current code, pool 40 with cap 8, pool 60 with cap 16 and pool 80 with cap 32 all produce byte-identical outcomes: 201 of 253 hits, 138 picks, 1 wrong commit. The only difference is latency, 248 ms at p50 for pool 40 against 285 ms for pool 80 and 309 ms for pool 60. The pool was reverted to 40 with cap 8.

Evidence

- config.json:6 - score_pool 40 and max_per_cluster 8
- src/collapse.ts:120 - the shortlist caps candidates per cluster

Measurement: hits, picks and wrong commits at three pool settings = 201, 138 and 1 at every setting, with p50 latency 248, 309 and 285 ms (pool probe on the current code across every golden set)

Fix: Reverted to score_pool 40 and max_per_cluster 8. The earlier gain was an artefact of the pre-trim-split retrieval and did not survive the change.

Files: config.json

## router

### AUD-RTE-001 Every ABSTAIN with any candidate row forces a council

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | fixed | confirmed | 3 | probe |

Impact: A council is now opened only when the best near candidate reaches the near_floor of 27. Below that bar the router reports that the agent may proceed bare, so ordering a pizza no longer opens a skill council. The dead proceed_bare_allowed branch now has a live path.

Evidence

- src/route.ts:83 - const near = ranking.slice(0, 3).map((r) => ({ id: r.id, score: r.score }));
- src/route.ts:89 - must_delegate is set true whenever candidates exist

Measurement: false blocks on out of scope tasks = 0 of 10 in the bench, down from a forced council on every one (bench with the new gate)

Fix: Done. The near_floor bar lives in src/route-abstain.ts.

Files: src/route.ts, src/route-abstain.ts, config.json

### AUD-INT-004 The weights option on routeWith has no effect

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | integration |

Impact: The config weights are merged after the caller weights, so config always wins. Any sweep or experiment that passes weights at call time measures the config values instead.

Evidence

- src/route.ts:41 - cfg.weights overrides o.weights in the merge order

Fix: Let the caller weights win over the config weights.

Files: src/route.ts

Sketch: Merge as default weights, then config weights, then the caller weights.

### AUD-INT-005 The locked flag reports true when locking is off

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | integration |

Impact: With lock false the result still reports locked true, so a harness that reads the flag cannot tell whether a skill was locked or not.

Evidence

- src/route.ts:128 - locked is set to true before the lock check

Fix: Report the real lock state.

Files: src/route.ts

Sketch: Set locked to false when doLock is false, and to the result of lockSkill otherwise.

### AUD-INT-008 The card cache stays stale after an in place card edit

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | integration |

Impact: The cache key is the row count plus the largest hash. An edit that keeps the row count and does not touch the largest hash leaves a stale card in memory. The earlier fix for the count only cache was not enough.

Evidence

- src/retrieve-cache.ts:12 - the key is count and max hash

Fix: Key the cache on a content digest that changes when any card changes.

Files: src/retrieve-cache.ts

Sketch: Use a checksum over all row hashes, or the database change counter, or an explicit cache invalidation call from the index builder.

### AUD-OPT-001 Card and vector caches were keyed on row count only

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 1 | audit |

Impact: An edit that keeps the row count left the cache stale. The fix moved the key to count plus the largest hash, which still misses an in place edit of any card that is not the largest. The defect is not closed.

Fix: Key the cache on a digest that changes when any card changes. Tracked as AUD-INT-008.

Files: src/retrieve-cache.ts

### AUD-BEN-005 The router never commits to a wrong card on the long corpora

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | fixed | measured | 3 | bench |

Impact: The property is now measured instead of assumed. With the threshold work the router commits on 19 of the 80 long cases, one of them on the wrong card, and never on an out of scope case. The safety property holds and it is backed by a number.

Evidence

- docs/audit/metrics.md - wrong_pick 0 of 70, false_pick 0 of 10

Measurement: wrong commits and false picks after the threshold work = 1 of 70 wrong commits and 0 of 10 false picks (bench with the new decision rule)

Fix: Measure wrong picks after the threshold work. Keep the number reported on every bench run.

Files: src/bench.ts

### AUD-DEC-001 pick_floor was dead code

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | fixed | confirmed | 1 | audit |

Impact: Two consecutive pick conditions made the configured pick_floor of 80 a no-op.

Fix: PICK now requires pick_floor, and a score between floor and pick_floor becomes ASK.

Files: src/decide.ts

### AUD-INT-011 Phase detection routes with the default session and takes the lock

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P3 | open | confirmed | 3 | integration |

Impact: detectPhases calls route with the default session, so any plan call locks the shared default session and writes a route log for a probe.

Evidence

- src/plan.ts:17 - route is called without a session id

Fix: Give detectPhases a session id and a no lock flag.

Files: src/plan.ts, src/route.ts

### AUD-BEN-006 The router is deterministic and order independent

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P3 | accepted | measured | 3 | bench |

Impact: Eighty cases run twice in the same order and once in reverse produced zero differences in outcome, skill, confidence, margin and candidate order. Three separate bench runs gave identical reports.

Evidence

- src/bench.ts - second pass same order checked 80 mismatches 0, reverse order checked 80 mismatches 0

Measurement: determinism mismatches = 0 of 80 in both directions (bench determinism pass)

Fix: No action. Keep the determinism pass in the bench so a future change cannot break it silently.

Files: src/bench.ts

## scoring

### AUD-BEN-002 pick_floor of 80 is unreachable for long prompts, so a correct first candidate becomes ASK

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | measured | 3 | bench |

Impact: Nineteen cases had the correct card as candidate one with a score between the floor of 45 and the pick floor of 80. The router asked the user instead of picking. The pick floor was fitted on ten word prompts and no longer fits.

Evidence

- config.json:4 - pick_floor 80
- src/decide.ts - a score between floor and pick_floor returns ASK

Measurement: correct first candidate that became ASK = 19 cases, plus 16 more that fell under the floor (bench score analysis)

Fix: Make the pick floor relative: a clear first candidate with a margin above the runner up should pick, whatever the absolute score.

Files: src/decide.ts, config.json

Sketch: Pick when score is at or above floor and the margin over the runner up is at least the margin value, or when the score is at or above pick_floor. Lower pick_floor for long tasks.

### AUD-SCR-004 The cover denominator is length dependent, so the right card scores below the floor on long prompts

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P0 | open | measured | 3 | review |

Impact: The denominator counts the idf mass of every query word, so it grows with the prompt. The right card's cover collapses from 0.904 on the tune set to 0.215 on long-d and 0.210 on long-c, while a wrong card on the same prompts holds 0.113 and 0.182. The right card and a wrong card are nearly indistinguishable on a long prompt, and both sit far below the floor of 45. An intent-clause cover separates them: on long-d the right card has a median intent cover of 0.273 against 0.091 for a wrong card, and on long-c 0.222 against 0.111.

Evidence

- src/scoring.ts:102 - the denominator is the idf mass of every query content word
- src/scoring.ts:144 - cover is matchedMass over the denominator

Measurement: cover and intent cover for candidate 1, right card against wrong card = cover: 0.904 against 0.000 on tune, 0.215 against 0.113 on long-d. intent cover: 0.875 against 0.000 on tune, 0.273 against 0.091 on long-d (denominator probe across every golden set)

Fix: Add an intent-clause signal: score the card against the first sentence of the request, not against the whole prompt, and give that signal its own weight.

Files: src/scoring.ts, src/scoring-types.ts, src/weights.ts

Sketch: Extract the intent clause as the first sentence or the first 12 content words. Compute its cover against the card. Add it as a separate signal with its own weight so a long prompt cannot bury it under the whole-prompt denominator. Do not use it as a gate: a flat cover floor of 0.35 keeps 137 of 162 right cards and drops 4 of 37 wrong ones, but it would also drop 7 of 21 NONE cases, so it belongs in the score, not in the threshold.

### AUD-BEN-004 The abstain floor of 45 is wrong for long prompts

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | measured | 3 | bench |

Impact: Sixteen cases had the correct card as candidate one and scored between 27 and 44, under the floor of 45, so the router abstained even though it had the right card in front of it.

Evidence

- config.json:2 - floor 45

Measurement: correct first candidate below the floor = 16 cases, scores 27 to 44 (bench score analysis)

Fix: Scale the floor with task length, or drop the floor when the first candidate is clearly ahead of the field.

Files: src/decide.ts, config.json

### AUD-RTE-003 Right card is top ranked but scores under the floor

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | open | measured | 3 | corpora |

Impact: The expected card is the best candidate and the router still abstains, for example vercel__deploy-to-vercel at 39 against a floor of 45. The floor is set for short prompts and is wrong for long ones.

Evidence

- config.json:2 - floor 45

Measurement: expected card rank when not picked = rank 1 in the false abstain cases (corpora build)

Fix: Make the floor depend on task length, or lower it when the top candidate is clearly ahead of the field.

Files: src/decide.ts, config.json

Sketch: Use a lower floor for tasks above 60 words, and keep pick_floor for the high confidence path.

### AUD-SCR-001 Unknown query words counted against a card at full strength

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P1 | fixed | measured | 5 | audit |

Impact: A long prompt with many unseen words pushed coverage under the floor even when the core words matched perfectly.

Measurement: verbose top1 = 71.4 percent before, 92.9 percent after (eval)

Fix: Capped the unknown word mass at min of maxIdf and 4, and aligned the retrieve trim with the scoring denominator.

Files: src/scoring.ts, src/retrieve.ts, src/lexicon.ts

### AUD-INT-007 The scoring arm ignores the configured query term count

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | confirmed | 3 | integration |

Impact: config query_terms is 12 and retrieve honours it, but scoring hardcodes 12. A configuration change moves one arm and not the other, and the two arms then disagree about the query.

Evidence

- src/scoring.ts:43 - the term count is a literal
- config.json:6 - query_terms 12

Fix: Pass the configured term count into the scoring arm.

Files: src/scoring.ts, src/decide.ts, src/route.ts

### AUD-SCR-003 The generic word list almost never fires because the corpus is too large for the cut

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P2 | open | measured | 2 | review |

Impact: A term is generic when more than 18 percent of cards hold it, which is 391 cards in a library of 2176. Only 12 of the 7036 terms in the corpus reach that bar, so the generic penalty and the generic-only factor almost never apply. The words that actually carry the noise in a long request, deadline, quarter and budget, are rare in the corpus, so they are treated as specific and are handed the highest IDF.

Evidence

- src/lexicon-stats.ts:35 - the generic cut is 18 percent of the corpus
- src/scoring.ts:92 - the generic-only factor multiplies the score

Measurement: terms inside the generic cut = 12 of 7036, with a cut at document frequency 391 (corpus document frequency scan)

Fix: Treat a request filler word as generic by the way it is used, not by how many cards hold it.

Files: src/lexicon.ts, src/lexicon-stats.ts

Sketch: Add a request-filler list for the words a long prompt uses as padding: team, deadline, budget, quarter, week, codebase, contractor, instructions, wording, internal. Cap the contribution of a term on that list to a fraction of a specific term.

### AUD-SCR-002 Three signals ship disabled

| Severity | Status | Confidence | Phase | Found by |
| --- | --- | --- | --- | --- |
| P3 | accepted | confirmed | 5 | audit |

Impact: PRIMARY_DEFAULT_BONUS is zero, variant_unclaimed is zero, and position_decay was zero. Position decay is now used. The other two stay off because earlier measurement said they hurt.

Evidence

- src/weights.ts:45 - DEFAULT_WEIGHTS with primary and variant signals off

Fix: Revisit with the new corpus and the fitted weights before changing anything.

Files: src/weights.ts
