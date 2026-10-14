# Token benchmark: rtk vs caveman (Phase 2 measurement)

Date: 2026-10-14. Decision input only — no source, card, config, or verify-command changes.
Token proxy = bytes/4. Fixtures generated locally, no network. rtk 0.50.0 via global-hook
equivalent subcommands. `eval`, `index`, `cards`, `calibrate` were NOT run.

Note: the plan file on disk describes Phase 2 as the `doctor` command; this measurement
was executed per the orchestrator's Phase 2 task (rtk-vs-caveman decision). No `doctor`
code was written here.

## Results

| command class | raw (B) | raw (~tok) | rtk (B) | rtk (~tok) | rtk-ultra | caveman (B) | winner |
|---|---|---|---|---|---|---|---|
| A. failing test run (`bun test` 40 tests, 8 fail) | 8,609 | 2,152 | 1,326 | 332 | same | 8,776 passthrough | keep rtk |
| B. app log (800 mixed INFO/WARN/ERROR lines) | 66,487 | 16,622 | 1,665 | 416 | same | 66,656 passthrough | keep rtk |
| C. large JSON (1,387 card rows, 1.4 MB) | 1,457,169 | 364,292 | 590 | 148 | same | 1,457,342 passthrough | keep rtk (schema only, see loss) |
| D. recursive grep (`rg route` src+skills+hooks, 35,472 matches) | 7,420,079 | 1,855,020 | 25,417 | 6,354 | same | n/r (passthrough confirmed) | keep rtk |
| E. unified diff (67-line diff) | 4,071 | 1,018 | 1,584 | 396 | same | 4,238 passthrough | keep rtk |
| F. recursive listing (cards/) | 172,342 | 43,086 | N/A (no `ls` binary on Windows) | — | — | n/r | adopt nothing |

n/r = not run. rtk used per class: `test`, `log`, `json`, `rg`, `diff`.

## Information-loss spot checks (winner only)

- A (`rtk test`): all 8 failing case names visible; expect-diffs shown for 5 of 8,
  then `... +12 more`. Passing-test console noise stripped (desired). Counts
  (32 pass / 8 fail) preserved. Verdict: failures visible, minor stack truncation.
- B (`rtk log`): 800 lines -> 23. Header keeps counts (133 err / 133 warn / 401 info).
  WARN deduped with `x6` multipliers. ERRORs all "unique" (per-line span ids vary),
  so only 10 sampled + `+123 more`. Temporal order lost (grouped by severity).
  Verdict: counts intact, individual error instances beyond the sample hidden.
- C (`rtk json`): `count: 1387` preserved; schema/keys shown for first card only,
  remaining 1,386 rows collapsed (`... +1386 more`) — per-card file names LOST.
  Verdict: fine for "what shape is this JSON", WRONG tool for enumerating names.
- D (`rtk rg`): header `35472 matches in 943 files` preserves totals; file paths
  intact; match lines context-truncated with `...`; capped at 200 shown lines.
  Part of the byte win is stripping rg's ANSI color escapes present in raw.
  Verdict: counts/paths intact, long-line content truncated.
- E (`rtk diff`): 67 -> 22 lines; every changed line kept with `-`/`+`; file header
  `(+12 -9)` preserved; hunk headers and unchanged context dropped, so output is
  NOT applicable as a patch. Verdict: "what changed" intact, patch-use lost.
- `--ultra-compact` changed nothing (0 byte delta) on all 5 classes; flags accepted
  but inert here.

## Caveman reachability

CLI reachable via `npx -y @caveman-ai/cli@latest` (network OK). BUT `shrink -- <cmd>`
compresses nothing in this environment: every run returns the input byte-for-byte
plus a ~170 B JSON trailer stating
`"ratio":0, "note":"engine unavailable; passthrough — run 'caveman setup'"`.
The compression engine needs `caveman setup --install` (extra binaries, out of scope
for this phase). Effective verdict: **caveman UNAVAILABLE as a compressor here**.
No stacking risk materializes (nothing to stack — it only adds the trailer).

Platform caveat: `rtk grep` and `rtk ls` do not work on this Windows host
(no `grep`/`ls` binaries on PATH); `rtk rg` is the working grep-class equivalent.

## Per-class verdicts

- test output: keep rtk (`rtk test`). Never stack.
- log output: keep rtk (`rtk log`). Never stack.
- large JSON: keep rtk for schema questions; for name enumeration use raw
  (rtk drops row identity). Never stack.
- recursive grep: keep rtk (`rtk rg`). Never stack.
- diff: keep rtk (`rtk diff`). Never stack.
- directory listing: adopt nothing (rtk `ls` nonfunctional on Windows; revisit only
  if the hook host changes).

## Overall conclusion

**Adopt nothing.** rtk wins every measurable class by 6x-2500x; caveman's shrink is
passthrough without its (uninstalled) engine. No source, card, config, or verify
command was changed in this phase. Fixtures and raw/rtk/caveman captures live under
`$TEMP\pitm-bench` (throwaway, not committed).
