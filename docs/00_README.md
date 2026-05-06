# Tetra Ops — Documentation Hub

> **Operating System for Tetra Photobooth Business**
> Internal management platform for events, inventory, crew, and finance.

---

## 📚 Documentation Index

Dokumen-dokumen ini ditulis dengan urutan logis. Baca dari atas ke bawah untuk memahami sistem secara komprehensif. Setiap dokumen punya scope yang spesifik dan saling cross-reference.

### Strategic Documents (English — Read First)
1. **[01_PRD.md](./01_PRD.md)** — Product Requirements Document
   Vision, user personas, prioritized features, success metrics.

2. **[02_FSD.md](./02_FSD.md)** — Functional Specification Document
   Detailed module-by-module functional spec, user flows, business rules.

3. **[03_TSD.md](./03_TSD.md)** — Technical Specification Document
   Architecture decisions, tech stack rationale, security model.

4. **[04_DESIGN_SYSTEM.md](./04_DESIGN_SYSTEM.md)** — Design System
   Tokens, components, mobile patterns, accessibility.

### Build Artifacts (English — Reference While Coding)
5. **[05_DATABASE_SCHEMA.sql](./05_DATABASE_SCHEMA.sql)** — Complete Postgres schema
   Tables, indexes, triggers, RLS policies, seed data.

6. **[06_API_SPEC.md](./06_API_SPEC.md)** — API Specification
   Server actions, route handlers, data contracts.

7. **[07_FOLDER_STRUCTURE.md](./07_FOLDER_STRUCTURE.md)** — Project Structure
   File organization, naming conventions, import patterns.

8. **[08_IMPLEMENTATION_PLAN.md](./08_IMPLEMENTATION_PLAN.md)** — 4-Phase Roadmap
   Week-by-week build plan with milestones and dependencies.

### Vibecoding Aids (English — Use When Prompting AI)
9. **[09_ANTIGRAVITY_MASTER_PROMPT.md](./09_ANTIGRAVITY_MASTER_PROMPT.md)** — The Master Prompt
   Copy-paste this to start your Antigravity session.

10. **[10_PROMPT_LIBRARY.md](./10_PROMPT_LIBRARY.md)** — Reusable Prompts
    Templates for adding features, fixing bugs, refactoring.

11. **[11_TROUBLESHOOTING.md](./11_TROUBLESHOOTING.md)** — Common Issues & Fixes
    Errors you'll likely hit and how to solve them.

12. **[12_DECISION_LOG.md](./12_DECISION_LOG.md)** — Architecture Decision Records
    Why we chose what we chose. Read this if you're tempted to change something.

### Operations (Bahasa Indonesia — User-Facing)
13. **[13_ONBOARDING_WIZARD.md](./13_ONBOARDING_WIZARD.md)** — Setup Wizard Flow
    Step-by-step onboarding untuk first-time setup.

14. **[14_CSV_TEMPLATES.md](./14_CSV_TEMPLATES.md)** — Import Template Specs
    Format dan contoh untuk semua CSV import.

---

## 🚀 Quick Start untuk Rama

### Kalau lu mau langsung mulai coding:
1. Baca **[01_PRD.md](./01_PRD.md)** dulu (15 menit) — biar paham vision-nya
2. Skim **[02_FSD.md](./02_FSD.md)** (30 menit) — biar paham fitur-fiturnya
3. Buka **[09_ANTIGRAVITY_MASTER_PROMPT.md](./09_ANTIGRAVITY_MASTER_PROMPT.md)**
4. Copy seluruh master prompt → paste ke Antigravity
5. Follow Phase 1 di **[08_IMPLEMENTATION_PLAN.md](./08_IMPLEMENTATION_PLAN.md)**

### Kalau lu mau pahamin dulu sebelum coding:
1. Baca semua dokumen English dari atas ke bawah (~3-4 jam)
2. Setup environment (lihat **[03_TSD.md](./03_TSD.md)** Section 8)
3. Setup Supabase project (lihat **[05_DATABASE_SCHEMA.sql](./05_DATABASE_SCHEMA.sql)**)
4. Mulai vibecoding dengan **[09_ANTIGRAVITY_MASTER_PROMPT.md](./09_ANTIGRAVITY_MASTER_PROMPT.md)**

### Kalau lu stuck atau confused:
1. Cek **[11_TROUBLESHOOTING.md](./11_TROUBLESHOOTING.md)** dulu
2. Cek **[12_DECISION_LOG.md](./12_DECISION_LOG.md)** kalau lu mau ngubah arsitektur
3. Pakai prompt dari **[10_PROMPT_LIBRARY.md](./10_PROMPT_LIBRARY.md)** untuk minta bantuan AI

---

## 📦 Folder Contents

```
tetra-ops/
├── docs/                           ← Kamu di sini
│   ├── 00_README.md
│   ├── 01_PRD.md
│   ├── 02_FSD.md
│   ├── ... (15 dokumen total)
├── csv-templates/                  ← Template untuk import data
│   ├── template_packages.csv
│   ├── template_addons.csv
│   ├── template_inventory_consumables.csv
│   ├── template_inventory_equipment.csv
│   ├── template_master_crew.csv
│   └── template_active_events.csv
└── brand-assets/                   ← Placeholder untuk logo
    └── README.md (instruksi placement logo)
```

---

## 🎯 Project Vision (TL;DR)

**Tetra Ops** adalah internal operating system untuk Tetra Photobooth — bisnis photobooth event-based di Bogor yang melayani 8-20 event per bulan.

**Yang dibangun:**
- Event lifecycle management (booking → settlement → archived)
- Crew & operations command center
- Inventory dengan auto-deduction & valuation
- Finance dengan ledger, sinking funds, profit distribution
- Mobile-first PWA untuk crew di lapangan
- Smart notifications & anomaly detection

**Yang gak dibangun (di V1):**
- Customer-facing booking website (klien tetep DM/WA)
- Payment gateway (manual transfer ke BCA)
- Native mobile app (PWA cukup)
- Multi-tenant (single-tenant only)

---

## 🛠 Tech Stack Summary

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Next.js Server Actions + API Routes
- **Database:** Supabase (Postgres + Auth + Storage + Realtime)
- **File Storage:** Google Drive (via OAuth) untuk dokumentasi & bukti
- **Hosting:** Vercel (free tier)
- **PWA:** next-pwa + Workbox

Detail lengkap di **[03_TSD.md](./03_TSD.md)**.

---

## 🤝 Team & Roles

| Role | People | Access |
|------|--------|--------|
| Super Admin | Rama (Owner) | Full access + system config |
| Owner | Fahmi, Acuy, Iqbal | Full access (no system config) |
| Crew | 8 orang | Mobile view: jadwal, checklist, rekap, dokumentasi |

---

## 📅 Timeline (Flexible)

- **Phase 1 — Core (Weeks 1-6):** Auth, Master Data, Booking, Operations, Billing basic
- **Phase 2 — Finance & Inventory (Weeks 7-10):** Smart Warehouse, Omni Finance, Settlement
- **Phase 3 — Smart Features (Weeks 11-14):** Notifications, WhatsApp, Reports, PDF
- **Phase 4 — Polish (Weeks 15+):** Crew app, Drive integration, Analytics, Optimization

Detail di **[08_IMPLEMENTATION_PLAN.md](./08_IMPLEMENTATION_PLAN.md)**.

---

## 📞 Contact & Support

Kalau ada pertanyaan saat development, gunakan **[10_PROMPT_LIBRARY.md](./10_PROMPT_LIBRARY.md)** untuk minta bantuan AI dengan prompt yang efektif.

---

**Last Updated:** Initial creation
**Version:** 1.0.0-planning
**Status:** Pre-development (Documentation phase)
