# Audit findings

Generated from `docs/audit/findings.json`. Do not edit the markdown files by hand.
Change the JSON, then run `bun src/audit-report.ts`.

## Files

| File | What it holds |
| --- | --- |
| `findings.json` | The source of truth. Every finding, its evidence, its measurement, and its fix. |
| `findings.md` | Every finding, grouped by area, with evidence and fix sketch. |
| `open-issues.md` | The work queue. Open P0 and P1 only, in fix order. |
| `metrics.md` | Every measured number with its baseline. |
| `findings.csv` | Flat table for a spreadsheet. |

## Summary

- Findings: 70
- Open: 41
- Fixed: 23
- Accepted on purpose: 5
- Reported but not reproduced: 1

## How to read

Severity

| Level | Meaning |
| --- | --- |
| P0 | Blocks correct behaviour on real traffic |
| P1 | Degrades accuracy or safety on a large share of tasks |
| P2 | Local defect, small share of tasks or cosmetic cost |
| P3 | Cleanup, no behaviour change |

Status

| Value | Meaning |
| --- | --- |
| open | Not fixed yet |
| fixed | Fixed and verified in this program |
| accepted | Known, accepted on purpose |
| reported | Claimed by a source but not yet verified in code |

Confidence

| Value | Meaning |
| --- | --- |
| confirmed | Reproduced in code with a file and line reference |
| measured | Confirmed by a benchmark number |
| reported | Stated by a source, not independently reproduced |

## Rules for adding a finding

1. One id per finding. The prefix is the area: `AUD-RTE` router, `AUD-DLV` delivery, `AUD-SCR` scoring, `AUD-CRD` cards, `AUD-CNC` council, `AUD-ANA` analytics, `AUD-EVL` eval, `AUD-ENF` enforcement, `AUD-TST` tests, `AUD-OPT` cleanup, `AUD-DEC` decisions, `AUD-BEN` benchmark, `AUD-INT` integration.
2. Evidence needs a file and a line. A claim without a file reference is status `reported`, not `confirmed`.
3. A fix needs the files it touches. The generator prints them in the work queue.
4. Status `fixed` only after the check that proves it passes.

## Check

```
bun src/audit-report.ts --check
```

Exit code 1 means a generated file is out of date.
