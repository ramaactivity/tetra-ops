# AUDIT_SCREENSHOTS Index

**Captured:** 2026-05-20
**Renamed:** 2026-05-21

Visual evidence for [AUDIT_PER_MODULE_2026-05.md](../AUDIT_PER_MODULE_2026-05.md). Module numbers match the audit doc.

## Coverage matrix (in-scope modules)

| # | Module | Desktop 1280 | Mobile 375 | Extra views |
| - | ------ | ------------ | ---------- | ----------- |
| 1 | Dashboard | ✅ `01-dashboard-1280.png` | ❌ missing | — |
| 2 | Reminders | ✅ `02-reminders-1280.png` | ✅ `02-reminders-375.png` | — |
| 3 | Notifications | ✅ `03-notifications-1280.png` | ✅ `03-notifications-375.png` | — |
| 4 | Billing | ✅ `04-billing-1280.png` | ✅ `04-billing-375.png` | `04-billing-list-scrolled-375.png` |
| 5 | Finance | ✅ `05-finance-1280.png` | ✅ `05-finance-375.png` | `05-finance-profit-scrolled-375.png`, `05-finance-settlements-scrolled-1280.png` |
| 6 | Reports | ✅ `06-reports-1280.png` | ✅ `06-reports-375.png` | `06-reports-pnl-scrolled-375.png` |
| 7 | Warehouse | ✅ `07-warehouse-1280.png` | ✅ `07-warehouse-375.png` | `07-warehouse-consumables-375.png` |
| 8 | Contacts (`/settings/contacts`) | ❌ missing | ❌ missing | — |
| 9 | Audit Log (`/settings/audit-log`) | ❌ missing | ❌ missing | — |
| 10 | Settings (root) | ✅ `10-settings-root-1280.png` | ✅ `10-settings-root-375.png` | sub-routes ↓ |
| 10 | Settings/packages | ✅ `10-settings-packages-1280.png` | ❌ | — |
| 10 | Settings/addons | ✅ `10-settings-addons-1280.png` | ❌ | — |
| 10 | Settings/backdrops | ✅ `10-settings-backdrops-1280.png` | ❌ | — |
| 10 | Settings/vendors | ✅ `10-settings-vendors-1280.png` | ❌ | — |
| 10 | Settings/bank-accounts | ❌ missing | ❌ missing | — |
| 10 | Settings/crew | ❌ missing | ❌ missing | — |
| 10 | Settings/items | ❌ missing | ❌ missing | — |
| 10 | Settings/notification-rules | ❌ missing | ❌ missing | — |
| 10 | Settings/sinking-funds | ❌ missing | ❌ missing | — |
| 10 | Settings/whatsapp-templates | ❌ missing | ❌ missing | — |
| 11 | Crew Portal | n/a (mobile-first) | ✅ 6 phone screenshots (`11-crew-*-mobile.jpeg`) | home, jadwal, alat, fee, profile, rekap-detail |

**In-scope summary: 9 of 11 modules covered.** Missing entirely: Contacts, Audit Log. Settings: only 4 of 12 sub-routes covered.

## Bonus coverage (out of audit scope but useful)

These are operations cluster + design hub captures — already documented in `REPORT_OPERATIONS_CONSISTENCY.md`, so they're confirmation evidence rather than audit input:

| Surface | Files |
| ------- | ----- |
| `/operations` list | `operations-list-1280.png`, `operations-list-375.png`, `operations-list-scrolled-375.png` |
| `/operations/[id]/edit` (booking form) | `operations-edit-1280.png`, `operations-edit-375.png` |
| `/operations/[id]/rekap` | `operations-rekap-1280.png`, `operations-rekap-375.png` |
| `/design` (top-level Design Hub) | `design-hub-1280.png`, `design-hub-375.png` |

## Gaps to fill (if user wants 100% coverage before sending audit)

To complete the audit visual evidence, capture these 9 surfaces:

1. `01-dashboard-375.png` — open `/dashboard` at 375px viewport
2. `08-contacts-1280.png` + `08-contacts-375.png` — `/settings/contacts`
3. `09-audit-log-1280.png` + `09-audit-log-375.png` — `/settings/audit-log`
4. `10-settings-crew-1280.png` — `/settings/crew` (the "overloaded 3-table" page from old audit)
5. `10-settings-items-1280.png` — `/settings/items`
6. `10-settings-notification-rules-1280.png` — `/settings/notification-rules`
7. `10-settings-sinking-funds-1280.png` — `/settings/sinking-funds`
8. `10-settings-bank-accounts-1280.png` — `/settings/bank-accounts` (the "read-only P0" page)
9. `10-settings-whatsapp-templates-1280.png` — `/settings/whatsapp-templates`

Optional but valuable:
- Mobile counterparts for Settings sub-routes (verify mobile breakage)
- `stock-adjust-dialog` modal screenshot — open the dialog
- Auth pages (login, onboarding, pending) — verify rounded-2xl + shadow-xl lint hits

## Notes for AI reviewer reading this

- All filenames follow the audit doc convention: `NN-module[-variant]-viewport.ext`.
- "-scrolled-" suffix = page-scroll variant of the same route at the same viewport.
- "-mobile" suffix on jpeg = actual mobile phone screenshot (crew portal user's device), not Chrome DevTools responsive mode.
- The crew portal screenshots are from a real Android device (Farhan Mauludi's account, captured at 14:50-14:51), so they reflect actual touch UX, not emulated.
- Dashboard mobile is the one gap a reviewer will likely flag — easy to fix (DevTools responsive mode at 375px on `/dashboard`).
