# Audit reproduction — pitmhskills, 2026-10-21

Every command below was run on 2026-10-21 from
`C:\Users\Mattchine\pitmhskills` unless stated otherwise. Paths in the audit
map to these outputs.

## 1. `get_ref` is dead for every client

Through the MCP tool, exactly as an agent calls it:

```
get_ref apple-design-skill__apple-design / SKILL.md        -> Error: unknown skill
get_ref apple-design-skill__apple-design / references/x.md -> Error: unknown skill
get_ref nope__nope / x                                     -> Error: unknown skill
```

The card is present:

```powershell
cd C:\Users\Mattchine\pitmhskills
Get-Content cards\apple-design-skill__apple-design.json -Raw | ConvertFrom-Json |
  Select-Object id, skill_path
# id         : apple-design-skill__apple-design
# skill_path : C:\Users\Mattchine\pitmhskills\skills\apple-design-skill\SKILL.md
```

`src/serve.ts:82` builds `cards/${base}.json` as a relative path, so it
resolves against the MCP server's working directory, which is the client
project, not the router root.

The same rule from the CLI, which shows the guard working as intended:

```powershell
cmd /c "C:\Users\Mattchine\obscura\obscura.exe fetch http://127.0.0.1:3000 --dump text 2>&1"
# Error: ... Access to private/internal IP address 127.0.0.1 is not allowed
# Local/private network access is blocked by the SSRF guard.
```

## 2. The body is a section map and the fence points at a missing file

```powershell
bun src/cli.ts route "design a mobile app UI following Apple Human Interface Guidelines" `
  --cwd "C:\Users\Mattchine\portfolio"
```

```
OUTCOME: ASK
SKILL: apple-design-skill__apple-design
CONFIDENCE: 90 MARGIN: 6
--- body ---
STYLE: no delve, tapestry, landscape, vibrant, testament, beacon, realm, symphony, pivotal, crucial. No banned phrases/openers. Full list: get_ref slop-patterns. UI: no inter only type, purple blue gradient hero, three identical cards.
SECTIONS: §Scope §A6. Build order
MORE: §A2. Page structure §A3. Layout selection §B3. Corner radius §B5. Hero section §B10. Ship requirements — fetch via get_ref
```

The fence target does not exist inside the skill:

```powershell
$card = Get-Content cards\apple-design-skill__apple-design.json -Raw | ConvertFrom-Json
$dir = Split-Path $card.skill_path -Parent
Test-Path (Join-Path $dir "slop-patterns")     # False
Test-Path "$env:USERPROFILE\pitmhskills\evals\slop-patterns.json"  # True
```

Section names do match the source headings, so a section-aware fetcher is
possible:

```powershell
$c = Get-Content cards\apple-design-skill__apple-design.json -Raw | ConvertFrom-Json
$c.sections | Select-Object -First 4 name, bytes
Select-String -Path $c.skill_path -Pattern "^## " | Select-Object -First 4
```

## 3. Design tasks ask instead of pick

```powershell
$design = @(
  "review the design of this landing page and suggest improvements",
  "design a mobile app UI following Apple Human Interface Guidelines",
  "audit accessibility of this React component",
  "improve the visual design of my portfolio homepage",
  "create a design system with tokens and components",
  "critique the color palette and typography of this page",
  "make this landing page feel premium and distinctive",
  "apply the laws of UX to this checkout flow"
)
foreach ($t in $design) { bun src/cli.ts route "$t" --cwd "C:\Users\Mattchine\portfolio" }
```

```
ASK  ai-design__landing-page-design                  60 MARGIN 4
ASK  apple-design-skill__apple-design                90 MARGIN 6
ASK  accessibility-agents__kb-mobile-accessibility    64 MARGIN 9
ASK  mengto-skills__build-awwwards-quality-sites      47 MARGIN 1
ASK  mcp-server-guide__figma-generate-library         85 MARGIN 5
PICK design-review__design-review                    76 MARGIN 16
PICK mengto-skills__cinematic-scroll-storytelling    67 MARGIN 10
ASK  laws-of-ux__laws-of-ux                           54 MARGIN 2
```

Mixed sample for comparison:

```
PICK awesome-copilot__commit-message-storyteller     80 MARGIN 22
ASK  accessibility-agents__playwright-verifier       51 MARGIN 1
ASK  design__styleseed                               66 MARGIN 3
PICK mengto-skills__pricing-page                     99 MARGIN 40
PICK awesome-copilot__planning-oracle-…postgres…    62 MARGIN 16
PICK jakubkrehel-skills__better-writing              63 MARGIN 19
ASK  ponytail__ponytail-audit                        56 MARGIN 8
ASK  mengto-skills__glass-dark-ui                    55 MARGIN 1
```

The decision rule that produces this, `src/decide.ts:34-45`:

```ts
if (ranking.length === 0) return ABSTAIN;
if (top.score < floor) return ABSTAIN;                      // floor 45
const m = second ? top.score - second.score : 99;
if (top.score >= pickFloor && m >= margin) return PICK;     // 80, 10
if (top.score >= floor && m >= margin) return PICK;         // same outcome
if (top.score >= floor && second && m < margin) return ASK;
return ABSTAIN;
```

Thresholds from `config.json`:

```json
{ "floor": 45, "margin": 10, "pick_floor": 80, "top_k_retrieve": 12,
  "score_pool": 40, "max_per_cluster": 8, "council_size": 4,
  "weights": { "bm25": 0.35, "cover": 0.4, "vec": 0.05, "unknown": 0.6 } }
```

## 4. The `ASK` outcome drops the body on OpenCode

```ts
// ~/.config/opencode/plugins/pitmhskills.ts
if (result.outcome === "ASK") { ...; return lines.join("\n"); }   // no body
if (result.outcome === "ABSTAIN") return "";                      // no hint
```

The CLI keeps both:

```ts
// src/route.ts:158-172
if (r.ask_question) lines.push(`ASK: ${r.ask_question}`);
if (r.council_hint) lines.push(`COUNCIL: ${r.council_hint}`);
if (r.body) lines.push(`--- body ---\n${r.body.slice(0, 4000)}`);
```

## 5. The opencode instructions are dropped

Schema from `https://opencode.ai/config.json`:

```json
"instructions": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Additional paths or URLs supplying ambient instructions"
}
```

Configured value in `~/.config/opencode/opencode.jsonc`:

```jsonc
"instructions": [
  "Skills are routed for you. A hook runs the pitmhskills router on the user's task before you see it, ...",
  "Session memory runs locally in claude-mem. Use the mem_search MCP tool, ..."
]
```

Neither string appears in the live opencode system prompt, which contains the
project `AGENTS.md` and no global instructions.

## 6. Client matrix

```powershell
# Codex: hook and MCP present
rg -n "route-hook|pitmhskills|mcp_servers" "$env:USERPROFILE\.codex\config.toml"
Get-Content "$env:USERPROFILE\.codex\hooks.json" -Raw

# Claude Code: neither present
rg -n "pitmhskills" "$env:USERPROFILE\.claude\settings.json" "$env:USERPROFILE\.claude.json"

# Zed: MCP present, no prompt hook
$j = Get-Content "$env:APPDATA\zed\settings.json" -Raw | ConvertFrom-Json
$j.context_servers.pitmhskills | ConvertTo-Json -Compress
```

The Claude Code hook scripts read the task from an argument, while Claude Code
sends the prompt on stdin:

```bash
# hooks/route-hook.sh
TASK="${1:-}"
if [ -z "$TASK" ]; then exit 0; fi
```

```powershell
# hooks/route-hook.ps1
param([string]$Task = "")
if ([string]::IsNullOrWhiteSpace($Task)) { exit 0 }
```

`hooks/route-hook-codex.ps1` reads stdin JSON and is the only correct variant.

## 7. The council runs end to end

```powershell
$id = (bun src/cli.ts council "design a pricing page" --cwd "C:\Users\Mattchine\portfolio" |
        Select-String "^COUNCIL:").ToString() -replace "COUNCIL: ",""

bun src/cli.ts note $id "mengto-skills__pricing-page" keep "tier-A pricing builder, score 99"
bun src/cli.ts note $id "design__copywriting-skill" drop "structure is out of scope"
bun src/cli.ts note $id "__critic__" merge "merge structure with copy guidance" "critic"

bun src/cli.ts compose $id --cwd "C:\Users\Mattchine\portfolio"
```

```
DECISION: mengto-skills__pricing-page  confidence=99
MESSAGE: decided mengto-skills__pricing-page (2 survivors, 3 dropped)
DISSENT:
  dropped design__copywriting-skill: Pricing page structure is out of scope
  dropped awesome-copilot__gtm-technical-product-pricing: no verdict recorded
  dropped skills__monetizing-innovation: no verdict recorded
--- brief ---
<the full skill body>
```

The MCP equivalents are `council`, `note`, and `compose` in `src/serve.ts:29-63`.

## 8. Card shape and the missing `kind`

```powershell
$c = Get-Content cards\laws-of-ux__laws-of-ux.json -Raw | ConvertFrom-Json
$c.PSObject.Properties.Name
# id tier origin license hash purpose domain task_types use_when do_not_use_when
# scope disambiguator cluster cluster_role pick_over_primary_when pairs_with
# requires conflicts_with keywords curated body_tokens core_bytes sections verify skill_path
```

No field distinguishes a procedure from a reference or a theory.

## 9. The routing trace and the frozen design skills

```powershell
bun src/cli.ts diagnose "design a mobile app UI following Apple Human Interface Guidelines" `
  --cwd "C:\Users\Mattchine\portfolio"
```

```
GATE DROPS (total=3 relevant=2):
  - taste-skill__design-taste-frontend-v1 :: tier-C frozen
  - taste-skill__design-taste-frontend-v2-experimental :: tier-C frozen
RETRIEVAL (n=40):
  1. skills__ios-hig-design                bm=34.2 vec=0.415
  2. apple-design-skill__apple-design      bm=28.9 vec=0.376
  3. design__apple-hig-skills              bm=26.1 vec=0.281
  4. higagentskills__apple-hig             bm=23.4 vec=0.259
  5. design__mobile-app-ui-design          bm=22.4 vec=0.341
COLLAPSE WINNERS (clusters=6):
  frontend        -> skills__ios-hig-design (primary)
  frontend-design -> apple-design-skill__apple-design (variant) +predicate-hit
  general         -> design__apple-hig-skills (primary)
DECISION:
  1. apple-design-skill__apple-design score=90
  2. skills__ios-hig-design score=84
  3. higagentskills__apple-hig score=70
  OUTCOME: ASK   MARGIN: 6
```

Tier census, which shows the whole design-taste family is tier C:

```powershell
$cards = Get-ChildItem cards -File | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json }
$cards | Group-Object tier | Select-Object Name, Count
# B 2155   A 20   C 3

$cards | Where-Object { $_.tier -eq "C" } | Select-Object -ExpandProperty id
# ibelick__ui-skills-root
# taste-skill__design-taste-frontend-v1
# taste-skill__design-taste-frontend-v2-experimental
```

The freeze itself, `src/gate.ts:12`:

```ts
if (c.tier === "C") { dropped.push({ id: c.id, why: "tier-C frozen" }); continue; }
```

## 10. The decision rule and the thresholds

`src/decide.ts:34-45`:

```ts
if (ranking.length === 0) return ABSTAIN;
if (top.score < floor) return ABSTAIN;                   // floor 45
const m = second ? top.score - second.score : 99;
if (top.score >= pickFloor && m >= margin) return PICK;  // 80, 10
if (top.score >= floor && m >= margin) return PICK;      // identical outcome
if (top.score >= floor && second && m < margin) return ASK;
return ABSTAIN;
```

`config.json`:

```json
{ "floor": 45, "margin": 10, "pick_floor": 80, "top_k_retrieve": 12,
  "score_pool": 40, "max_per_cluster": 8, "council_size": 4, "max_bytes": 20480,
  "weights": { "bm25": 0.35, "cover": 0.4, "vec": 0.05, "unknown": 0.6,
               "rare_match": 8, "rare_df": 2, "position_decay": 0 } }
```

`pick_floor` has no effect: line 39 and line 40 produce the same outcome for
every input. The vector arm carries 5 % of the score.

## 11. Council state in the database

Read-only query of `deliberations` and `deliberation_notes` in
`pitmhskills.db`:

```powershell
bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('C:/Users/Mattchine/pitmhskills/pitmhskills.db', { readonly: true });
console.log(db.query('SELECT id, status, chosen_id, confidence, length(brief) b, length(dissent) d, candidates, substr(task,1,40) t FROM deliberations ORDER BY created_at').all());
console.log(db.query('SELECT deliberation_id, skill_id, role, verdict, score, bytes FROM deliberation_notes').all());
"
```

```
dada1149b2d2eb41  decided  chosen=pocock__wizard                     conf=40 brief=4395  dissent=0   cand=[]
e33526321c77ddaf  decided  chosen=interface-design__interface-design conf=88 brief=19969 dissent=190
603c6095b2702ba3  decided  chosen=interface-design__interface-design conf=88 brief=19969 dissent=196
8b741bd9a28f678b  open     chosen=-                                   brief=0    dissent=0   cand=[..., nvidia__vss-deploy-dense-captioning, nvidia__doca-comm-channel-admin]
4848a74f4fdbe232  open     chosen=-                                   brief=0    dissent=0   cand=[...]  task: "inspect the pitmhskills skills router how it wor"
2da3892af194a445  open     chosen=-                                   brief=0    dissent=0   cand=[nvidia__hsb-flash, ..., nvidia__cudaq-guide, nvidia__warp-eval]
cf7fcfe70e646ec8  decided  chosen=mengto-skills__pricing-page        conf=99 brief=6076  dissent=240
```

Three of seven deliberations are `open` with zero notes, including the one
whose task was a real user request. Note the `merge` verdict that chose
`pocock__wizard`, the `candidates=[]` on the first row with `dissent=0`, the
19,969-byte briefs, and the two nvidia candidates in the dashboard council.

The notes include one for a skill that is not a candidate:

```
2da3892af194a445  System.Object[]   role=specialist  verdict=drop  score=0
```

Every note has `score=0`, and `bytes` is recorded but never summed.

## 12. The council id is used as a path segment (no write performed)

`src/council-store.ts:37-43` builds the note directory from the id that
arrives on the wire. Path computation only, **no file was written**:

```powershell
bun -e "
import { join } from 'node:path';
const STATE = 'C:/Users/Mattchine/pitmhskills/.state/council';
for (const id of ['cf7fcfe70e646ec8','../../../../Temp','../../..'])
  console.log(id.padEnd(22), '->', join(STATE, id));
"
```

```
cf7fcfe70e646ec8    -> C:\Users\Mattchine\pitmhskills\.state\council\cf7fcfe70e646ec8
../../../../Temp    -> C:\Users\Temp
../../..            -> C:\Users\Mattchine
```

`writeNoteFile` then does `mkdirSync(dir, { recursive: true })` and writes
`<skill_id>.json` there, and `compose` reads whatever directory it is given.
The MCP `note` tool must validate the id against the `deliberations` table
before touching the filesystem.

## 13. The committed router is a different router

```powershell
git show HEAD:src/serve.ts > $env:TEMP\serve-head.ts
rg -n -A1 'server\.tool\(' $env:TEMP\serve-head.ts
# route, plan, get_ref, phase_done   ← no council, no note, no compose

git show HEAD:config.json
# { "floor": 60, "margin": 10, "pick_floor": 80, "top_k_retrieve": 12, ... }
# no score_pool, no council_size, no max_per_cluster, no weights

git log --oneline -- src/council.ts     # empty
git status --porcelain | Select-String "council|scoring|lexicon"
# ?? src/council.ts  ?? src/scoring.ts  ?? src/lexicon.ts  ?? src/weights.ts ...
```

The working tree is what the three clients are being served. It is not in git.

## 14. The double-stemmed IDF lookup

`src/scoring.ts:43` stems the query token, `src/scoring.ts:70` passes that
stemmed token to `lex.idf`, and `src/lexicon-stats.ts:51` stems it again:

```ts
idf(term: string): number {
  const d = df.get(stem(term)) ?? 0;
  if (d === 0) return maxIdf;              // "unknown" means maximally specific
  return Math.log(1 + (n - d + 0.5) / (d + 0.5));
}
```

Measured against the live lexicon:

```powershell
bun -e "
import { stem } from './src/lexicon.ts';
import { getLexicon } from './src/lexicon-stats.ts';
import { loadAllCards } from './src/retrieve.ts';
import { openDb } from './src/db.ts';
const db = openDb(); const cards = loadAllCards(db); const lex = getLexicon(cards);
const n = cards.length;
for (const w of ['database','codebase','release','purpose','diagnose','version','phase','wizard']) {
  const s = stem(w);
  const df = lex.df.get(s) ?? 0;
  console.log(w.padEnd(12), 'stem=' + s.padEnd(10), 'df=' + String(df).padStart(4),
    'idf(as used)=' + lex.idf(s).toFixed(3),
    'idf(correct)=' + Math.log(1 + (n - df + 0.5) / (df + 0.5)).toFixed(3));
}
"
```

```
corpus n=2178  maxIdf=8.380

word         stem(w)   stem(stem(w))  df  idf(as used)  idf(correct)
database     databas    databa              19        8.380         4.716
codebase     codebas    codeba              42        8.380         3.937
release      releas     relea               23        8.380         4.530
purpose      purpos     purpo               21        8.380         4.619
diagnose     diagnos    diagno              36        8.380         4.089
version      vers       ver                 37        7.281         4.062
phase        phas       pha                 58        7.281         3.618
wizard       wizard     wizard               3        6.434         6.434
```

**"database" (19 cards) scores 8.380. "wizard" (3 cards) scores 6.434.** The
rarer term is worth less. `isGeneric` at `src/lexicon-stats.ts:56` has the
same double stem, so a card matching only "database" is judged specific and
escapes the 0.45 generic penalty.

## 15. Out-of-vocabulary dilution, cluster cap, and the rare-word bonus

```powershell
# same card, one unknown word at a time
"write a commit message for my staged changes"        -> score 89, cover 1.000
"... in a polyglot monorepo"                          -> score 70, cover 0.622
"... in a zqxjkv polyglot monorepo"                   -> score 66, cover 0.533
```

```powershell
# cluster sizes against the cap of 8
$cards | Group-Object cluster | Sort-Object Count -Descending | Select-Object -First 10
# general 795, gpu-compute 430, workflow 298, frontend 292, frontend-design 88, ...
```

```powershell
# how many terms earn the +8 rare_match bonus
$lex.df | Where-Object { $_.Value -gt 0 -and $_.Value -le 2 } | Measure-Object
# 4343  (includes msaa, sizer, narrator, cla, 549, sarif, treemap, donut)
```

## 16. The routed body cap and the fence that points nowhere

```powershell
# body is a section map; the content path is broken
bun src/cli.ts route "design a mobile app UI following Apple Human Interface Guidelines" --cwd "C:\Users\Mattchine\portfolio"
# MORE: §A2. Page structure ... — fetch via get_ref
# STYLE: ... Full list: get_ref slop-patterns.

# the fence target is a router-level file, not a skill file
Test-Path (Join-Path (Split-Path $card.skill_path -Parent) "slop-patterns")   # False
Test-Path "C:\Users\Mattchine\pitmhskills\evals\slop-patterns.json"          # True
```

