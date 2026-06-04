# Product

## Register

product

## Users

The primary user is the **business owner** of a photobooth operation in Indonesia, not a trained accountant. They understand their business deeply (events, packages, crew, cash) but read accounting through a business lens, not a bookkeeping one. They open Finance to answer plain questions: How much cash do I have? Did I make money this month? What do I still owe and who owes me? Is the auto-journal getting it right?

A secondary user is **admin staff** who occasionally post manual journal entries. They need a fast, guided entry path that prevents unbalanced or malformed journals.

Context of use: desktop-first owner review during or after operating hours, with the same surfaces reachable on mobile. Sessions are short and goal-driven, not all-day bookkeeping.

## Product Purpose

Tetra Ops is the internal operations system for the business; Finance is where the money truth lives, and **Accounting (Akuntansi) is the spine** that every other finance number traces back to. Most journals are posted automatically from operations (settlement, purchasing, stock opname), so the product's job is not to make the owner do bookkeeping, it is to make the books **legible and trustworthy**: translate debit/credit into what it means for the business, show that the auto-journal is balanced and correct, and let the owner drill from a headline number down to the exact entry that produced it.

Success looks like: the owner trusts the numbers without asking an accountant, finds any figure's source in seconds, and posts a correcting manual entry without fear of breaking the ledger.

## Brand Personality

Calm, precise, quietly expert. Three words: **trustworthy, legible, unhurried.** The voice is a competent finance partner who never shows off. Numbers are the loudest thing on the screen; chrome recedes. Indonesian-language operational copy, plain over jargon. It should feel like Stripe's or Mercury's financial surfaces: dense where density earns its keep, never busy, every figure tabular and aligned so the eye trusts the column before reading it.

## Anti-references

- **QuickBooks / Accurate / enterprise ERP clutter.** No wall of toolbar buttons, no rainbow status colors, no nested-tab mazes, no "everything visible at once" dashboards. Complexity is the enemy of trust here.
- **Black-box automation.** Auto-journal must never feel like magic the owner can't inspect. If a number was posted automatically, its source and balance must be one click away.
- **Raw bookkeeping UI for a non-bookkeeper.** Don't lead with naked debit/credit grids and account codes as the only language; lead with business meaning, keep the formal ledger one layer down for those who want it.
- **Generic admin-template dashboards.** Identical KPI-card grids with a big number and a gradient accent. The hero-metric template is a failure mode, not a goal.

## Design Principles

- **Translate, then expose.** Every accounting surface answers a business question first (cash, profit, owed) and reveals the formal debit/credit ledger underneath on demand. Meaning on top, mechanics below.
- **Earn trust by showing the work.** Auto-posted journals are visible, sourced, and provably balanced. Balance state is a first-class signal, never assumed.
- **Calm density.** Show a lot without feeling busy: tabular figures, hairline structure, one number that matters per view. Insight comes from arrangement, not from adding color or boxes.
- **Fast on the hot path.** Posting a manual entry and tracing a figure to its source are the two most-repeated actions; both should be quick, guided, and hard to get wrong.
- **One financial language.** Akuntansi is the spine; Ringkasan, Laporan, Hutang, and the ledger all speak the same tokens, table patterns, and money formatting so the whole Finance area reads as one system.

## Accessibility & Inclusion

- Target WCAG 2.1 AA: contrast on text and on the semantic state colors (success/warning/danger) against their tinted fills, visible focus rings, full keyboard operability for tables, filters, and the manual-entry flow.
- Never carry financial meaning by color alone (positive/negative money also reads via sign and label), supporting color-vision deficiency.
- Tabular figures and aligned columns are an accessibility feature here: they make money scannable and comparable, not just decorative.
- Respect reduced-motion; motion is supportive (state transitions, drill-down), never required to understand a number.
- Indonesian-language UI copy throughout, plain-language over accounting jargon for the owner persona.
