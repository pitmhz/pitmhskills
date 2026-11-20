# Label review of the long corpora

Date: 2026-11-10
Phase: 0 of `pitmhskills-implementation-phases.md`
Files reviewed: `evals/golden-long-digital-product.yaml`, `evals/golden-long-cybersec.yaml`
Label version after this review: **labels-v2**

## Why this review exists

A probe compared the lexical overlap of the expected card with the card the
router actually chose, for all 70 routed cases. Eleven cases had an expected
card whose text overlaps the task less than the router choice. Those eleven
were the suspects. This document records the verdict for each one.

Method per case:

1. Read the task text in full from the YAML.
2. Read the expected card and the router choice from `cards/<id>.json`
   (purpose, goal, use_when, do_not_use_when, disambiguator).
3. Read the raw `SKILL.md` when the card text left the purpose unclear.
4. Decide KEEP, FIX or AMBIGUOUS.

Verdict rules:

- **KEEP**: the expected card is the clearly right answer. The YAML is not
  changed.
- **FIX**: the expected card is plainly wrong for this task. The `expect`
  value is changed to the correct card id.
- **AMBIGUOUS**: the library holds two or more cards that both answer this
  task. The `expect` value stays as the first choice and a new key
  `expect_any` lists the other acceptable cards.

`expect_any` is never used to hide a wrong label. It only marks a real tie.

## The eleven cases

| Corpus | Case | Task in one line | Expected card | Router choice | Verdict | Reason | Change in the YAML |
| --- | --- | --- | --- | --- | --- | --- | --- |
| digital-product | 11 | Sign up, use twice, disappear, activation flat: fix with behaviour design and a habit loop | `skills__improve-retention` | `skills__grow-app` | AMBIGUOUS | Two retention cards answer it: improve-retention does the B=MAP diagnosis and activation, grow-app does the habit loop journey and runs improve-retention as its own phase 2. improve-retention is the closer fit for "diagnose and fix with behaviour design", and its trigger text matches the task word for word. grow-app is a valid answer because it covers the habit loop that improve-retention hands off to hooked-ux. | `expect_any: [skills__grow-app]` added. `expect` unchanged. |
| digital-product | 19 | Marketing site slow on mobile data: hero image, four fonts, blocking client component, CSP header, caching first | `web-quality__performance` | `supabase__supabase` | KEEP | web-quality__performance covers exactly the asked work: critical rendering path, image and font size, cache headers, third party scripts. The router choice is a Supabase card and has nothing to do with the task. | none |
| digital-product | 21 | Admin dashboard takes eleven seconds: request waterfall, dependency graph, re-render on filter change, build output | `addyosmani__performance-optimization` | `vercel__vercel-react-best-practices` | AMBIGUOUS | Both cards answer it. addyosmani gives the measure, find the bottleneck, fix, verify, guard method across the stack. vercel gives the React rules that match the three named symptoms: waterfalls, bundle size, re-render memoisation. The corpus notes already record this choice as deliberate. | `expect_any: [vercel__vercel-react-best-practices]` added. `expect` unchanged. |
| digital-product | 30 | Restructure public API docs that mix tutorials, how-to, reference and background into the right page types | `awesome-copilot__documentation-writer` | `addyosmani__code-simplification` | KEEP | The card is a Diátaxis expert and the task names the four Diátaxis page types. The router choice is a code clarity skill and cannot answer it. | none |
| digital-product | 32 | Run signup copy experiments: hypothesis, metrics, traffic needed, variants, stop early | `agent-toolkit__content-experimentation-best-practices` | `mengto-skills__pricing-page` | KEEP | The card covers experiment design, hypotheses, metrics, sample size and variants. The router choice is a pricing page layout skill and cannot answer it. | none |
| digital-product | 33 | Walk the local marketplace with a browser tool, report what broke, screenshot each failure | `anthropic__webapp-testing` | `mengto-skills__product-proof-saas` | KEEP | The card is the Playwright toolkit for testing a local web app and taking screenshots. The router choice is a landing page design skill and cannot answer it. | none |
| digital-product | 34 | Generate a Playwright test for the upgrade flow from the scenario, run it locally, wait on elements not timings | `awesome-copilot__playwright-generate-test` | `jakubkrehel-skills__break` | KEEP | The card generates a Playwright test from a scenario, which is the task in full. The router choice renders one component in every state and is a different job. | none |
| digital-product | 35 | Research plan before a sprint: research questions, survey, recruitment, usability test, analysis, artefacts, sample size | `design__software-ux-research` | `emilkowalski__improve-animations` | KEEP | The card holds survey design, research ops and usability testing guides, and the task asks for those artefacts. The router choice is a motion audit and cannot answer it. `cuellarfr-design__ux-research` stays the label for case 36, which asks for an interview guide instead of a survey. | none |
| cybersec | 1 | Full threat model of the webhook service: architecture diagram, trust boundaries, assets, abuse cases, all six STRIDE categories, ranked mitigations | `awesome-copilot__threat-model-analyst` | `openai__security-threat-model` | KEEP | The task asks for STRIDE by name, all six categories, a diagram and a ranked list. The card disambiguator says a full STRIDE-A model is this card and a concise repo grounded writeup is the other one. That other card is the label for case 2, which asks for a short document. | none |
| cybersec | 11 | Review the sign in and session code against current best practices: password storage, reset flow, token life, comparison, logging | `openai__security-best-practices` | `neondatabase__neon-auth` | KEEP | The card is the framework specific security review with findings by file and line. The router choice is a guide for adding Neon Auth to a new app, it is not a review, and the case stack has no Neon. That card is the label for case 10, which asks for a setup. | none |
| cybersec | 32 | Customer data deletion and export: data model, consent record, backups, analytics exports, data in logs | `awesome-copilot__gdpr-compliant` | `ponytail__ponytail-audit` | KEEP | The card applies GDPR practice to APIs, data models and logs. It is the only GDPR card in the library. The router choice is a whole repository quality audit and cannot answer it. | none |

## Totals

| Measure | Count |
| --- | --- |
| Suspects reviewed | 11 |
| Kept as is (KEEP) | 9 |
| Changed to another card (FIX) | 0 |
| Marked ambiguous (AMBIGUOUS) | 2 |
| Cases of the 80 that are now unambiguous | 78 |
| Cases of the 80 that carry an `expect_any` list | 2 |

No expected card was wrong. The probe found eleven cases where the router
chose a card that reads closer to the task text than the expected card, and in
nine of them the router choice is off topic for the task. Those nine are
router faults, not label faults. In two of them the library holds a real rival
and the task does not decide between the two, so the label now says so.

## What the bench does with the two ambiguous cases

The case shape is now `{task, expect, expect_any?, category, stack?}`.

- A case is a **hit** when the offered card is `expect`.
- A case is a **hitByAlternate** when the offered card is in `expect_any` and
  is not `expect`.
- A case is a **miss** in every other case that has a card.
- `top1` counts hits and hitByAlternate. `top1Strict` counts hits only.
- The per case list prints `hit=hit`, `hit=hitByAlternate` or `hit=miss`.
- The worst expected cards list does not count a case that an alternate
  satisfied as a failure of the expected card.
- The report meta holds `labels_version`. The text header prints it. Old and
  new numbers never mix.

## Bench numbers, before and after the relabel

Measured with the same router state for both runs. The two runs were made back
to back, and the `config.json` hash was the same before and after the pair.

| Measure | Before relabel | After relabel |
| --- | --- | --- |
| top1 | 21/80 (26.3%) | 21/80 (26.3%) |
| top1Strict | 21/80 (26.3%) | 21/80 (26.3%) |
| top1 on routed | 21/70 (30.0%) | 21/70 (30.0%) |
| hitByAlternate | 0/70 | 0/70 |
| picked | 22 | 22 |
| asked | 9 | 9 |
| abstained | 49 | 49 |
| falseAbstain | 48/70 | 48/70 |
| falsePick | 0/10 | 0/10 |
| wrongPick | 1/70 | 1/70 |
| nonePrecision | 8/10 | 8/10 |
| expectInTop3 | 42/70 | 42/70 |
| expectTop1 | 35/70 | 35/70 |

The relabel does not move the score at this router state. The router does not
pick `skills__grow-app` or `vercel__vercel-react-best-practices` here, so no
alternate is credited yet. The relabel only makes the label honest: when the
router does pick one of those two cards, the score now counts it and shows it
apart as `hitByAlternate`, so the report always states how much of the score
came from a rival.

The router cannot read the corpus files, so the corpus keys can never change
the picked, asked or abstained counts. Every number above is therefore equal
on both sides of the relabel by construction, and the measured pair confirms
it.

An earlier run of the same bench, taken before the router core change of the
same day, picked `skills__grow-app` for case digital-product#11 and reported
`hitByAlternate 1/70`. The counting path works on the real router.

## Note on the router state during this phase

The router core was under active change while this phase ran. `src/decide.ts`,
`src/route.ts` and `config.json` were edited by another agent between 18:08
and 18:36 local time on 2026-11-10, and the router database was rebuilt in the
same window. Bench numbers taken before and after those changes do not
compare, so every number in this document comes from one state. Two states
were measured in full:

| State | top1 | top1Strict | hitByAlternate |
| --- | --- | --- | --- |
| Router before the change of 18:36 | 18/80 (22.5%) | 18/80 (22.5%) | 0/70 |
| Router after the change of 18:36 | 21/80 (26.3%) | 21/80 (26.3%) | 0/70 |

In both states the relabel left the score unchanged, and `top1` equalled
`top1Strict` plus `hitByAlternate`.

