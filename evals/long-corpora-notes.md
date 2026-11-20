# Long benchmark corpora - notes

Two new corpora of long, detailed, realistic user prompts.

| File | Cases | Routed | NONE | Near-miss |
|------|-------|--------|------|-----------|
| `evals/golden-long-digital-product.yaml` | 40 | 36 | 4 | 6 |
| `evals/golden-long-cybersec.yaml` | 40 | 34 | 6 | 6 |
| Total | 80 | 70 | 10 | 12 |

Both files use the case shape the loader in `src/eval.ts` understands (`task`,
`expect`, optional `stack`) plus one extra key, `category`. The loader ignores
the extra key, so the files parse and run with the existing loader. No file in
`src/`, `cards/` or `config.json` was changed. The loader for these two files
still has to be wired by another agent.

## Rules that were applied

- Every non-NONE `task` is 60 to 140 words. Every NONE `task` is 10 to 40 words.
- The first sentence of each task states the intent. Then come the context and
  then the constraints.
- Product terms used in the digital product corpus: signup, activation, churn,
  funnel, paywall, a11y, Lighthouse, Core Web Vitals, empty states, mobile,
  onboarding, invite flow, paywall, plan comparison, WCAG, CI gate, deploy.
- The wording does not repeat any task from `golden.yaml`, `golden-verbose.yaml`,
  `golden-paraphrase.yaml` or `golden-adversarial.yaml`. The same intents are
  used in new words.
- NONE cases in the digital product corpus name no product or software term.
- NONE cases in the cybersecurity corpus use security words in a non-security
  sense, or are out of scope.
- A NONE case still carries a `category`. It is the category a naive keyword
  match would land on, so the file can be sliced by category without holes.

## Digital product corpus - category breakdown

| Category | Cases | Routed | NONE |
|----------|-------|--------|------|
| landing | 4 | 4 | 0 |
| onboarding | 2 | 2 | 0 |
| pricing | 3 | 3 | 0 |
| growth | 3 | 3 | 0 |
| analytics | 2 | 2 | 0 |
| accessibility | 4 | 4 | 0 |
| performance | 5 | 5 | 0 |
| design-system | 3 | 3 | 0 |
| deploy | 3 | 3 | 0 |
| documentation | 3 | 3 | 0 |
| content | 4 | 2 | 2 |
| testing | 2 | 2 | 0 |
| research | 2 | 2 | 0 |
| **Total** | **40** | **36** | **4** |

Word length, non-NONE cases: 64 to 139. Word length, NONE cases: 18 to 31.
21 of the 40 cases carry a `stack` key.

## Cybersecurity corpus - category breakdown

| Category | Cases | Routed | NONE |
|----------|-------|--------|------|
| threat-model | 4 | 3 | 1 |
| dependency | 3 | 3 | 0 |
| secrets | 3 | 2 | 1 |
| auth | 4 | 3 | 1 |
| incident | 2 | 2 | 0 |
| compliance | 2 | 2 | 0 |
| hardening | 6 | 5 | 1 |
| review | 3 | 3 | 0 |
| monitoring | 4 | 3 | 1 |
| testing | 2 | 2 | 0 |
| access-control | 4 | 3 | 1 |
| data-protection | 3 | 3 | 0 |
| **Total** | **40** | **34** | **6** |

Word length, non-NONE cases: 61 to 135. Word length, NONE cases: 19 to 25.
29 of the 40 cases carry a `stack` key.

## Near-miss cases

A near-miss case is one where a second card also looks plausible, but one card
is clearly right. The `expect` value is the clearly right card.

### Digital product (6)

| Case | Category | expect | Rival that also looks plausible |
|------|----------|--------|-------------------------------|
| 4 | landing | `awesome-copilot__landing-page-conversion-audit` | `design__design-auditor`, `web-quality__accessibility` - the text asks for a revenue ordered fix list, not a design review |
| 9 | pricing | `design__dark-pattern-audit` | `design__design-auditor` - the text asks for deceptive patterns with file and line, not a general critique |
| 10 | growth | `awesome-copilot__gtm-product-led-growth` | `awesome-copilot__gtm-enterprise-onboarding` - the text asks for self serve acquisition and activation, not enterprise onboarding |
| 16 | accessibility | `accessibility-agents__forms-specialist` | `jakubkrehel-skills__better-accessibility`, `design__fixing-accessibility` - the text is limited to one form wizard: labels, validation, error handling, autocomplete |
| 19 | performance | `web-quality__performance` | `awesome-copilot__security-review`, `openai__security-best-practices` - the text also asks for a content security policy header, but the goal is page speed and caching |
| 24 | design-system | `kemiljk-skills__design-system-evolution` | `design__design-system-governance` - the text asks for reuse or variant or new pattern decisions, not for ownership and versioning policy |

### Cybersecurity (6)

| Case | Category | expect | Rival that also looks plausible |
|------|----------|--------|-------------------------------|
| 2 | threat-model | `openai__security-threat-model` | `awesome-copilot__threat-model-analyst` - the text asks for a concise repository grounded writeup, not a full STRIDE-A document |
| 7 | secrets | `awesome-copilot__secret-scanning` | `addyosmani__security-and-hardening`, `openai__security-best-practices` - the text asks for scanning, push protection, custom patterns and alert handling |
| 18 | hardening | `uiskills-staged__harden` | `addyosmani__security-and-hardening` - the text hardens the interface against bad data, error languages and slow networks, not against attackers |
| 19 | hardening | `kemiljk-skills__prototype-to-production` | `addyosmani__security-and-hardening` - the text is about making a weekend prototype behave like a product |
| 27 | testing | `awesome-copilot__codeql` | `awesome-copilot__security-review`, `security-audit-skill__security-audit` - the text asks for static analysis set up in the pipeline, not for a manual review |
| 29 | access-control | `supabase__supabase-postgres-best-practices` | `supabase__supabase` - the text is about row level security policies and SQL, not about auth, tokens or cookies |

## Security topics covered in the cybersecurity corpus

Each topic below appears in at least one task text.

| Topic | Case | expect |
|-------|------|--------|
| Dependency pinning and integrity manifests | 4 | `awesome-copilot__agent-supply-chain` |
| SBOM | 4 | `awesome-copilot__agent-supply-chain` |
| Supply chain | 4, 6 | `awesome-copilot__agent-supply-chain`, `awesome-copilot__sandbox-npm-install` |
| Dependency update automation | 5 | `awesome-copilot__dependabot` |
| Secret scanning and push protection | 7 | `awesome-copilot__secret-scanning` |
| Secret rotation | 8 | `awesome-copilot__arize-ai-provider-integration` |
| OAuth scope review | 9 | `supabase__supabase` |
| JWT expiry | 9 | `supabase__supabase` |
| Password reset flow | 9, 10 | `supabase__supabase`, `neondatabase__neon-auth` |
| Path traversal | 16 | `addyosmani__security-and-hardening` |
| SSRF | 16 | `addyosmani__security-and-hardening` |
| SQL injection | 23 | `awesome-copilot__sql-code-review` |
| RLS policy review | 29 | `supabase__supabase-postgres-best-practices` |
| CI hardening | 17, 27 | `awesome-copilot__github-actions-hardening`, `awesome-copilot__codeql` |
| Incident postmortem | 12 | `awesome-copilot__incident-postmortem` |
| GDPR data deletion | 32 | `awesome-copilot__gdpr-compliant` |
| Security headers and CSP | 22 | `security-audit-skill__security-audit` |
| Rate limiting | 20 | `awesome-copilot__upstash-redis` |
| Audit logging | 25 | `addyosmani__observability-and-instrumentation` |
| Least privilege and roles | 30 | `awesome-copilot__azure-role-selector` |
| Threat model | 1, 2, 3 | `awesome-copilot__threat-model-analyst`, `openai__security-threat-model`, `awesome-copilot__tm7-threat-model` |

## Expected card ids and their purpose

70 distinct cards are used as `expect` values. Every one exists as
`cards/<id>.json`. The purpose line is read from that card file.

### Digital product (36 distinct)

| Card id | Purpose |
|---------|---------|
| `mengto-skills__landing-page` | Designing or rewriting a high converting single offer landing page: structure, layout, conversion, copy, SEO. |
| `ai-design__landing-page-design` | Complete landing page system: intake questions, structure, layout, conversion copy, SEO, visual rules. |
| `compact-landing-skill__compact-landing` | Compact distinctive landing pages and product skeletons without one repeated template. |
| `awesome-copilot__landing-page-conversion-audit` | Audit a landing or checkout page for conversion leaks, fix list ordered by revenue impact. |
| `awesome-copilot__gtm-enterprise-onboarding` | Four phase framework for onboarding enterprise customers from contract to value. |
| `understand-anything__understand-onboard` | Generate an onboarding guide for new team members joining a project. |
| `mengto-skills__pricing-page` | Designing or rewriting a SaaS pricing page: plans, copy, SEO, FAQs, layout, experiments. |
| `awesome-copilot__gtm-technical-product-pricing` | Pricing strategy for technical products: usage based or seat based, freemium, enterprise. |
| `design__dark-pattern-audit` | Audit codebase and product copy for deceptive dark patterns. |
| `awesome-copilot__gtm-product-led-growth` | Build self serve acquisition and expansion motions: activation, freemium conversion, growth loops. |
| `skills__improve-retention` | Diagnose and fix retention problems with behaviour design. |
| `awesome-copilot__gtm-0-to-1-launch` | Launch a new product from idea to first customers, diagnose why launches fail. |
| `skills__lean-analytics` | Choose and audit startup metrics with Lean Analytics: which metric, north star, vanity metrics. |
| `awesome-copilot__server-side-conversion-tracking` | Server side conversion tracking so purchases reach ad platforms despite blockers. |
| `web-quality__accessibility` | Audit and improve web accessibility against WCAG 2.2. |
| `accessibility-agents__forms-specialist` | Form labels, validation, error handling, multi step wizards, autocomplete. |
| `accessibility-agents__contrast-master` | Colour contrast, themes, dark mode, non text contrast, colour only meaning. |
| `accessibility-agents__ci-accessibility` | Accessibility CI: baselines, SARIF, pull request gating. |
| `web-quality__performance` | Optimise web performance for faster loading and a better user experience. |
| `web-quality__core-web-vitals` | Optimise Core Web Vitals (LCP, INP, CLS) using field and lab evidence. |
| `addyosmani__performance-optimization` | Optimise performance across frontend, backend, queries and databases. |
| `vercel__vercel-optimize` | Vercel cost and performance optimisation for deployed projects. |
| `design__design-system-governance` | How a design system evolves: ownership, contribution lifecycle, versioning, deprecation, quality gates. |
| `kemiljk-skills__design-system-evolution` | Decide how a design system evolves: reuse, variant, API change, or new pattern. |
| `uiskills-staged__shadcn` | Manage shadcn components and projects: add, search, fix, style, compose. |
| `vercel__deploy-to-vercel` | Deploy applications and websites to Vercel. |
| `openai__cloudflare-deploy` | Deploy applications and infrastructure to Cloudflare Workers and Pages. |
| `agent-browser__protected-vercel-deployments` | Access and test Vercel deployments protected by Vercel Authentication or SSO. |
| `skills__technical-documentation` | Audit, write and improve developer documentation using the Google style guide. |
| `awesome-copilot__documentation-writer` | Diataxis documentation expert for high quality software documentation. |
| `design__content-strategy` | Define what content a product needs, how it is structured and who owns it. |
| `agent-toolkit__content-experimentation-best-practices` | Content experimentation and A/B testing: hypotheses, metrics, sample size, variants. |
| `anthropic__webapp-testing` | Toolkit for interacting with and testing local web applications using Playwright. |
| `awesome-copilot__playwright-generate-test` | Generate a Playwright test from a scenario. |
| `design__software-ux-research` | De-risk product decisions with rigorous UX research: surveys, research ops, usability testing. |
| `cuellarfr-design__ux-research` | Plan, conduct and analyse UX research using proven methodologies. |

### Cybersecurity (34 distinct)

| Card id | Purpose |
|---------|---------|
| `awesome-copilot__threat-model-analyst` | Full STRIDE-A threat model of a repository or system, with incremental updates. |
| `openai__security-threat-model` | Repository grounded threat model: trust boundaries, assets, abuse paths, mitigations, concise writeup. |
| `awesome-copilot__tm7-threat-model` | Create valid Microsoft Threat Modeling Tool (.tm7) files. |
| `awesome-copilot__agent-supply-chain` | Verify supply chain integrity for agent plugins, tools and dependencies with hash manifests. |
| `awesome-copilot__dependabot` | Configure and manage GitHub Dependabot: schedules, grouping, alerts, labels. |
| `awesome-copilot__sandbox-npm-install` | Install npm packages inside a Docker sandbox. |
| `awesome-copilot__secret-scanning` | GitHub secret scanning, push protection, custom patterns, secret alert remediation. |
| `awesome-copilot__arize-ai-provider-integration` | Arize AI integrations that store LLM provider credentials for evaluators. |
| `supabase__supabase` | Supabase Auth (login, JWT, cookies, getClaims) plus CLI, libraries, Realtime, Storage. |
| `neondatabase__neon-auth` | Add authentication to a new app: sign up, sign in, password reset, identity routing. |
| `openai__security-best-practices` | Language and framework specific security best practice reviews with suggested fixes. |
| `awesome-copilot__incident-postmortem` | Write a structured blameless postmortem after an outage or production incident. |
| `awesome-copilot__data-breach-blast-radius` | Pre-breach impact analysis: sensitive data inventory, data flows, exposure vectors, blast radius. |
| `awesome-copilot__agent-owasp-compliance` | Check an AI agent codebase against the OWASP Agentic Security Initiative top ten risks. |
| `awesome-copilot__acreadiness-policy` | Pick, write or apply an AgentRC policy that customises readiness scoring. |
| `addyosmani__security-and-hardening` | Harden code against vulnerabilities: input handling, authentication, data storage. |
| `awesome-copilot__github-actions-hardening` | Security hardening reviewer for GitHub Actions workflow files and the actions threat model. |
| `uiskills-staged__harden` | Harden an interface against bad inputs, error languages and network conditions. |
| `kemiljk-skills__prototype-to-production` | Harden a prototype for real use: failure states, accessibility, security boundaries, maintainability. |
| `awesome-copilot__upstash-redis` | Redis over HTTP for serverless and edge, with rate limiting through Upstash. |
| `awesome-copilot__security-review` | Security scanner that reasons about code like a researcher: data flow, component interaction, findings. |
| `security-audit-skill__security-audit` | Security guidance and vulnerability review for codebases, APIs, services, libraries and daemons. |
| `awesome-copilot__sql-code-review` | SQL review for security, maintainability and quality across SQL databases. |
| `accessibility-agents__security-dashboard` | Triage Dependabot, code scanning and secret scanning alerts. |
| `addyosmani__observability-and-instrumentation` | Instrument code with logging, metrics, tracing and alerting so production behaviour is visible. |
| `openai__security-ownership-map` | Build a security ownership topology from git history, compute bus factor and sensitive code ownership. |
| `awesome-copilot__codeql` | Set up and configure CodeQL code scanning through GitHub Actions and the CLI. |
| `awesome-copilot__acreadiness-assess` | Run the AgentRC readiness assessment on a repository and produce a report. |
| `supabase__supabase-postgres-best-practices` | Supabase Postgres SQL: RLS policies, schema design, query tuning, migrations, indexes. |
| `awesome-copilot__azure-role-selector` | Choose which role to assign to an identity for the permissions it needs. |
| `awesome-copilot__mcp-security-audit` | Audit MCP server configuration files for security issues. |
| `awesome-copilot__gdpr-compliant` | Apply GDPR compliant engineering practices across APIs, data models and authentication. |
| `dotfiles__logging-sucks` | Structured application logging: canonical request events, correlation, redaction, sampling. |
| `awesome-copilot__verify-agent-action` | Review a proposed AI agent action or approval packet before execution. |

## Ids that were checked and left out

All of these ids exist in `cards/`, but none of them is an `expect` value in the
two files. The reason is given for each one.

| Id | Reason it was not used as an expect |
|----|-----------------------------------|
| `cuellarfr-design__accessibility-audit` | Also a WCAG 2.2 audit. Replaced by `web-quality__accessibility` because the task asked for a site wide audit with severity ordering and evidence. |
| `design__fixing-accessibility`, `ibelick__fixing-accessibility`, `jakubkrehel-skills__better-accessibility` | Keep one card per a11y situation so the corpus stays a routing test and not a copy of the library. The form case uses `accessibility-agents__forms-specialist`; the other two are used as rivals in the near-miss list. |
| `design__design-auditor` | A general design critique across nineteen categories. Used only as a rival in the near-miss list, not as an expect. |
| `taste-skill__design-taste-frontend`, `anthropic__frontend-design` | Art direction for one screen. The corpus covers product surfaces with a stated business goal, so these were left out. |
| `vercel__vercel-react-best-practices` | React and Next.js patterns only. The eleven second dashboard case was changed to `addyosmani__performance-optimization` because the task asks for measuring and fixing causes across the stack. |
| `awesome-copilot__azure-pricing` | Azure cloud pricing, not product pricing. The usage based pricing case uses `awesome-copilot__gtm-technical-product-pricing`. |
| `cuellarfr-design__design-systems`, `design__extract-design-system`, `design__work-with-design-systems`, `openai__figma-create-design-system-rules`, `design__design-tokens-skill`, `design__format-storybook` | Figma or token extraction skills. The three design-system cases needed build side governance, an evolution decision method and shadcn component management. |
| `agent-toolkit__sanity-best-practices`, `agent-toolkit__content-modeling-best-practices` | CMS specific. The content cases needed product wide content strategy and content experimentation. |
| `nvidia__doca-public-knowledge-map`, `local__obscura`, `local__skill-router`, `pocock__grill-with-docs`, `ponytail__ponytail`, `local__desktop-dashboard-ui` | Outside the two corpora. They cover hardware documentation, scraping, skill routing, interviews, code shrinking and dashboard layout. |

No expected id was missing at write time. Every one of the 70 ids above was
confirmed to exist as `cards/<id>.json` before it was written into a file.

## Router behaviour observed on these two corpora

This is a report only. No file in `src/` was changed and the loader for these
two files is not wired yet.

Current router state, measured with `routeWith` from `src/route.ts`:

| Set | Cases | Average words | Top 1 on routed cases | Abstained | NONE precision |
|-----|-------|---------------|-----------------------|-----------|----------------|
| `evals/golden.yaml` | 78 | 10 | 72 / 72 | 4 | 4 / 6 |
| `evals/golden-verbose.yaml` | 14 | 21 | 10 / 11 | 3 | 3 / 3 |
| `evals/golden-long-digital-product.yaml` | 40 | 84 | 7 / 36 | 30 | 4 / 4 |
| `evals/golden-long-cybersec.yaml` | 40 | 79 | 13 / 34 | 30 | 5 / 6 |

The long corpora show two separate problems.

1. Score dilution. The correct card is often the top candidate but the score
   falls under the floor. Example, case 26 of the digital product file:
   `vercel__deploy-to-vercel` is the top candidate with score 39, and the router
   still abstains because 39 is under the floor.
2. Retrieval loss on long text. For some cases the expected card is not in the
   candidate list at all. Example, case 15 of the digital product file
   (a WCAG 2.2 audit, 138 words) returns `nvidia__tao-train-reid` at score 24 as
   the top candidate.

The same task shortened to 21 words routes to the correct family. The WCAG
audit case returns `jakubkrehel-skills__better-accessibility` at 79 and
`web-quality__accessibility` at 65 in the candidate list, instead of a wrong
card at 24. The difference is length, not wording.

This means these two corpora mostly measure long prompt handling. They are a
hard set on purpose. The tuning work belongs in the scorer and the retrieval
step in `src/`, not in the corpus.

## How to verify

Run from the repository root:

```
bun -e "import yaml from 'js-yaml'; import {readFileSync} from 'node:fs'; for (const f of ['evals/golden-long-digital-product.yaml','evals/golden-long-cybersec.yaml']) { const d = yaml.load(readFileSync(f,'utf8')); console.log(f, d.length, 'cases'); }"
```

```
bun -e "import yaml from 'js-yaml'; import {readFileSync, existsSync} from 'node:fs'; for (const f of ['evals/golden-long-digital-product.yaml','evals/golden-long-cybersec.yaml']) { const d = yaml.load(readFileSync(f,'utf8')); const bad = d.filter(c => c.expect !== 'NONE' && !existsSync('cards/' + c.expect + '.json')); console.log(f, 'missing ids:', bad.length); }"
```

```
bun -e "import yaml from 'js-yaml'; import {readFileSync} from 'node:fs'; for (const f of ['evals/golden-long-digital-product.yaml','evals/golden-long-cybersec.yaml']) { const d = yaml.load(readFileSync(f,'utf8')); const w = d.map(c => String(c.task).trim().split(/\s+/).length); console.log(f, 'min', Math.min(...w), 'max', Math.max(...w)); }"
```
