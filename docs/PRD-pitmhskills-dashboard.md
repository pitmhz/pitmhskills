# PRD: pitmhskills Dashboard — Local Console for the Skill Router

Audience: an AI coding agent (Claude Code) executing this in one session, possibly resumed after a context cut.
Owner: Matt. Repo: `pitmhskills`. Goal unchanged: **find the one most suitable skill via the router.** The dashboard exists to keep the library, the cards, the mandate and the router honest. It does not replace the router.

---

## 0. Agent brief (rules of engagement)

1. **The codebase is a hypothesis.** The prior audit (787 skills, 4 JSON files, ~850-line `resolve_skill.py`, no abstention, 10.3 KB always-on) may be stale or already fixed. Phase 0 re-measures everything. Build only what the real repo supports.
2. **No evidence, no feature.** Every feature in section 3.4 is gated by a capability flag proven in `RECON.md` with a command and output excerpt. A flag without evidence is `false`. A false flag renders a disabled control with a one-line reason, never a fake or stubbed behavior.
3. **Do not decide the path where this PRD decides.** Stack, folders, tokens, screens and slice order are fixed below. You may vary only where a decision table says "if X then Y".
4. **Controlled reboot, not restart.** Existing scripts and data files are called through the adapter and never rewritten. If a UI or server already exists in the repo, audit it, then apply the matrix in section 10.
5. **Context is scarce.** Never `cat` a large file. Never read skill bodies in bulk. Use bounded commands (`wc -c`, `jq 'length'`, `head -c 1500`). Read only the PRD section for the current slice.
6. **Use the repo's own router for design decisions** (section 7). Log every call. One skill per slice.
7. **Do not ask the user questions** except the two in section 11.5. Record everything else under `BLOCKED` in `RECON.md` and continue.
8. The app must run after every slice. Commit after every slice: `dash: <slice>`. Do not push. The UI itself never runs `git commit`.

---

## 1. Execution Card (re-read this after any context compaction)

```
READ ORDER   dashboard/PROGRESS.md -> this card -> only the § of the current slice
STACK        Node 20+, TypeScript. Server: Hono. Web: Vite + React + Tailwind + shadcn/ui. One package.json in dashboard/.
LOCATION     dashboard/server/  dashboard/web/  dashboard/.state/ (gitignored)
ROUTER       called via execFile + --json. Never imported. Command is discovered in RECON.md.
CAPS         <=200 lines per file. <=3,600 source lines total (shadcn-generated web/src/ui excluded). <=12 runtime deps. <=250 KB gz JS initial.
SCRIPTS      npm run dev | start (build + serve on 127.0.0.1) | check (typecheck + build + smoke + line cap)
SLICES       S0 shell+recon -> S1 overview+library -> S2 playground -> S3 write core -> S4 inspector edit
             -> S5 AGENTS.md editor -> S6 ingest+triage -> S7 clusters+eval -> S8 hardening
PER SLICE    1) route design query (§7)  2) build  3) `npm run check`  4) update PROGRESS.md  5) commit
WRITES       dry-run -> diff -> confirm -> backup to .state/trash -> atomic write -> post-step -> changelog
NEVER        auth, accounts, cloud, analytics, CDN assets, shell strings, new top-level folders, parallel eval sets
IF STUCK     mark BLOCKED in RECON.md, disable the control with a reason, move to the next slice
CUT LINE     the repo must be runnable and committed after S1, S2, S5 and S8; if limits hit, stop at the last green slice
```

---

## 2. Goals and non-goals

### Goals
| # | Goal | Measured by |
|---|------|-------------|
| G1 | See the true state of the library in under 10 seconds | Overview scorecard loads, recomputed live from the repo |
| G2 | Answer "why was this skill picked, and why not the others" in 2 clicks | Playground shows decision, candidates, drops, bytes |
| G3 | Ingest, freeze, edit and delete skills without touching JSON by hand | Every write has diff + undo |
| G4 | Edit the mandate (AGENTS.md and the agent files it feeds) with a byte meter | Budget bar, lint, drift check |
| G5 | Turn every wrong pick into a regression case in one click | "Add to eval set" in Playground |
| G6 | Move one domain slice at a time to "stable" | Slice readiness checklist |
| G7 | Look like a tool made with taste, not a template | Design QA checklist (section 12.2) ≥ 18/20 |

### Non-goals
Auth or accounts. Remote access. Skill authoring from scratch. A chat panel. Per-model settings. Cloud sync. Telemetry. Theming options. Charts library. Mobile layout. Anything that edits the router's scoring logic.

---

## 3. Phase 0 protocol: reconnaissance (do this first, spend ≤ 15% of effort)

### 3.1 Bounded commands (run all, record excerpts ≤ 3 lines each)
```
git rev-parse --show-toplevel; git status --short | wc -l; git ls-files | wc -l
ls -1 | head -40
find . -maxdepth 3 \( -name 'package.json' -o -name 'pyproject.toml' -o -name 'requirements*.txt' \) -not -path './node_modules/*' | head
find . -name 'SKILL.md' -not -path './node_modules/*' | wc -l
find . -maxdepth 3 -name '*.json' -size +20k -not -path './node_modules/*' -exec wc -c {} + | sort -n | tail -8
find . -maxdepth 3 \( -name 'AGENTS.md' -o -name 'CLAUDE.md' -o -name '.cursorrules' -o -name 'GEMINI.md' -o -name 'copilot-instructions.md' \) -not -path './node_modules/*'
ls scripts 2>/dev/null | head -40
grep -rIl --include='*.py' --include='*.ts' --include='*.js' --include='*.sh' -e 'route' -e 'resolve' . 2>/dev/null | grep -v node_modules | head -15
```
For each large JSON, inspect shape only: `jq -c 'if type=="array" then {len:length, first:(.[0]|keys)} else {keys:(keys|.[0:12])} end' FILE | head -c 600`.

### 3.2 Router discovery (mandatory)
1. Find the script that takes a task and returns skills (candidates: `resolve_skill*`, `route*`, `router*`).
2. Run it on these three fixed queries and capture output shape (≤ 1.5 KB each):
   - `"add scroll animation to a landing page"`
   - `"quantum chromodynamics simulation"`
   - `"wordpress theme development"`
3. Record: `ROUTER_CMD` (argv array), `HAS_JSON_OUTPUT`, `HAS_ABSTAIN` (does the 2nd or 3rd query ever return nothing/ABSTAIN?), `RETURNS_LIST` (more than 1 skill returned).
4. If there is no `--json` mode: the **only** permitted change to an existing script is adding a `--json` flag that prints the already-computed result as JSON. List it in `RECON.md`. No scoring or ranking changes.
5. If no router is discoverable: set `HAS_ROUTER=false`, build everything except Playground and the design-routing protocol, and use section 6 as the sole design authority.

### 3.3 Measurements the Overview must reproduce live
| Metric | How to compute (adapter does this server-side, cached by file mtime) |
|--------|-----------------------------------------------------------------------|
| Skills total / per tier or status | count SKILL.md files joined to cards/catalog |
| Without provenance | skills with no provenance record |
| Blocklisted / frozen | blocklist and tier C counts |
| Stale cards | stored sha != sha256 of SKILL.md (if cards exist) |
| Missing mandatory card fields | validator output, or fields present in ≥ 95% of observed cards |
| Always-on bytes | sum of bytes of the generated mandate per agent file (min / max) |
| Avg and max bytes per task | run up to 12 fixed queries from the eval set through the router, measure delivered bytes; cache until library or config mtime changes |
| Skills per task | same run |
| Abstention | share of out-of-domain eval queries that return nothing (needs `HAS_ABSTAIN`) |
| Eval status | last stored result of the repo's benchmark, with timestamp (never auto-run on page load) |

### 3.4 Capability flags and feature gating
Record each flag in `RECON.md` as `FLAG = true|false — evidence: <cmd> -> <excerpt>`.

| Flag | True when | Gates |
|------|-----------|-------|
| HAS_ROUTER | router runs and returns skills | Playground, design-routing protocol |
| HAS_JSON_OUTPUT | router emits JSON (or flag added) | Playground detail |
| HAS_ABSTAIN | router can return no skill | ABSTAIN outcome UI, abstention KPI |
| HAS_CARDS | one JSON card per skill exists | Schema-driven inspector, stale detection |
| HAS_TIERS | cards or catalog carry tier/status | Tier controls, Freeze, triage default |
| HAS_CLUSTERS | cluster data exists | Clusters screen |
| HAS_PROVENANCE | provenance records exist | Provenance filters, ingest provenance write |
| HAS_BLOCKLIST | blocklist file exists | Blocklist badge, ingest conflict check |
| HAS_REBUILD | a script rebuilds derived files (catalog, index) | Every write post-step |
| HAS_VALIDATE | a validator or drift check exists | Write verification |
| HAS_BENCH | benchmark script exists | Eval run |
| HAS_MANDATE_GEN | a generator writes agent files | AGENTS.md editor mode A |
| HAS_GIT | `.git` exists | Dirty-tree banner |

Rule: a write operation whose post-step (`HAS_REBUILD`, `HAS_VALIDATE`) is false is **disabled**, because an unverified write to a router library is how it got polluted in the first place. Exception: AGENTS.md text edit and eval-case append need no post-step.

### 3.5 Prior audit findings → features (build the corrective feature only if re-measured as still true)
| Prior finding | Confirm by | Feature if confirmed | If already fixed |
|---------------|------------|----------------------|------------------|
| No abstention, always returns 3 | query 2/3 above return a skill | Playground banner "legacy: no abstention", `LEGACY_LIST` rendering, abstention cases in eval | skip banner; show ABSTAIN as a normal outcome |
| Functional redundancy (GSAP triple-load) | Playground returns ≥ 2 same-topic skills | Clusters screen, "same-job candidates" panel | clusters screen only if `HAS_CLUSTERS` |
| 684 skills without provenance | Overview metric | Provenance filter, triage queue seeded with them, bulk freeze | none |
| Role taxonomy non-discriminating | distribution of role values | **Do not build a role filter.** Filter by domain/slice | none |
| 10.3 KB always-on, 56 KB avg per task | measured bytes | Byte meters (AGENTS.md editor, Playground) with red threshold | keep meters, green state |
| Four JSON files in sync | file discovery | Adapter reads them, writes only through the repo's rebuild step; never writes derived files | same |
| `strength` barely moves ranking | not a UI concern | **Do not build a strength editor** | none |

### 3.6 `dashboard/RECON.md` template (create it, ≤ 120 lines)
```
# RECON
## Repo facts          (language(s), package managers, skill count, big files)
## Flags               (13 flags, each with evidence)
## Adapter map         (contract function -> real file/command; rebuild_cmd; validate_cmd; ingest_cmd; bench_cmd; mandate source/generator; agent files list)
## Schema discovered   (card fields: name, type, required?, observed in N% of cards)
## Slice key           (first existing of: domain, categories[0], role) -> chosen: ...
## Findings vs prior audit  (confirmed / fixed / n-a, with numbers)
## Blocked             (feature, reason, what would unblock it)
## Decisions           (anything chosen under an "if X then Y" rule)
```

---

## 4. Architecture

```
 browser (React SPA, hash router)
        │  JSON over HTTP, same origin, write-token header
        ▼
 dashboard/server (Hono, 127.0.0.1 only)
   routes/*  ──►  core/ (pure functions: read, plan, apply)  ──►  adapter/ (the only code that knows the repo)
                                                                      │ reads JSON/MD files directly
                                                                      │ execFile(router|rebuild|validate|ingest|bench, argv[])
                                                                      ▼
                                                                  the pitmhskills repo
```

### 4.1 Layout
```
dashboard/
├─ package.json  tsconfig.json  vite.config.ts  .gitignore
├─ RECON.md  PROGRESS.md  ROUTING_LOG.md  README.md (≤ 40 lines)
├─ .state/                      # gitignored: trash/, changes.jsonl, jobs/, cache/, tmp/, token
├─ server/
│  ├─ index.ts                  # Hono app, static serving, security middleware (≤ 120)
│  ├─ adapter/                  # repo.ts exec.ts skills.ts router.ts mandate.ts ingest.ts eval.ts schema.ts
│  ├─ core/                     # plan.ts apply.ts diff.ts trash.ts changes.ts audit.ts
│  └─ routes/                   # one file per resource, ≤ 80 lines each
└─ web/
   ├─ index.html  src/main.tsx  src/app.tsx
   ├─ src/ui/                   # shadcn components actually used (see 4.4)
   ├─ src/lib/                  # api.ts route.ts format.ts keys.ts
   ├─ src/features/             # overview/ library/ inspector/ playground/ agents/ ingest/ triage/ clusters/ eval/
   └─ src/styles/tokens.css
```

### 4.2 API contract (server → UI). Every endpoint returns 501 `{blocked_by: FLAG}` when its flag is false.
| Method + path | Purpose | Notes |
|---------------|---------|-------|
| GET `/api/capabilities` | flags + slice key + schema | UI reads once at start; drives all gating |
| GET `/api/audit` | metrics in 3.3 | cached by mtime; `?fresh=1` recomputes |
| GET `/api/skills` | summary rows | query: `q, slice, tier, provenance, stale, page, size≤100`; **never includes bodies** |
| GET `/api/skills/:id` | card, section index, body preview ≤ 4 KB | full body only via `?raw=1`, capped 200 KB |
| POST `/api/skills/:id/plan` | dry-run of any edit/freeze/tier/delete | returns `{diff, warnings, will_run:[post-steps]}` |
| POST `/api/skills/:id/apply` | apply a plan by `plan_id` | executes write protocol (section 5) |
| POST `/api/trash/:ts/restore` | undo a delete or edit | |
| POST `/api/ingest/preview` | UI-side temp clone, list SKILL.md found | needs explicit click; github.com HTTPS only |
| POST `/api/ingest/commit` | import selected, default tier C | job |
| POST `/api/route` | `{task, cwd?}` → normalized result | see 4.3 |
| POST `/api/eval/cases` | append `{task, expect, split}` | `expect` = skill id or `NONE` |
| POST `/api/eval/run` | job | needs `HAS_BENCH` |
| GET `/api/jobs/:id` | status + last 2 KB of log | polled every 800 ms |
| GET / PUT `/api/mandate` | text, byte count, lint, agent file list | PUT = plan; apply through `/apply` |
| GET / PUT `/api/config` | floor, margin, budget bytes | only fields that exist in the repo's config |
| GET `/api/changes` | last 100 changelog entries | |

### 4.3 Normalized route result (UI never sees the router's raw shape)
```ts
type RouteResult = {
  outcome: "PICK" | "ASK" | "ABSTAIN" | "LEGACY_LIST";   // LEGACY_LIST: router returned a list with no decision
  picks: { id: string; score: number | null; tier?: string; cluster?: string; reason?: string; bytes?: number }[];
  question?: string;                                      // for ASK
  dropped?: { id: string; why: string }[];                // gate drops, collapsed variants
  bytes_total: number | null;
  skills_loaded: number;
  raw_excerpt: string;                                    // first 2 KB of raw stdout, shown on demand
};
```

### 4.4 Dependencies (hard cap 12 runtime)
Server: `hono`, `@hono/node-server`, `zod`. Web: `react`, `react-dom`, `lucide-react`, `diff`, `clsx`, `tailwind-merge`, plus the Radix packages that the shadcn components below pull in. shadcn components allowed: button, input, textarea, select, badge, table, dialog, sheet, tabs, tooltip, sonner, command, checkbox, switch, separator, scroll-area. Nothing else. No router library (use a 30-line hash router), no data-fetching library, no state library, no chart library, no icon font.
Fonts: Geist Sans + Geist Mono via `@fontsource-variable/*` (verify names with `npm view`; fallback IBM Plex via `@fontsource/*`). No CDN, no network at runtime.

---

## 5. Write protocol (every mutation, no exceptions)

1. **Plan.** `core/plan.ts` computes the change without touching disk and returns `plan_id`, a unified diff, and warnings.
2. **Confirm.** The UI always shows the diff and the post-steps that will run. Destructive actions require typing nothing but must be a separate, explicit button; bulk actions show the count and the first 5 ids.
3. **Backup.** Affected files are copied to `.state/trash/<timestamp>/` preserving relative paths. Delete = move there. Purge is a separate action and only available from the Trash view.
4. **Atomic write.** Write temp file, `rename`. JSON is written with the file's existing indentation and key order so diffs stay minimal and deterministic.
5. **Post-steps.** Run `rebuild_cmd`, then `validate_cmd` (argv arrays, 60 s timeout, output capped at 64 KB).
6. **Verify or revert.** If validation fails, restore from the backup automatically and show the validator output.
7. **Log.** Append one JSON line to `.state/changes.jsonl`: time, op, ids, files, sha before/after, post-step exit codes.

Security:
- Bind `127.0.0.1` only. Reject requests whose `Host` or `Origin` is not `127.0.0.1:<port>` or `localhost:<port>`. No CORS.
- A random write token is created at start, stored in `.state/token`, injected into the served `index.html`, and required on every non-GET.
- All paths are resolved and must stay inside the repo root; reject `..`, absolute paths, symlinks leaving the root.
- Subprocesses via `execFile(argv[])` only. Never a shell string. Only the commands recorded in `RECON.md`.
- Body limit 1 MB. Ingest clones only `https://github.com/<owner>/<repo>` URLs, shallow, into `.state/tmp/`, deleted after commit or after 30 minutes.
- Show a banner when `HAS_GIT` and the working tree has uncommitted changes in touched files ("3 files modified — git is your undo of record").

---

## 6. Design system (this is the taste enforcement; it overrides any routed skill)

Direction: **quiet instrument panel.** A dense, calm operator console for someone who will read numbers all day. Warm neutrals, one accent, hairline borders, tabular numerals, monospace for ids and bytes. It should feel closer to a well-made terminal tool than a SaaS template.

### 6.1 Tokens (`web/src/styles/tokens.css`, CSS variables, light and dark, follow `prefers-color-scheme`)
| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--bg` | `#F7F6F3` | `#121212` | app background |
| `--surface` | `#FFFFFF` | `#191919` | panels, drawer |
| `--surface-2` | `#EFEDE8` | `#222222` | table header, inputs |
| `--line` | `#E1DED7` | `#2C2C2C` | 1px borders (no shadows except overlays) |
| `--ink` | `#1A1A18` | `#ECEAE4` | primary text |
| `--ink-2` | `#5E5C55` | `#A19E95` | secondary text |
| `--accent` | `#B4410F` | `#E0662E` | primary action, focus ring, selection only |
| `--ok` | `#2F6B3F` | `#6FB482` | pass, within budget |
| `--warn` | `#8A6100` | `#D9A441` | stale, near budget |
| `--bad` | `#A12A2A` | `#E27D7D` | fail, over budget, destructive |
Contrast: body text ≥ 4.5:1, large text and UI borders ≥ 3:1 in both themes. Verify with a script that computes ratios for the token pairs; do not eyeball.

### 6.2 Type, space, shape
- Sans: Geist 14 px / 20 px for body, 13 px for table cells, 12 px labels, 20 px / 28 px page titles. No type size above 24 px.
- Mono: Geist Mono for skill ids, bytes, scores, commands. `font-variant-numeric: tabular-nums` on every number.
- Space: 4 px grid. Page padding 24. Panel padding 16. Table row 36 px. Control height 32 px.
- Radius: 6 px controls, 8 px panels. Borders over shadows. Overlays (drawer, dialog) get one soft shadow.
- Icons: lucide, 16 px, stroke 1.5. Icons accompany text; icon-only buttons need a tooltip and aria-label.
- Motion: 120–160 ms ease-out for drawer, dialog, toast, row highlight. Nothing else moves. Respect `prefers-reduced-motion`.

### 6.3 Component rules
- **Tier chips** differ by shape and text, never by color alone: `A` solid ink fill, `B` 1px outline, `C` dashed outline and dimmed. Stale adds a small warn dot.
- **Byte meter**: horizontal bar, label `612 / 600 B`, `ok` under 80% of budget, `warn` 80–100%, `bad` over. Numbers in mono.
- **Decision badge** (Playground): `PICK` ink fill, `ASK` accent outline, `ABSTAIN` neutral outline, `LEGACY_LIST` warn outline with tooltip.
- **Tables**: sticky header, no zebra, hover row `--surface-2`, selected row has a 2 px accent bar on the left. Right-align numbers. Row click opens the drawer; checkbox column for bulk.
- **Drawer** 480 px, right, closes on `Esc`, focus trapped, returns focus to the originating row.
- **Empty states** always name the next action ("No stale cards. Last checked 14:02. Run recheck.").
- **Errors** say what failed, why, and what to do, with the first 3 lines of validator output expandable.
- **Copy**: sentence case, no exclamation marks, no emoji, no "Oops", units on every number, verbs on every button ("Freeze 12 skills", not "OK").

### 6.4 Anti-slop list (a violation is a bug)
Gradients as decoration. Glassmorphism. Purple or blue-violet accents. Centered hero blocks. Card-inside-card. Emoji as icons. Decorative illustrations. Fake or lorem data. Rounded-full everything. Drop shadows on every card. More than one accent color. Animated numbers. Placeholder charts. Tooltips as the only place information lives.

### 6.5 Accessibility floor
Everything operable by keyboard with visible `:focus-visible` ring (2 px accent, 2 px offset). Semantic table markup with `scope`. Form labels bound to inputs. Dialog and sheet use the shadcn/Radix focus management. Status is never color-only. Minimum hit target 32 px. Desktop-first at ≥ 1024 px; between 768 and 1023 the left rail collapses to icons.

---

## 7. Design skill routing protocol (use pitmhskills to design pitmhskills)

Before building each slice, route its design task through the repo's own router and apply the result. This is also a live test of the router.

### 7.1 Procedure
1. Run `ROUTER_CMD` with the slice's query from 7.2 (JSON mode if available).
2. **Take rank 1 only.** If the router returns a list, ignore ranks 2+ and any "recommended" extras. If it returns `ASK`, do not wait: log it and use the primary candidate.
3. **Sanity gate.** Rank 1's name or description must contain at least one of: `ui`, `ux`, `design`, `dashboard`, `table`, `form`, `layout`, `component`, `frontend`, `accessibility`, `css`, `tailwind`, `react`. If not, treat the outcome as ABSTAIN.
4. **Read budget.** Read the chosen skill with `head -c 8192`. If it has named sections, read only the sections that match the slice. Never open a second skill.
5. **Precedence.** Section 6 tokens and rules win over the skill. The skill supplies technique (hierarchy, density, interaction patterns), not palette, fonts or layout skeleton.
6. On ABSTAIN or router failure: proceed with section 6 only.
7. Append one entry to `dashboard/ROUTING_LOG.md`:
```
## S2 playground — 2026-11-11
query: <exact query>
outcome: PICK|ASK|ABSTAIN|LEGACY_LIST|ERROR
rank1: <id> (score <n|null>)  sanity: pass|fail
used: <id> sections: <list>   bytes read: <n>
note: <one line: what from the skill changed a decision, or "none">
```
If `note` is "none" for a slice, say so honestly. Do not invent influence.

### 7.2 Slice queries (exact strings, do not rephrase)
| Slice | Query |
|-------|-------|
| S0 shell + tokens | `design an app shell and design tokens for a dense local developer tool dashboard with sidebar navigation` |
| S1 overview + library | `design a dense data table with filters, bulk actions and a detail side drawer for managing a catalog` |
| S2 playground | `design a query tester that shows a decision, ranked candidates with explanations, and a byte budget` |
| S4 inspector edit | `design schema-driven edit forms with inline validation and a diff review before saving` |
| S5 AGENTS.md editor | `design a plain text config editor with a live size budget meter, lint results and diff preview` |
| S6 ingest + triage | `design a multi-step import wizard with dry-run preview and conflict detection, and a keyboard-driven review queue` |
| S7 clusters + eval | `design a grouping editor for related items and a metrics dashboard with pass fail targets` |
| S8 QA | `review a developer dashboard for accessibility, visual hierarchy and consistency` |

S3 (write core) is server-only and has no design query.

---

## 8. Screens and flows

App shell (all screens):
```
┌────────────┬────────────────────────────────────────────────────────────────┐
│ pitmhskills│ Slice: [ frontend-motion ▾ ]   ⌘K search skills       router ●ok │
│            ├────────────────────────────────────────────────────────────────┤
│ Overview   │ Ingest ▸ Triage ▸ Cluster ▸ Verify ▸ Publish      (pipeline bar)│
│ Library    ├────────────────────────────────────────────────────────────────┤
│ Playground │                                                                │
│ Triage  684│                       screen content                           │
│ Clusters   │                                                                │
│ Eval       │                                                                │
│ Mandate    │                                                                │
│ Trash    3 │                                                                │
│ Changes    │                                                                │
└────────────┴────────────────────────────────────────────────────────────────┘
```
Rail badges are live counts. The slice selector scopes Library, Triage, Clusters and Eval. `All` is a valid slice.

### 8.1 Overview
Purpose: the audit, live. Layout: row of 6 metric tiles (Skills, Returnable, No provenance, Stale, Always-on bytes, Avg bytes/task), each with the target and a pass/warn/fail state; below it **Next action** (one card) and **Slice readiness** list.
- **Next action** is deterministic. Pick the first true row: (1) validator failing, (2) stale tier A cards, (3) skills returnable without provenance, (4) eval below target for the active slice, (5) mandate over budget, (6) unreviewed skills in slice, (7) "All green for <slice>. Mark stable." The card has one primary button that deep-links to the right screen with filters preset.
- Metrics that need a missing flag show `—` and the reason on hover, not `0`.

### 8.2 Library
```
 Search [______]  Tier [All▾] Provenance [All▾] Stale [☐]  Selected 0   [Freeze] [Delete…]
 ┌──┬──────────────────────────────┬──────┬────────────┬───────────┬────────┬───────┐
 │☐ │ id                           │ tier │ domain     │ cluster   │ bytes  │ state │
 ├──┼──────────────────────────────┼──────┼────────────┼───────────┼────────┼───────┤
 │☐ │ gsap-animation-helper        │  A   │ motion     │ gsap-scroll│ 12,404│  ok   │
 │☐ │ cinematic-gsap-lenis-…       │  B   │ motion     │ gsap-scroll│ 22,130│ stale │
 └──┴──────────────────────────────┴──────┴────────────┴───────────┴────────┴───────┘
                                                         page 1/8   ‹ ›
```
Columns come from the discovered schema; defaults shown above, others toggle via a column menu. Server-side paging, 100 rows. Sort by any column. URL hash stores filters so a view is linkable. Keyboard: `/` focus search, `j/k` move, `Enter` open drawer, `x` select, `f` freeze, `Esc` close.

### 8.3 Skill inspector (drawer, 480 px)
Tabs: **Card** · **Body** · **Routing** · **History**.
- **Card**: schema-driven form (8.4). Mandatory fields marked, validation inline, `Save…` opens the diff dialog (write protocol). Quick actions row: Freeze/Unfreeze, Change tier, Delete.
- **Body**: read-only preview ≤ 4 KB with section index. `Edit raw` opens a monospace textarea; saving shows a warning "This changes the file hash and marks the card stale".
- **Routing**: "Test this skill": editable list of 5 queries; for each, runs the router and shows whether this skill was picked. Also lists the queries in the eval set that expect this skill and their last result.
- **History**: filtered changelog entries for this skill with Restore.

### 8.4 Schema-driven forms (adaptive core)
The form is generated from `/api/capabilities → schema`, not hard-coded. Widget by type: string → input; long string → textarea; `string[]` → chip list with add/remove/reorder; enum → select; boolean → switch; number → input; reference (`cluster`, `pairs_with`) → combobox over existing ids; nested object → JSON textarea with parse check. Known field names get tuned labels and help text (`use_when`: "Situations where this is the best choice", `do_not_use_when`: "Situations where another skill or none is better"). Unknown fields still render. Required status comes from the validator or the 95% rule in RECON.

### 8.5 Playground (the most important screen)
```
 Task  [ add scroll animation to a landing page                              ]  [Route]
 Repo  [ . ▾ ]                                                  router: json, 1.2 s

 ┌ Decision ───────────────────────────────────────────────────────────────────┐
 │ [PICK]  gsap-animation-helper     score 158   tier A   cluster gsap-scroll   │
 │ why:    matches "scroll animation"; variant cinematic-… not chosen            │
 │ delivered  12.4 KB ▕████████░░░░▏ cap 20 KB     skills loaded 1               │
 └──────────────────────────────────────────────────────────────────────────────┘
 Candidates                                  Dropped / collapsed
  1 gsap-animation-helper        158  A       cinematic-gsap-lenis…  variant: not editorial
  2 gsap-scrolltrigger-story…    156  B       cudaq-guide            do_not_use_when: physics
  3 cinematic-gsap-lenis…        144  B

 Was this right?  [Yes]  [No, expected: [ skill id or NONE ▾ ] ]  → [Add to eval set]
```
- Outcomes: `PICK`, `ASK` (shows the question and two answer buttons that re-run with the answer appended), `ABSTAIN` (neutral card: "Router found no suitable skill"), `LEGACY_LIST` (warn banner "Legacy router: returns a list, no decision. Only rank 1 is used by agents following the mandate.").
- Without `HAS_JSON_OUTPUT`, show raw excerpt only and disable detail panels.
- "Add to eval set" appends one case (`split` defaults to `train`, a toggle sets `heldout`). Held-out cases are never used by any calibration the UI triggers.
- History of the last 20 queries kept in `.state/` only.

### 8.6 Mandate editor (AGENTS.md and agent files)
Mode is decided in RECON:
- **Mode A (`HAS_MANDATE_GEN`)**: edit the generator's source text, never the generated files. `Apply` runs the generator, then the drift check, and shows each agent file's new byte size.
- **Mode B (no generator)**: edit `AGENTS.md` directly. A checklist lists the other agent files discovered in recon; ticking them writes the same text (with backup and diff per file).
```
 Mandate (source: scripts/gen_mandate.py template)           Targets: 14 files ☑ all
 ┌──────────────────────────────────────────────┐  Budget  ▕██████░░░░▏ 412 / 600 B  ok
 │ Before any build task, run `pitmh route "…"` │  Lint
 │ Use only the skill it returns. If ABSTAIN …  │   ✓ contains the route command
 │                                              │   ✓ no instruction to list/search/open skills
 └──────────────────────────────────────────────┘   ✓ under 1 KB hard cap
 [ Diff ]  [ Revert to last saved ]                   ✗ pasted skill content detected
 Drift: 0 files out of sync                                                 [ Apply… ]
```
Lint rules (deterministic, string-based): must contain the discovered router command; must not match `/(load|read|list|search|open).{0,20}(all|every|skills?)/i` as an instruction; line count ≤ 12; no markdown headings beyond one title; no code block longer than 3 lines; bytes ≤ hard cap. Errors block Apply; warnings do not. Budget numbers come from config if present, else 600 B target and 1 KB cap.

### 8.7 Ingest wizard (3 steps)
1. **Source**: input for `https://github.com/<owner>/<repo>` or a local path inside the repo's allowed import dir; optional ref (branch/tag/sha; default pinned to the resolved HEAD sha, shown). Button: `Preview` (this is the only point where the network is used; the URL is shown beside the button).
2. **Review**: table of SKILL.md found: id, detected license, size, duplicate-of (by hash), blocklist hit, existing-id collision, frontmatter valid. Default selection excludes duplicates, blocklisted, invalid and unlicensed rows, each exclusion explained. Counts summary on top.
3. **Commit**: shows destination, default tier (C if `HAS_TIERS`), the post-steps, and the pinned source ref. If `HAS_TIERS` is false, an extra required checkbox: "These skills become routable immediately (no staging exists)". Progress as a job with log tail. Result screen lists imported ids with a button "Open in Triage".
Commit prefers the repo's `ingest_cmd` with a selection; if it cannot take one, the adapter copies the selected files into the repo's existing layout and writes the provenance record. Both paths run the same post-steps.

### 8.8 Triage queue
One skill at a time, keyboard-first. Left: queue (filtered by slice, seeded by "no provenance", "unreviewed", "stale"). Center: card form + body preview. Right: **same-cluster neighbours** (top 5 by the repo's own similarity if exposed, else lexical id/description overlap) so the reviewer decides primary vs variant with context. Keys: `a` accept to A, `b` accept to B, `f` freeze (C), `d` delete (to trash), `s` skip, `j/k` navigate, `e` edit field focus. Tier A acceptance is blocked until mandatory fields (`do_not_use_when`, `scope`, `use_when`, `cluster`) are filled, with the missing ones highlighted. Progress bar: "37 of 684 reviewed in <slice>".

### 8.9 Clusters (`HAS_CLUSTERS`)
List of clusters with members as rows (role: primary | variant). Actions: set primary, move member, split, merge, edit `pick_over_primary_when` per variant. A **Candidates** tab proposes unclustered pairs from the repo's overlap report (if present) for approval. Every cluster must have exactly one primary; the save is blocked otherwise.

### 8.10 Eval and Config
- **Eval**: cases table (task, expect, split, last result), run button (job; needs `HAS_BENCH`), metrics vs targets (top-1, wrong-variant, abstention precision, bytes avg/max), failing cases list with "Open in Playground". Held-out metrics are shown separately and labeled.
- **Config**: only fields that exist in the repo's config (floor, margin, budget bytes, MAX results). Each change goes through the write protocol. If `HAS_BENCH` supports a candidate config, show **impact preview**: run eval with the candidate and display metric deltas before Apply.

### 8.11 Trash and Changes
Trash lists backups with timestamp, ids, size, Restore, and Purge (confirm). Changes is the changelog with filters and a link to the diff stored with each entry.

---

## 9. Flow management (the pipeline is the product)

Stages and their gates:
| Stage | What happens | Exit gate |
|-------|--------------|-----------|
| Ingest | skills enter as tier C | provenance + license recorded |
| Triage | each skill reviewed to B, A, frozen or deleted | mandatory fields complete for A |
| Cluster | same-job skills grouped, one primary each | every cluster has exactly one primary |
| Verify | eval runs for the slice | meets the slice targets on held-out cases |
| Publish | mandate regenerated, drift check passes | Verify green (override allowed, logged with reason) |

- The pipeline bar shows count badges per stage for the active slice and links into the right screen. A stage with a failing gate shows a warn mark and the reason on hover.
- **Slice readiness** (Overview) is a checklist computed from data: all returnable skills in slice have complete cards; clusters valid; ≥ 3 eval cases per cluster and ≥ 1 expecting a variant; ≥ 15% `NONE` cases in slice; eval meets targets; mandate within budget. "Mark stable" is enabled only when all pass and writes `stable: true` for that slice into the dashboard's own state file `.state/slices.json` (not into the router's data).
- Work happens one slice at a time: the slice selector remembers the last slice; opening `All` shows a banner "Working across slices. Pick one to see readiness."

---

## 10. Freeze / Delete / Keep / Rewrite

### 10.1 Existing repo artifacts (applied by the agent after recon)
| Artifact | Action | Rule |
|----------|--------|------|
| Router script(s) | **Keep** | Called via execFile. Only allowed edit: add `--json` output. |
| Rebuild, validate, ingest, benchmark scripts | **Keep** | Called by the adapter. Never edited. |
| Catalog / taxonomy / provenance / blocklist JSON | **Keep** | Read directly; written only through plan → apply → rebuild → validate. |
| Cards (if present) | **Keep** | The editable source of truth; writes use existing key order and indentation. |
| Existing dashboard/UI/server code (if any) | **Freeze**, then decide | Audit size and quality. Reuse only what meets sections 4–6; otherwise move to `dashboard/_legacy/` (gitignored) and rewrite. Do not delete without noting it in RECON. |
| Generated agent files | **Keep** | Never hand-edited in Mode A. |
| Any parallel eval set the dashboard would create | **Delete (do not create)** | Append to the repo's benchmark file; if none exists, create `evals/cases.jsonl` and mark Eval-run BLOCKED. |

### 10.2 Feature scope
| Feature | Action |
|---------|--------|
| Overview scorecard, Library, Inspector, Playground, Mandate editor, Ingest, Triage, Trash, Changes | **Keep** (in scope) |
| Clusters, Eval run, Config impact preview | **Keep**, flag-gated |
| Role filter, strength editor | **Delete** (not built) |
| Skill authoring from scratch, AI chat, per-model profiles, auth, cloud sync, analytics, theme picker, charts library, mobile layout | **Delete** (not built) |
| Live-reload watchers on the skill directory, drag-and-drop reordering, multi-user editing | **Freeze** (post-v1) |
| Rewriting `resolve_skill.py` or its scoring | **Delete** from this PRD's scope (separate PRD) |

---

## 11. Phases, slices, budgets, kill-lists

### 11.1 Phase 0 — Foundation (heavy). Slices S0–S2. ≤ 1,550 source lines.
- **S0 shell + recon**: `RECON.md`, `PROGRESS.md`, `ROUTING_LOG.md`; project scaffold; Hono server with security middleware; adapter (`repo`, `exec`, `skills`, `router`, `schema`); `/api/capabilities`; web shell with tokens, rail, slice selector, pipeline bar (static counts), hash router, command palette stub.
- **S1 overview + library**: `/api/audit`, `/api/skills`, `/api/skills/:id` (read-only); Overview tiles, Next action, Library table with filters, paging, keyboard, read-only drawer.
- **S2 playground**: `/api/route` normalization incl. `LEGACY_LIST`; Decision card, candidates, dropped list, byte meter; query history.
- Exit: `npm run start` opens a working read-only console on 127.0.0.1; Overview numbers match independent shell measurements within 1%; Playground returns a normalized result for the three recon queries.
- **Kill-list P0**: no writes except `.state/`, no forms, no ingest, no clusters, no eval run, no config editing, no tests beyond smoke.
- **Cut line**: after S1 the tool is already useful (G1). After S2 it covers G2.

### 11.2 Phase 1 — Write path (wiring). Slices S3–S5. ≤ 1,060 lines.
- **S3 write core**: `core/plan.ts`, `apply.ts`, `diff.ts`, `trash.ts`, `changes.ts`; token middleware; Trash and Changes screens; job runner.
- **S4 inspector edit**: schema-driven form, diff dialog, freeze/tier/delete, bulk actions in Library, Playground "Add to eval set".
- **S5 mandate editor**: both modes, lint, byte meter, diff, apply, drift display.
- Exit: edit a card field → diff → apply → validator passes → changelog line exists → Restore returns the previous bytes (sha equal). Mandate edit in the repo's mode round-trips with drift 0.
- **Kill-list P1**: no markdown rendering libraries, no rich text editor, no autosave, no optimistic updates.

### 11.3 Phase 2 — Pipeline (wiring). Slices S6–S7. ≤ 830 lines.
- **S6 ingest + triage**: preview (temp clone), review table, commit job, Triage queue with keyboard flow.
- **S7 clusters + eval**: Clusters editor (if flag), Eval table + run job + metrics, Config with impact preview (if supported), Slice readiness + Mark stable.
- Exit: ingest a small public repo end-to-end into tier C (or flagged routable) with provenance; triage 5 skills by keyboard; run eval and see metrics vs targets.
- **Kill-list P2**: no background polling beyond job status, no automatic eval runs, no auto-ingest, no scheduling.

### 11.4 Phase 3 — Hardening. Slice S8. ≤ 160 lines.
- Routed design review query (S8), Design QA checklist, accessibility pass, contrast script, smoke test script, README, dead-code removal, bundle size check, final `RECON.md` blocked list.
- Exit: all KPIs in section 12 met or listed as accepted gaps.
- **Kill-list P3**: no new features. Only fixes and deletions.

### 11.5 Allowed questions to the user (the only two)
1. `ROUTER_CMD` cannot be discovered after the recon steps and the repo has no README clue.
2. A migration that rewrites existing data files (for example adding `tier` to every card) would be required to enable a feature. Default if unanswered: do not migrate, mark BLOCKED.

### 11.6 Resumption
If the session is cut: the next session reads `PROGRESS.md`, this card, and the current slice's section only. `PROGRESS.md` template:
```
# PROGRESS
| Slice | Status (todo/doing/done/blocked) | Commit | Lines | Notes |
S0 … S8
## Last command run   ## Next step (one sentence)   ## Open BLOCKED items
```
Update it before every commit.

### 11.7 Budget table
| Slice | Server lines | Web lines | Total |
|-------|--------------|-----------|-------|
| S0 | 300 | 350 | 650 |
| S1 | 150 | 400 | 550 |
| S2 | 100 | 250 | 350 |
| S3 | 300 | 100 | 400 |
| S4 | 60 | 320 | 380 |
| S5 | 100 | 180 | 280 |
| S6 | 180 | 270 | 450 |
| S7 | 100 | 280 | 380 |
| S8 | 30 | 130 | 160 |
| **Total** | **1,320** | **2,280** | **3,600** |

If a slice exceeds its budget by more than 20%, cut scope inside the slice (fewer columns, fewer lint rules, fewer states), not the quality bar and not the write protocol.

---

## 12. Measurement

### 12.1 KPI scorecard
| KPI | Target | How verified |
|-----|--------|--------------|
| Overview metrics vs independent shell counts | within 1% | scripted comparison in `scripts/smoke.ts` |
| Library first paint, 800 skills | ≤ 200 ms server, ≤ 100 rows rendered | timing log in smoke |
| `/api/skills` payload | ≤ 200 KB, no bodies | smoke asserts size |
| Initial JS (gzip) | ≤ 250 KB | build output |
| Runtime dependencies | ≤ 12 | `package.json` check |
| Largest source file | ≤ 200 lines | `wc -l` check in `npm run check` |
| Writes with diff + undo | 100% | write-protocol test: plan, apply, restore for 1 card edit and 1 delete |
| Failed validation reverts automatically | yes | smoke injects an invalid card edit |
| Network calls on page load | 0 | server log: no outbound requests before Preview |
| Features without flag evidence | 0 | every enabled control maps to a flag with an evidence line |
| Routing log entries | 1 per designed slice | `ROUTING_LOG.md` |
| Playground "why" reachable | ≤ 2 clicks from Overview | acceptance A3 |
| Mandate lint accuracy | 100% on 8 fixtures (4 pass, 4 fail) | smoke |

`npm run check` = typecheck + build + smoke + line-length check. No browser test framework unless the repo already has one.

### 12.2 Design QA checklist (score 0/1, target ≥ 18/20; record in `RECON.md`)
1. Light and dark both complete, no unstyled surface. 2. Contrast script passes all token pairs. 3. One accent color only. 4. No shadows except overlays. 5. All numbers tabular and right-aligned in tables. 6. Ids, bytes and scores in mono. 7. Tier chips distinguishable in grayscale. 8. Decision badges distinguishable in grayscale. 9. Every empty state names a next action. 10. Every error says what, why, next. 11. Every destructive action is a separate explicit button with counts. 12. Full keyboard path for Library, Triage, Mandate. 13. Visible focus ring everywhere. 14. Drawer traps and restores focus. 15. No spinner without a label. 16. Table header sticky, row height 36 px. 17. Page titles ≤ 24 px, no hero layouts. 18. No item from section 6.4. 19. Motion limited to the listed components, reduced-motion honored. 20. Copy: sentence case, verbs on buttons, units on numbers.

### 12.3 Acceptance walkthrough (the owner runs this in 5 minutes)
| # | Do | Expect |
|---|----|--------|
| A1 | `npm --prefix dashboard run start` | console opens on 127.0.0.1, no console errors |
| A2 | Open Overview | tiles show real counts, Next action names one concrete step |
| A3 | Playground, route "add scroll animation to a landing page" | decision, candidates, bytes visible without scrolling |
| A4 | Route "wordpress theme development" | ABSTAIN, or `LEGACY_LIST` banner if the router is old |
| A5 | Library, filter stale, open one, edit a field, save | diff shown, validator passes, changelog entry added |
| A6 | Delete that skill, then Restore from Trash | files identical to before (sha equal) |
| A7 | Mandate editor, add a line telling agents to "load all skills", try Apply | blocked by lint with the reason |
| A8 | Ingest preview of a small GitHub repo | review table with licenses and exclusions, nothing written until Commit |

---

## 13. Risks and decisions

| Risk | Decision |
|------|----------|
| Router is still v1 (list, no abstention) | `LEGACY_LIST` is a first-class outcome; dashboard still works and makes the weakness visible |
| Repo changed massively since the audit | capability flags + schema discovery; Phase 0 findings table replaces the prior audit |
| Router spawn is slow (ONNX, cold start) | show labeled spinner, cache nothing about routing results except the 20-query history |
| Schema discovery guesses wrong required fields | prefer the repo's validator; the 95% rule is a fallback, and RECON lists every inferred rule |
| Dashboard writes corrupt the library | write protocol: backup, atomic, verify-or-revert, changelog; writes disabled without a validator |
| Scope creep inside slices | line budgets in 11.7; kill-lists per phase |
| Design skills pulled by router are irrelevant (no abstention in v1) | sanity keyword gate in 7.1; section 6 is the final authority |
| Agent runs out of budget mid-build | cut lines after S1, S2, S5, S8; `PROGRESS.md` resumption |
| Ingesting unlicensed third-party skills | default exclusion of unlicensed rows; tier C default; license shown before commit |
