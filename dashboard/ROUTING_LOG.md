# ROUTING_LOG

## S0 shell + tokens — 2026-11-11
query: design an app shell and design tokens for a dense local developer tool dashboard with sidebar navigation
outcome: ASK
rank1: local__desktop-dashboard-ui (score 59)  sanity: pass
used: local__desktop-dashboard-ui (owner picked over interface-design__interface-design) sections: 2 grid system, 3 sidebar-adaptive, 4 inspector hierarchy   bytes read: ~2,700
note: Overview tiles use a container-query grid (2/3/6 columns by panel width, not viewport); inspector opens with a tinted summary block and a left-accent callout for the disambiguator.

## S1 overview + library — 2026-11-11
query: design a dense data table with filters, bulk actions and a detail side drawer for managing a catalog
outcome: ASK
rank1: cloudflare__basin (score 45)  sanity: fail
used: none (treated as ABSTAIN) sections: -   bytes read: 0
note: none

## S2 playground — 2026-11-11
query: design a query tester that shows a decision, ranked candidates with explanations, and a byte budget
outcome: ABSTAIN
rank1: local__skill-finder (score 42)  sanity: n/a
used: none sections: -   bytes read: 0
note: none

## Pre-routed (outcomes recorded 2026-11-11, applied when the slice is built)
- S4 `design schema-driven edit forms with inline validation and a diff review before saving` -> ABSTAIN (top 39)
- S5 `design a plain text config editor with a live size budget meter, lint results and diff preview` -> ABSTAIN (top 35)
- S6 `design a multi-step import wizard ...` -> ASK, rank1 awesome-gamedev__input-systems, sanity fail -> ABSTAIN
- S7 `design a grouping editor for related items and a metrics dashboard with pass fail targets` -> ABSTAIN (top 36)
- S8 `review a developer dashboard for accessibility, visual hierarchy and consistency` -> ASK, owner picked design__design-auditor
