# 02 — Functional Specification Document (FSD)

**Project:** Tetra Ops
**Version:** 1.0.0
**Companion to:** [01_PRD.md](./01_PRD.md)

---

## Document Structure

This FSD describes WHAT each module does and HOW users interact with it. Implementation details (code structure, libraries, etc.) are in [03_TSD.md](./03_TSD.md).

**Modules covered:**
1. Authentication & User Management
2. Dashboard
3. Master Data Management
4. New Booking (Event Creation)
5. Operations Command (Event Lifecycle)
6. Billing & Invoicing
7. Crew Mobile App
8. Smart Warehouse (Inventory)
9. Omni Finance (Cash, Ledger, Sinking Funds)
10. Settlement Engine
11. Notifications & Anomaly Radar
12. Reports & Analytics
13. Settings & System Configuration
14. Onboarding Wizard

---

## Module 1 — Authentication & User Management

### 1.1 Overview
Single sign-on via Google OAuth. No email/password fallback. All users must have a Gmail account (verified for Tetra team).

### 1.2 User Roles

| Role | Code | Permissions |
|------|------|-------------|
| Super Admin | `super_admin` | Full access including system config, user management, dangerous operations (delete events, override locks) |
| Owner | `owner` | Full access except system config and user management |
| Crew | `crew` | Mobile-first view: own schedule, event details, equipment checklist, consumable rekap, fee history |

**Role assignment:** Manual by Super Admin via Settings → Master Crew. New Google sign-in creates a `pending_approval` user that must be promoted by Super Admin.

### 1.3 Authentication Flow

**First-time login:**
1. User clicks "Sign in with Google" on `/login`
2. OAuth consent screen (Supabase Auth handles this)
3. Returns to app
4. System checks if email exists in `users` table
   - **Yes:** Login successful, redirect based on role
   - **No:** Create user record with `role = 'pending_approval'`, show "Akun kamu menunggu persetujuan admin"
5. Super Admin gets notification of pending user
6. Super Admin assigns role → user can now access

**Returning login:**
1. Click "Sign in with Google"
2. OAuth (cached, fast)
3. Direct redirect to role-appropriate dashboard

### 1.4 Role-Based Routing

After successful auth, redirect based on role:
- `super_admin` / `owner` → `/dashboard` (full desktop-optimized dashboard)
- `crew` → `/crew` (mobile-first crew dashboard)
- `pending_approval` → `/pending` (waiting screen)

### 1.5 Session Management
- Session token stored in HTTP-only cookie (Supabase default)
- Auto-refresh token before expiry
- Logout via top-right menu → clears session, redirect to `/login`
- Session timeout: 7 days inactivity

### 1.6 Security Considerations
- Row Level Security (RLS) enforced at database level
- Crew users CANNOT see other crews' fees, owner financial data, or system config
- Owner users CANNOT see super admin operations like user role changes
- Audit log records every role change with timestamp + actor

---

## Module 2 — Dashboard

### 2.1 Overview
Role-aware home screen. Different content for owner vs crew.

### 2.2 Owner Dashboard (`/dashboard`)

**Layout:** Single page, vertical scroll, 3-column grid on desktop / single column on mobile.

**Section A — Hero KPI Cards (4 cards horizontal):**
1. **Cash Position** — Total saldo across all bank accounts. Color: emerald if positive trend, neutral if flat.
2. **This Month Revenue** — Sum of paid invoices this month. With % vs last month.
3. **Outstanding** — Total piutang (unpaid + DP partial). Color: amber if >Rp 5jt, red if >Rp 15jt.
4. **Net Profit MTD** — Calculated profit for current month. Color: emerald or rose.

**Section B — Event Pipeline (horizontal scroll cards):**
- Card per status: `Upcoming (next 7 days)`, `In Progress`, `Awaiting Settlement`, `Completed This Month`
- Each card shows count + clickable to filter Operations view

**Section C — Quick Actions (4 large buttons):**
- ➕ New Booking
- 💰 Log Payment
- 📊 Settle Event
- 📦 Restock Item

**Section D — Today & Tomorrow (timeline):**
- Vertical timeline of events
- Each event card: name, time, venue, assigned crew (avatars), status badge
- Click → navigate to event detail

**Section E — Anomaly Radar (collapsible alert panel):**
- Top 5 anomalies (e.g., "Event H-2 belum ada crew", "Stok Sleeve 2R kritis", "Invoice Naura overdue 3 hari")
- Each item has CTA button to resolve
- "Lihat semua" → opens dedicated anomaly page

**Section F — Recent Activity (audit feed, last 10):**
- "Rama log payment Rp 1.5jt for Gabby & Rafael — 5 menit lalu"
- "Settlement closed for Afra & Roif — 1 jam lalu"
- "Crew Mou checked-out 12 items — 2 jam lalu"

### 2.3 Co-Owner Dashboard (Variant for Fahmi/Acuy/Iqbal)

**Simplified version:** Same structure but financial details replaced with:
- **My Earnings This Month** — their personal cut (commission + profit share)
- **My Earnings YTD** — accumulated
- **Withdraw Available** — can be requested via form

Co-owners see business health (profit, events count) but NOT operational details like cash flow per account, or other owners' earnings.

### 2.4 Crew Dashboard (`/crew`) — Mobile-First

**Layout:** Single column, large touch targets, no sidebar.

**Section A — Greeting Card:**
- "Halo, Mou! 👋"
- "Hari ini kamu ada 2 event"

**Section B — Today's Events (large cards):**
- For each event today: time, venue, partner crew, status of prep
- Big "BUKA DETAIL" button per event

**Section C — Upcoming (next 7 days):**
- Smaller cards in horizontal scroll
- Tap to see full detail

**Section D — Quick Stats:**
- "Bulan ini: 6 event done"
- "Fee terkumpul: Rp 1.2jt"
- "Tap untuk detail"

**Section E — Bottom Navigation (5 tabs):**
- 🏠 Home
- 📅 Jadwal
- 📦 Alat
- 💰 Fee
- 👤 Profile

### 2.5 Performance Targets
- First Contentful Paint <1s on 4G
- Time to Interactive <2.5s
- All KPI calculations memoized server-side

---

## Module 3 — Master Data Management

### 3.1 Overview
CRUD for foundational business data. Lives in Settings menu but documented separately due to complexity.

### 3.2 Packages (Paket)

**Fields:**
- `name` (e.g., "2R Unlimited 3 Jam")
- `category` enum: `photobooth`, `videobooth_360`, `magazine_box`, `magazine_combo`, `photostage`, `photostage_combo`
- `frame_size` enum: `2R`, `4R`, `polaroid`, `none`
- `duration_hours` (integer)
- `base_price` (IDR)
- `description` (rich text)
- `is_active` (boolean)
- `default_consumables_estimate` (JSON: { sleeve: 80, mediaset: 100, flashdisk: 1 } — rough estimate per event for stock forecasting)

**Operations:**
- List view with search & filter by category
- Create: form with validation, preview card
- Edit: same form, soft-update (price changes don't affect existing bookings)
- Archive (soft delete): can't be selected for new bookings, but historical data preserved
- Bulk import via CSV

**Pre-seeded data** (from Tetra Pricelist 2026):
- 2R Unlimited (2-8 jam): Rp 2jt - 5jt
- 4R Unlimited (2-8 jam): Rp 2jt - 5jt
- Polaroid Unlimited (2-8 jam): Rp 2jt - 5jt
- Videobooth 360 (2-8 jam): Rp 2.5jt - 5.5jt
- Magazine Combo (3-8 jam): Rp 5.5jt - 7jt
- Magazine Box Only (8 jam): Rp 2.5jt
- Photo Stage Only (2-3 jam): Rp 1.5jt - 2jt
- Photo Stage Combo (2-3 jam): Rp 4jt - 4.5jt
- 1 Jam OTS Extend: Rp 500k

### 3.3 Add-ons

**Fields:**
- `name` (e.g., "Voucher Photobooth 100 pcs")
- `unit` (e.g., "100 pcs", "50 cetak", "1 jam")
- `price` (IDR)
- `category` enum: `voucher`, `print_extras`, `time_extras`, `experience`, `costume`
- `requires_extra_crew` (boolean) — if true, suggests adding crew B+ during booking
- `is_active`

**Pre-seeded:**
- Voucher Photobooth 100 pcs: Rp 25k
- Guest Books Photo 25 lembar: Rp 200k
- Photomagnet 50 cetak: Rp 350k
- Break Time / 1 Jam: Rp 150k
- Album Photostripe 20 halaman: Rp 100k
- Costume Sleeve 1000 lembar: Rp 1.5jt
- Keychain Photobooth Station: Rp 10k/pcs (`requires_extra_crew = true`)

### 3.4 Master Crew

**Fields:**
- `full_name`
- `nickname` (used in compact UI: "L: MOU", "A: CECA")
- `email` (for OAuth match)
- `phone_wa`
- `role`: `super_admin` | `owner` | `crew`
- `tier` (only if role=crew): `senior` | `junior`
- `default_fee_override` (IDR, nullable) — uses tier rate if null
- `bank_account` (for fee disbursement reference)
- `joined_date`
- `is_active`
- `avatar_url`
- `notes` (private notes by admin)

**Operations:**
- List with avatar grid + filter by role/tier
- Edit: change tier, update fee override, deactivate
- Cannot delete if crew has historical events (only deactivate)
- Promote pending users to active role

### 3.5 Items (Inventory Master)

**Fields:**
- `name` (e.g., "Sleeve 2R", "Acrylic Keychain Frame Bulat")
- `sku` (auto-generated: `ITM-XXXX`)
- `category` enum: `consumable` | `equipment`
- `unit` (e.g., "pcs", "box", "set", "lembar")
- `unit_conversion` (JSON, e.g., `{ "box": 1400, "pcs": 1 }` — 1 box = 1400 pcs)
- `coa_account` (Chart of Accounts code, auto-mapped)
- `current_stock` (real-time from movements)
- `min_stock_alert` (threshold for low-stock warning)
- `purchase_price_avg` (rolling average of last 5 purchases — for HPP calculation)
- `selling_price` (for items sold separately, e.g., keychain Rp 10k/pcs)
- `is_active`
- `image_url` (optional)

**Equipment-specific fields:**
- `purchase_date`
- `purchase_price` (original)
- `useful_life_months` (for depreciation)
- `current_book_value` (auto-calculated)
- `condition` enum: `normal` | `service` | `damaged` | `lost`
- `current_location` enum: `gudang_pusat` | `event` (with event_id) | `service_center` | `crew_carry` (with crew_id)

**Pre-seeded equipment categories** (from existing Tetra inventory):
- Album Foto, Andoer Klip, Baut Monitor, Box Kacamata, etc.
- Cameras, lighting, printers, laptops, frames
- Each with current count (input via onboarding)

### 3.6 Bank Accounts

**Fields:**
- `account_name` (e.g., "Bank BCA - Rama")
- `bank_name` (e.g., "BCA")
- `account_number` (masked in UI, full only for super admin)
- `account_holder`
- `coa_code` (e.g., "1-110")
- `is_default_receive` (only one can be default)
- `is_active`

**Pre-seeded** (from Apps Script v1):
- Kas Tunai (1-100)
- Bank BCA (1-110, default)
- Bank Mandiri (1-111)
- Bank BSI (1-112)

---

## Module 4 — New Booking (Event Creation)

### 4.1 Overview
The most-used form in the system. Optimized for owner speed (target: <2 min from open to save).

### 4.2 Layout Strategy

**Single-page form with sticky summary** (NOT multi-step wizard):
- Multi-step is what v1 used and was tedious
- Single page with smart sections is faster for power users
- Sticky bottom bar shows running total + Save button
- All sections expanded by default, collapsible after fill

### 4.3 Form Sections

#### Section 1 — Klien & Sumber (Channel)

**Channel selector (segmented control):**
- 🟦 Direct (Tetra phone)
- 🟧 Vendor / EO
- 🟪 Relasi / Crew Referral

**Conditional fields per channel:**

*If Direct:*
- Sales Owner: auto-set to Rama (read-only)
- Commission preview: shows Rp 100k / Rp 50k / Rp 0 based on discount applied later

*If Vendor:*
- Vendor Name (autocomplete from previous vendors, or new)
- Vendor Commission: input field (default 10%, can override with absolute amount)
- Vendor Contact

*If Relasi:*
- Referrer Type: Owner | Crew (radio)
- Referrer Person (dropdown from team)
- Commission: Rp 100k flat (editable)

**Klien Utama (always required):**
- Nama klien (text)
- WhatsApp number (with country code +62)
- Email (optional)

**PIC Lapangan (toggle: "Sama dengan klien utama"):**
- If different: Nama PIC + WA PIC

#### Section 2 — Spesifikasi Layanan

**Service Type (segmented):**
- Photobooth Classic
- Videobooth 360
- Magazine Box + Photobooth
- Magazine Box Only
- Photo Stage Only
- Photo Stage + Photobooth

**Frame Size (only for relevant types):**
- 2R | 4R | Polaroid | Custom

**Package picker (smart dropdown):**
- Filtered to active packages matching service type + frame
- Shows price next to name
- Custom option: text input + manual price

**Add-ons (multi-select with quantity):**
- Multi-select dropdown showing all active addons
- Quantity input per selected addon
- Auto-suggestion: if "Keychain Photobooth" selected → toast "Disarankan tambah crew B+ untuk operator keychain"

#### Section 3 — Detail Acara (Event)

**Kategori Acara (dropdown):**
- Pernikahan, Khitanan, Ulang Tahun, Corporate, Gathering, Birthday, Anniversary, Custom

**Tanggal & Waktu:**
- Tanggal acara (date picker, with conflict warning)
- Jam mulai cetak (time picker)
- Auto-calculated fields displayed:
  - Setup crew (H-2 jam): e.g., "12:30"
  - Mulai cetak: e.g., "13:30 (input)"
  - Selesai: jam mulai + duration paket: e.g., "16:30"
- Override toggle: "Atur waktu manual" → shows 3 time inputs

**Conflict Warning (real-time):**
- If date already has events → yellow banner: "Hari ini ada 1 event lain: Gabby & Rafael (17:00-20:00). Pastikan crew tidak overlap."
- If date is full (e.g., 4 events same day, all crew booked) → red banner

#### Section 4 — Lokasi

**Nama Venue/Gedung** (text)

**Pinpoint Google Maps:**
- Paste link from Google Maps
- Or "Buka Maps" button → opens Maps in new tab to find location
- Auto-detect city from URL (parsed)

**Catatan Logistik:**
- Free text area (e.g., "Loading lewat basement, sepatu tertutup, parkir terbatas")

#### Section 5 — Detail Kustomisasi

**Sumber Backdrop:**
- Basic Tetra (default — uses Tetra's standard backdrops)
- Klien Sediakan (custom client backdrop)

*If Basic Tetra:*
- Warna kain: Merah | Gold | Putih | Silver (color swatch picker)

**Include Flashdisk Pouch?** (toggle, default: ON)
- If on, system reserves 1 flashdisk + 1 pouch from inventory at settlement

**Catatan Khusus** (for crew):
- Free text (e.g., "Wajib pakai pakaian rapi", "Klien minta foto extra dengan pengantin", "Bawa stand cadangan")

#### Section 6 — Crew Assignment

**Lead/Operator (Kru A):** Dropdown of active senior crew
**Asisten (Kru B):** Dropdown of active crew (senior or junior)
**Crew C (optional):** Shown only if event has add-ons that trigger `requires_extra_crew = true`

**Smart filter:**
- If selected date has other events, show available crew at top, busy crew at bottom (greyed)
- Cannot select crew already assigned to overlapping time event (blocked)
- Warning if non-overlapping but same day: "Mou sudah di-assign event jam 09-12, event ini jam 18-20. OK lanjut?"

**Auto-fee preview:**
- Shows: "Lead: Rp 200k (Senior) | Asisten: Rp 150k (Junior) | Total fee crew: Rp 350k"

#### Section 7 — Modifiers & Keuangan

**Diskon Khusus** (IDR or %):
- Input as IDR amount
- Live calc: shows % of base
- If channel = Direct AND % > 10 → commission preview updates to Rp 0
- If channel = Direct AND % ≤ 10 → Rp 50k
- If channel = Direct AND % = 0 → Rp 100k

**Gross-up PPh:**
- Toggle (default: OFF)
- If on, adds % to total (configurable in Settings, default 1.75% for PPh23)

**Commission Override (Vendor/Relasi):**
- Pre-filled based on channel
- Can override absolute amount

#### Section 8 — Down Payment

**DP Mode:**
- Radio: "Belum Bayar" | "DP Default (Rp 500k)" | "DP Custom" | "Bayar Lunas Sekarang"

*If DP Custom:*
- Input amount

*If Bayar Lunas:*
- Pre-fills with Grand Total

**Masuk ke Kas/Bank:**
- Dropdown of bank accounts (default: Bank BCA)

**Bukti Transfer (optional):**
- File upload (max 2MB, JPG/PNG)
- Stored in Supabase Storage with link

#### Section 9 — Sticky Summary Bar (always visible)

```
┌─────────────────────────────────────────────────────┐
│ Grand Total: Rp 2.200.000                           │
│ DP Diterima: Rp 500.000  |  Sisa Tagihan: Rp 1.7jt │
│ [Batal]                       [💾 Simpan & Buat]    │
└─────────────────────────────────────────────────────┘
```

### 4.4 Validation Rules

- Tanggal acara cannot be in past (unless super admin override)
- Jam mulai cetak required if package has duration
- Crew Lead required (Asisten optional but warning if empty)
- Klien WA number must match Indonesia format (+62 or 08...)
- Grand Total must be > 0
- DP cannot exceed Grand Total

### 4.5 Save Behavior

On click "Simpan & Buat Project":

1. Validate all required fields (highlight errors inline)
2. Generate `project_id` format: `PRJ-{YYYYMMDD}-{4-digit-random}`
3. Insert into `events` table
4. If DP > 0 → insert into `payments` table + ledger entries
5. Create journal entries (revenue accrual, AR if not lunas)
6. Trigger notifications:
   - To assigned crew: "Kamu di-assign event baru: {name} pada {date}"
   - To owner Rama: "Booking baru tersimpan: {name} - Rp {grand_total}"
7. Redirect to event detail page with success toast

### 4.6 Edit Booking

Same form, but:
- Title shows "Edit: {project_name}"
- Some fields locked once event status > `confirmed` (e.g., can't change package after settlement)
- Audit log records every change

---

*[FSD continues in next part]*

*Continued from [02_FSD_part1.md](./02_FSD_part1.md)*

---

## Module 5 — Operations Command (Event Lifecycle)

### 5.1 Overview
Central hub for managing all events through their lifecycle. 4 view modes for different mental models.

### 5.2 Event Lifecycle States

```
draft → confirmed → design_brief → design_approved → upcoming → in_progress → awaiting_settlement → completed → archived
                                                                                                       ↓
                                                                                                   cancelled
```

| State | Description | Trigger |
|-------|-------------|---------|
| `draft` | Booking saved without DP | Owner creates event without payment |
| `confirmed` | DP received | Payment recorded, DP ≥ Rp 500k |
| `design_brief` | Design phase started | Owner moves to design |
| `design_approved` | Frame design approved by client | Owner marks approved |
| `upcoming` | Ready, < 7 days to event | Auto by date |
| `in_progress` | Event day, crew on-site | Auto on event date OR crew check-in |
| `awaiting_settlement` | Event done, needs closing | Crew submits rekap OR owner marks done |
| `completed` | Settlement done, books closed | Owner closes settlement |
| `archived` | Old completed events | Auto after 30 days |
| `cancelled` | Event cancelled by client | Owner manual action |

### 5.3 View Modes

#### View 1: List View (Default — Power User)

**Layout:** Table with columns:
- Project & Klien (name + project_id + channel badge)
- Jadwal & Waktu (date, setup time, start-end time)
- Spesifikasi & Lokasi (paket name, venue with location pin)
- Kru Lapangan (Lead avatar with "L:" + Asst avatar with "A:")
- Aksi & Status (status badge + Edit Form button + Action button per state)

**Filters (top bar):**
- Year selector (default: current year)
- Month selector (default: current month, or "All")
- Status: Semua | Upcoming | Done
- Search: by client name or project_id

**Sort:** Default by event date ascending. Click column header to sort.

**KPI Cards (above table):**
- Target Bulanan (e.g., "7/10")
- Upcoming (count)
- Antri Desain (count of design_brief state)
- Selesai/Done (count this month)

**Color stripe on row left edge** indicating status:
- Green: completed
- Indigo: upcoming
- Amber: in_progress
- Red: cancelled or has anomaly

#### View 2: Board View (Kanban)

**Columns** = Lifecycle states
**Cards** = Event with key info: name, date, lead crew avatar, payment status

**Drag-and-drop** to change state (with confirmation modal for destructive moves like → cancelled)

**Use case:** Visual overview of pipeline distribution

#### View 3: Design Hub View

**Filtered to events in design phase only** (`design_brief` or `design_approved`)

**Columns:**
- Project & Klien
- Tema Desain & Info (frame size, paket, theme notes)
- Timeline & Urgency (event date + days remaining badge: "H-3" red if <3 days)
- Status Pipeline (Brief Masuk | Menunggu ACC | ACC ✅)
- Action (Edit Ops | Open Design Folder)

**Special UX:**
- Click "Open Design Folder" → opens Google Drive folder for that event (auto-created on booking)
- Status changes via dropdown
- "ACC" status auto-progresses to upcoming state

#### View 4: Calendar View

**Standard month calendar** with event chips on dates

**Visual cues:**
- Multiple events same day → stacked chips with count badge "+2"
- Color by state
- Click chip → mini event detail popover
- Click "lihat detail" → full event page

**Quick navigation:** Prev/Next month, Jump to today

### 5.4 Event Detail Page

**URL:** `/operations/{project_id}`

**Layout:** 2-column on desktop (60% main / 40% sidebar), single column on mobile.

**Main column sections:**

1. **Header** — Project name + project_id + status badge + action menu (3-dot)
2. **Quick Stats** — 4 inline cards: Grand Total, Sisa Tagihan, Crew Lead, Tanggal/Time
3. **Tabs:**
   - Overview (default)
   - Klien & Kontak
   - Spesifikasi & Lokasi
   - Crew & Equipment
   - Pembayaran (with payment timeline)
   - Rekap Lapangan (consumable usage report from crew)
   - Settlement (only after event date)
   - Activity Log (audit trail)

**Sidebar:**
- Action buttons (state-aware): Edit | Settle | Cancel | Generate Invoice | Generate WA
- Notes & comments (internal team)
- Linked files (Google Drive folder shortcuts)

### 5.5 Action Menu (Per Event)

State-aware actions appear contextually:

| State | Available Actions |
|-------|------------------|
| draft | Edit, Add Payment, Cancel |
| confirmed | Edit, Add Payment, Move to Design, Cancel |
| design_brief | Edit, Mark Design Approved, Open Design Folder |
| design_approved | Edit, Mark as Upcoming, View Design |
| upcoming | Edit, Generate Confirm WA (H-1), Send to Crew |
| in_progress | View Live Status, Force Close |
| awaiting_settlement | Open Settlement Modal, Edit Rekap |
| completed | View Report, Generate Invoice PDF, Re-open (admin only) |
| cancelled | Restore (admin only), View Reason |

### 5.6 Bulk Operations

**Select multiple events** (checkbox in list view) for:
- Bulk export to Excel
- Bulk status update (limited cases)
- Bulk WA reminder send

---

## Module 6 — Billing & Invoicing

### 6.1 Overview
Manages all financial obligations between Tetra and clients. Replaces v1's "Billing & Tagihan" module with cleaner UX.

### 6.2 Main View

**KPI Cards (4 horizontal):**
1. **Uang Menggantung (Sisa)** — sum of unpaid + DP partial balances. Amber color.
2. **Overdue (Jatuh Tempo)** — sum of balances past due date. Red color, with count badge.
3. **Uang Masuk (Collected)** — total paid this month. Green.
4. **Estimasi Total Omzet** — sum of all event grand totals this month.

**Filters:**
- Year + Month selector
- Status tabs: Semua | UNPAID | DP/PARTIAL | LUNAS | OVERDUE
- Search by client name

**Invoice List:**
Each row shows:
- Klien & Referensi (name + project_id)
- Jadwal Event & Tempo (event date + due date with color: green if not yet due, amber if <3 days, red if past)
- Nilai Tagihan (Total / Masuk / Sisa breakdown)
- Status Bayar (badge: UNPAID/DP/LUNAS/OVERDUE)
- Actions (3 buttons: 💬 WA Reminder | 💵 Log Payment | 🧾 View Invoice)

### 6.3 Payment Logging Modal

**Trigger:** Click "Log Payment" button on any invoice row

**Modal contents:**

*Left column:*
- Sisa Tagihan (Balance) — large, bold, color-coded
- Status badge (BELUM LUNAS / LUNAS)
- Tanggal Bayar (date picker, default today)
- Uang Masuk (Rp) — input field
- Quick buttons: "Bayar Lunas" (auto-fills balance) | "DP 500rb" | "DP Custom"
- Masuk ke Kas/Bank (dropdown)
- Note field (optional, e.g., "Transfer dari rekening adik klien")

*Right column:*
- Upload Bukti TF (drag-drop area, max 2MB, JPG/PNG, optional)
- Riwayat Uang Masuk (list of previous payments for this invoice with date, amount, account, view-proof link)

**On Submit:**
1. Validate amount ≤ remaining balance (or = if "Lunas")
2. Insert payment record
3. Update event payment_status (auto-calc based on total_paid vs grand_total)
4. Create journal entries (Cash Dr, AR Cr)
5. Update bank balance
6. Trigger notification if status becomes LUNAS
7. Close modal, show success toast, refresh list

### 6.4 Invoice Generation

**Generate Invoice PDF** (per event):
- Uses brand-aligned template (Playfair Display heading, Inter body, Tetra logo)
- Sections: Header (Tetra info), Bill To (client), Project details, Itemized breakdown (paket + add-ons + discounts), Total, Payment terms, Footer with bank info
- Generates A4 PDF, downloadable + viewable in browser
- Option to "Send via WA" → generates wa.me link with pre-filled message + invoice as image (or link to PDF)

**Quotation PDF** (separate):
- For pre-confirmation events, no payment terms yet
- Template very similar to invoice but marked "QUOTATION" + valid until date

**BAST PDF** (Berita Acara Serah Terima):
- Generated post-event for corporate clients who require formal handover doc
- Lists deliverables: photo prints, softcopy, dokumentasi link, etc.

### 6.5 Auto-Reminder System

**Default rules** (configurable in Settings):
- 7 days before event: WA reminder if DP not received
- 3 days before event: WA reminder if not LUNAS
- 1 day after due date: WA reminder if OVERDUE
- 7 days after due date: Escalation reminder

**Trigger modes:**
- **Manual:** Owner clicks "Send Reminder" button on overdue rows
- **Scheduled:** Daily at 9 AM WIB, system checks and queues reminders. Shows in dashboard "5 reminders ready to send" with one-click bulk send.

**Why not auto-send?** Owner control. Some clients have personal context (e.g., negotiating, paying offline).

### 6.6 WhatsApp Templates (Configurable)

Settings → WhatsApp Templates. Pre-filled templates with variables:
- `{client_name}`, `{project_id}`, `{event_date}`, `{remaining_balance}`, `{bank_info}`

Default templates:
- Konfirmasi Booking (post-DP)
- Reminder DP (H-7 belum DP)
- Reminder Pelunasan (H-3 belum lunas)
- Konfirmasi H-1
- Thank You + Settlement
- Reminder Overdue (D+1)

**Generate WA Link** button:
- Constructs `https://wa.me/{phone}?text={url-encoded-message}`
- Opens new tab → user reviews and sends manually

---

## Module 7 — Crew Mobile App (`/crew/*`)

### 7.1 Overview
Mobile-first PWA experience for field crew. Designed for one-handed phone use with thumb-friendly tap targets.

### 7.2 Layout Principles

- **Bottom navigation** with 5 tabs (Home, Jadwal, Alat, Fee, Profile)
- **No sidebar** — sidebar only for owner/admin desktop
- **Pull-to-refresh** on all list views
- **Skeleton loaders** for instant perceived performance
- **Optimistic UI** for all updates
- **Offline-capable** for event detail view (cached after first load)

### 7.3 Home Tab (`/crew`)

Refer to Module 2.4 — Crew Dashboard.

### 7.4 Jadwal Tab (`/crew/jadwal`)

**View modes (segmented control):**
- Hari Ini
- Minggu Ini
- Bulan Ini

**Each event card shows:**
- Date + time prominent
- Event name (klien)
- Venue
- Role badge: "LEAD" or "ASISTEN"
- Partner crew name
- Status indicator (upcoming/in_progress/done)
- Tap → event detail

**Filter:** Quick chips to filter by status

### 7.5 Event Detail (`/crew/event/{project_id}`)

**Layout:** Single column, top-to-bottom information hierarchy by importance.

**Section 1 — Hero Card:**
- Status badge
- Event name + tanggal
- Big "BUKA NAVIGASI" button → opens Google Maps with venue coordinates

**Section 2 — Waktu & Lokasi:**
- Setup: 12:30 (kru harus tiba)
- Mulai cetak: 13:30
- Selesai: 16:30
- Venue name
- Address (tap to copy)
- Catatan logistik (highlighted box)

**Section 3 — Spesifikasi:**
- Paket: "2R Unlimited 3 Jam"
- Frame: 2R
- Background: Basic Tetra - Silver
- Include flashdisk pouch: Yes
- Add-ons: Photomagnet (1)

**Section 4 — Tim Kru:**
- Lead: Rama (You) atau partner
- Asisten: Mou
- Crew C: (jika ada)

**Section 5 — Kontak Penting:**
- Klien: Afra & Roif | +6282210509609 | tap to call/WA
- PIC Lapangan: Uyun | +6281xxx | tap to call/WA

**Section 6 — Catatan Khusus:**
- Highlighted text from owner
- Examples: "Wajib pakai hitam-hitam", "Klien minta foto extra dengan pengantin"

**Section 7 — Action Buttons (sticky bottom):**
- ✅ Check-out Alat (opens equipment checklist)
- 📸 Upload Dokumentasi (opens Google Drive folder)
- 📊 Submit Rekap (after event done)

### 7.6 Equipment Check-out / Check-in (`/crew/event/{project_id}/equipment`)

**Pre-event Check-out flow:**

**Screen 1 — Default Checklist:**
- System suggests equipment based on event paket (e.g., 2R needs Printer DNP, Camera Sony A7, Lighting set, Background frame, Flashdisk)
- Shows current location of each item (gudang_pusat / event_other / lost)
- Crew checks each item: ☐ Pcs (qty for some) | Status: OK | Rusak | Hilang
- Can add ad-hoc items: search inventory + qty

**Screen 2 — Confirm:**
- Summary of items checked-out
- Damage notes per item if applicable
- Photo of full setup (optional but recommended)
- "Konfirmasi & Berangkat"

**On submit:**
- Update equipment locations to event_id
- Create equipment_movement records
- Notify owner: "Mou checked-out 12 items for Afra & Roif event"

**Post-event Check-in flow:**

Similar but reverse:
- All checked-out items shown
- Crew confirms each: Returned OK | Damaged | Lost
- Photos required for damage/loss
- "Konfirmasi Selesai"

**On submit:**
- Update equipment locations back to gudang_pusat (or service_center if damaged)
- Create movement records
- If damage/loss: trigger formal incident report flow

### 7.7 Submit Rekap (`/crew/event/{project_id}/rekap`)

**The most important feature for owner workflow optimization.**

**Form fields:**

*Section A — Cetak (Photo Prints):*
- Total Cetak (Pcs) — input number
- Auto-calculated below: "Estimasi Media Set: ~{calc} pcs | Sleeve: ~{calc} pcs"
- Calculation rules from system:
  - 2R: 1 sheet media = 4 cetak (cut into 4 strips per sheet) → media_set = ceil(cetak / 4)
  - 4R: 1 sheet media = 1 cetak → media_set = cetak
  - Polaroid: similar to 4R
- Manual override: "Atur manual" toggle → input media_set + sleeve directly

*Section B — Flashdisk/Pouch (if include_flashdisk_pouch = true):*
- FD Used: number
- Pouch Used: number

*Section C — Add-on Consumables (conditional):*
- If event has Photomagnet add-on → input "Photomagnet Cetak" pcs
- If Keychain Station → input keychain pcs

*Section D — Bukti Foto (REQUIRED):*
- Upload 1-3 photos as proof
- Examples: foto pile of unused sleeve, foto tampilan booth, foto group sama klien
- Min 1 photo required to submit

*Section E — Catatan Crew:*
- Free text (e.g., "Acara molor 30 menit, kita extend on the day", "Klien minta cetak ulang 5 lembar karena pose blur")

**On submit:**
- Save rekap with photos to Supabase Storage
- Auto-deduct consumables from inventory (create stock_movement records)
- Update event status to `awaiting_settlement`
- Notify owner: "Rekap submitted by Mou for Afra & Roif. Tap to review and settle."

**Owner side:** Can edit rekap before settlement if numbers seem off (with audit log).

### 7.8 Fee Tab (`/crew/fee`)

**Period selector:** This Month | Last Month | Custom Range

**Summary cards:**
- Total Earned (sum)
- Events Done (count)
- Avg per Event

**Per-event breakdown list:**
- Event name + date
- Role (Lead / Asisten / Crew C)
- Base fee (Rp 200k or Rp 150k)
- Override applied? (yes/no, with reason if yes)
- Bonus (if any, e.g., overtime)
- Total received

**Status:** Paid / Pending (if owner hasn't disbursed yet)

**Note:** Fee disbursement to crew is currently MANUAL (owner pays via transfer). System tracks "to be paid" balance per crew. Owner marks "paid" when transferred. Future: automate via export.

### 7.9 Profile Tab (`/crew/profile`)

- Avatar + nickname
- Tier badge (Senior / Junior)
- Joined date
- Stats: total events done, total fee earned all-time
- Settings: notification preferences, change password (if applicable)
- Logout button

### 7.10 Damage/Loss Reporting Flow

**Trigger:** During Check-in, crew marks item as Damaged or Lost.

**Form:**
- Item (auto-filled)
- Severity: Minor (still usable) | Major (needs service) | Total (lost/destroyed)
- What happened (text)
- Photo (REQUIRED, min 1)
- Location of incident
- Witnesses (other crew names, optional)

**Submit creates:**
- `equipment_incident` record
- Status update on item to `service` or `lost`
- Notification to owner with severity badge
- Ledger entry if estimated damage cost > Rp 100k (provisional, until owner reviews)

---

## Module 8 — Smart Warehouse (Inventory)

### 8.1 Overview
Replaces v1's Smart Warehouse with cleaner data model and reliable auto-deduction.

### 8.2 Main View (`/warehouse`)

**Tabs:**
- Consumables (default)
- Alat & Gear (Equipment)
- Log Mutasi (Movement history)

**Top KPIs:**
- Total Valuasi HPP (sum of all consumable book values)
- Semua Barang (count of unique SKUs)
- Stok Kritis / Warning (count of items below min_stock)
- Stok Habis / Kosong (count of items at 0 stock with badge for items in P.O.)

**Search bar + filter chips** (category, condition for equipment, status)

**Actions menu (top-right):**
- ➕ Tambah Item
- 📥 Import CSV
- 📤 Export CSV
- 📊 Stock Take (audit mode)

### 8.3 Consumables Tab

**List rows:**
- Master Item (name + SKU + image)
- Meta Info (unit, COA codes)
- Stok Live (with +/- buttons for quick manual adjust)
- Status badge (AMAN | WARNING | HABIS)
- Valuasi (Rp) — current value @ purchase_price_avg

**Per-row actions:**
- ✏️ Edit
- 🛒 Reorder (creates purchase order draft)
- 📊 Movement history
- 🗑 Archive (soft delete)

**Quick stock adjust:**
- +1 / -1 buttons for fast counting
- Modal: "Alasan" required (Restock | Stok Take | Damaged | Loss | Manual)
- Creates stock_movement audit entry

### 8.4 Alat & Gear Tab

**KPIs unique to equipment:**
- Total Nilai Buku (Sehat) — sum of book values for non-damaged items
- Akumulasi Penyusutan — sum of depreciation MTD
- Alat Normal (Bagus) — count
- Rusak / Servis — count

**List rows:**
- Nama Alat & Kategori (with image)
- Lokasi Posisi (Gudang Pusat | Event {name} | Service Center | Crew Carry)
- Status Kondisi (NORMAL | SERVICE | RUSAK | HILANG)
- Valuasi (Net Book Value with progress bar showing depreciation %)
  - Shows: Rp X | Original Rp Y | Usia: Z bulan / total bulan

**Per-row actions:**
- ✏️ Edit
- 📜 History (all movements)
- 🔧 Service (mark for service)
- ❌ Mark Lost

### 8.5 Log Mutasi Tab

**Chronological list of all stock movements:**
- Waktu & Ref ID (date + auto-generated movement ID)
- Nama Barang
- Arah & Jumlah (KELUAR -135 in red, MASUK +50 in green)
- Keterangan Ops (Trace) — links back to event, purchase, or manual reason
  - Examples: "Project Settlement: Tutup Buku 135 pcs Sleeve"
  - "Manual Restock by Rama"
  - "Damaged: Equipment_Incident_42"

**Filter:**
- Date range
- Item (search)
- Direction (in/out)
- Source (settlement / purchase / manual / damage)

### 8.6 Auto-Deduction Logic

**Triggered by:** Settlement modal save action (Module 10)

**For each consumable used:**
1. Lookup item by SKU
2. Calculate qty needed (e.g., for 2R: media_set + sleeve + flashdisk + pouch + add-on items)
3. Insert `stock_movement` record (direction: OUT, qty: -X, source: 'settlement', source_id: event_id)
4. Update item's `current_stock` (handled by trigger)
5. If new stock < min_stock_alert → create notification "Stok {item} kritis"
6. If new stock = 0 → create urgent notification "Stok {item} HABIS"

**For unit conversion (e.g., 1 box = 1400 pcs):**
- Stock stored in base unit (pcs)
- Display in user-friendly unit (box) when balance ≥ 1 box
- Example: 1500 pcs → "1 box + 100 pcs"

### 8.7 Restock & Purchase Orders

**Reorder flow:**
1. Click 🛒 on low-stock item
2. Modal: PO draft form
   - Quantity (default: 2× min_stock_alert)
   - Estimated price (default: last purchase price)
   - Vendor (free text)
   - Expected arrival date
3. Save as `pending_po`

**On received:**
1. Open PO from list
2. Click "Mark as Received"
3. Confirm actual qty + actual price
4. System: creates IN stock_movement, updates purchase_price_avg (rolling avg of last 5)
5. Create journal entry (Inventory Dr, Cash/AP Cr)

### 8.8 Stock Take (Audit Mode)

For periodic physical count (e.g., monthly):

1. Owner clicks "Stock Take" → enters audit mode
2. Each item shows: "System count: X | Physical count: ___"
3. Owner inputs actual counts
4. Discrepancies highlighted
5. Submit creates ADJUSTMENT movements with reason "Stock Take {date}"
6. Variance report generated (% accuracy)

---

## Module 9 — Omni Finance (Cash, Ledger, Sinking Funds)

### 9.1 Overview
The financial brain of the system. Combines cash management, accounting ledger, sinking funds, and P&L.

### 9.2 Tabs

- **Kas & Vault** (default) — bank balances + sinking funds
- **Budgeting** — sinking fund matrix configuration
- **Ledger Jurnal** — full journal entries (audit trail)
- **Laba / Rugi** — Project P&L with margins

### 9.3 Kas & Vault Tab

**Hero Section — Safe-to-Spend (Liquid):**
- Big number: "Rp 14.527.056"
- Subtitle: "Dana bersih operasional (Saldo BCA - Sinking Funds) yang aman diputar saat ini."
- Cetak button → exports cash position report

**Sinking Funds Locked card (right):**
- Total Terkunci: Rp 7.697.561
- Click → shows breakdown per bucket

**Operating Profit MTD:**
- Big number with margin %
- Comparison to last month

**Cash Flow Visualization (period: this month):**
```
AWAL (Mei) → MASUK +X → KELUAR -Y → AKHIR BCA
```

**Kas & Rekening Bank** (cards per account):
- Each account: Name (e.g., "Bank BCA"), COA code (1-110), current balance, last transaction date
- Click → drill-down to transactions for that account

### 9.4 Budgeting Tab — Sinking Fund Matrix

**Matrix configuration UI:**

**Health indicator:** Overall (AMAN / WARNING / KRITIS) based on bucket fill %

**Per-bucket card:**
- Name (e.g., "Equipment Fund")
- Allocation rule: "5% of net profit per event" or "Rp 100k flat per event"
- Current balance: Rp X
- Target: Rp Y (optional)
- Progress bar: % filled
- Last allocation: when, how much
- Actions: Edit, Withdraw, Delete (with safety check)

**Global Pool:**
- Total Jatah (sum of all targets if set)
- Terpakai (sum of all withdrawals)
- Sisa Aman

**"Atur Matrix Kantong" button** → opens config panel:
- List all buckets with edit
- Toggle on/off per bucket
- Add new custom bucket (name, allocation rule, target)
- Re-order priority

**Default buckets (pre-seeded):**
| Bucket | Allocation | Target |
|--------|-----------|--------|
| Equipment Fund | 5% net profit | Rp 20jt |
| Maintenance Fund | 3% net profit | Rp 10jt |
| Crew Reserve | Rp 100k flat | Rp 5jt |
| Emergency Fund | 2% net profit | Rp 15jt |

**Withdraw flow:**
- Click "Withdraw" on bucket
- Modal: amount, reason, target account (where to move money)
- Submit → creates transfer movement (bucket_balance Dr, target_account Cr)
- Audit logged

### 9.5 Ledger Jurnal Tab

**Full journal entries** (read-only audit log):

**Filter bar:**
- Search by description, account, amount
- Filter by Type (All | Revenue | Expense | Transfer | Settlement)
- Filter by Account (any bank, sinking fund, COA code)
- Date range

**Each entry shows:**
- Date
- Description (e.g., "Tutup Buku Project PRJ-20260502-4738")
- COA codes affected (e.g., "1-200 - PERSEDIAAN MEDIA SET BASIC")
- HPP/Account note
- Amount (with +/- sign and color)
- Status: TERVERIFIKASI badge
- Detail expand: shows full double-entry (Debit/Credit pairs)

**Cetak Laporan** button → generates PDF journal report

### 9.6 Laba / Rugi Tab

**Project P&L Table:**

For each completed event in period:
- Project / Klien
- Revenue (Gross)
- HPP (Bahan)
- OpEx (Kru & Operasional)
- Net Profit (with color: emerald >0, rose <0, neutral if 0)
- Margin % (with badge: 100% green, 50-99% emerald, 30-49% amber, <30% rose)

**Cetak Laporan PDF** → exports formatted P&L

**Aggregate metrics (top):**
- Total Revenue (period)
- Total HPP
- Total OpEx
- Total Net Profit
- Avg Margin %

### 9.7 Smart Ledger Action

**"Smart Ledger" button** (top-right of Omni Finance page):

Quick-add modal for manual journal entries:
- Type: Income | Expense | Transfer
- Amount
- From account (for expense/transfer)
- To account (for income/transfer)
- Category (auto-suggests from history)
- Description
- Date (default today)
- Optional photo (receipt)

**Smart suggestions:**
- "Looks like a fuel expense? Categorize as Transport/BBM" (NLP-light, keyword match)
- "Same vendor as last time" (matches description)

Use case: Logging non-event expenses (rent, internet, fuel for office, etc.)

---

*[FSD continues in next part]*

*Continued from [02_FSD_part2.md](./02_FSD_part2.md)*

---

## Module 10 — Settlement Engine

### 10.1 Overview
The most complex but most critical module. Closes an event's books, calculates profit, distributes earnings, allocates sinking funds, and generates journal entries.

### 10.2 Trigger
Settlement modal opens via:
- Event detail page → "Settle Event" action button
- Operations List → settlement icon on `awaiting_settlement` rows
- Notification → "Event ready for settlement" CTA

### 10.3 Modal Structure (Single Modal, Two Stages)

#### Stage 1: Material Gudang (HPP) — Auto-populated from Crew Rekap

**Header:**
- Event Settlement badge
- Project ID + client name
- Close button (top-right, with confirm if unsaved)

**Reset & Package Reference:**
- "Paket: 2R Unlimited 3 Jam" pill
- "Reset" button — restores defaults from rekap

**Cetak Section:**
- **Cetak (Pcs)** — total prints (auto from rekap, editable)
- Auto-calculated breakdown shown as pills:
  - "MEDIA: {x}" (calculated based on frame size formula)
  - "SLEEVE: {y}" (= cetak count for 2R, may differ for others)

**Flashdisk/Pouch Section (if include_flashdisk_pouch):**
- **FD: {n}** (default 1, editable)
- **POUCH: {n}** (default 1, editable)

**Add-on Consumables (conditional):**
- Photomagnet count (if applicable)
- Keychain count (if applicable)

**HPP Breakdown (auto-calculated, displayed):**
- HPP Mediaset: Rp {qty × purchase_price_avg}
- HPP Sleeve: Rp {qty × purchase_price_avg}
- HPP FD + Pouch: Rp {qty × purchase_price_avg}
- HPP Add-ons: Rp {qty × purchase_price_avg}
- **Total HPP: Rp X**

**Bottom of Stage 1 (live calculation):**
```
Revenue (Gross)  -  Total Biaya  =  Net Profit  | Margin %
```

#### Stage 2: SDM & Operasional Event

**Fee Crew Section:**
- **Fee Crew Lead** (auto-filled: Rp 200k senior or 150k junior, editable)
- **Fee Crew Asst** (auto-filled, editable)
- **Fee Crew C** (if 3rd crew assigned, editable)
- **Fee Extra** (manual input — bonus owner-crew discussion result, e.g., overtime bonus)

**Operational Costs:**
- **Transport / BBM** (manual input — e.g., fuel + parking + tolls)
- **Sewa Alat / Studio** (if rental needed, manual)
- **Perawatan Alat** — auto-suggested (from sinking fund Maintenance allocation rule)
- **Konsumsi / Lainnya** (food, drinks, misc)

**Komisi & Diskon:**
- **Komisi Vendor/EO** (auto from booking if Vendor channel)
- **Komisi Sales/Relasi** (auto from booking based on rules)
- **Diskon Klien** (read-only, from booking — but can be increased here if "kasih bonus diskon di akhir")

**Platform & Bagi Hasil:**
- **Platform / Aplikasi** (Tetra Ops fee allocation, default Rp 35k from system settings)
- **Bagi Hasil Owner** (auto: Rp 200k pool if profit > 0, else Rp 0)
  - Visual indicator if skipped due to loss

**Sticky Footer:**
```
Revenue (Gross)  -  Total Biaya  =  Net Profit (Rp X)  |  Margin: X%
[Batal]  [💾 Simpan & Tutup Buku]
```

### 10.4 Calculation Logic

```
Revenue = Grand Total Booking - Diskon Awal (saat booking)

HPP = Sum of all consumables × purchase_price_avg
    + Add-on materials cost

OpEx = Fee Crew (lead + asst + extra) + Fee Extra
     + Transport/BBM + Sewa Alat + Perawatan + Konsumsi
     + Komisi (vendor/sales/relasi)
     + Platform Fee
     + Diskon Tambahan (saat settlement)

Total Biaya = HPP + OpEx

Net Profit = Revenue - Total Biaya

IF Net Profit > 0 (PROFIT):
    Sinking Fund Equipment = Net Profit × 5%
    Sinking Fund Maintenance = Net Profit × 3%
    Sinking Fund Crew Reserve = Rp 100k
    Sinking Fund Emergency = Net Profit × 2%
    Total Locked = Sum of above
    
    Bagi Hasil Owner Pool = Rp 200k (Rp 50k × 4 owners)
    
    Operating Cash = Net Profit - Total Locked - Bagi Hasil Owner Pool
    
ELSE (LOSS or ZERO):
    Sinking funds: NOT allocated
    Owner pool: NOT distributed
    Operating Cash = Net Profit (negative)
    Flag event as "Loss Event" for review
```

### 10.5 On Submit (Tutup Buku)

**Atomic transaction** — all or nothing:

1. **Insert event_settlement record** (snapshot of all numbers)
2. **Update event status** to `completed`
3. **Auto-deduct consumables from inventory:**
   - Create `stock_movement` records for each material used
   - Update item current_stock (via trigger)
4. **Generate journal entries** (double-entry):
   - HPP Mediaset → Inventory account, expense account
   - HPP Sleeve → Inventory, expense
   - Cash IN (from final payment) if applicable
   - AR settled if was outstanding
   - Crew fees → Crew Payable accounts
   - Komisi → Komisi expense accounts
   - Owner profit pool → Owner Earnings (per-owner virtual balance)
   - Sinking fund allocations → respective fund accounts
5. **Update sinking fund balances** (atomic)
6. **Update owner earnings ledger** (4 entries of Rp 50k each, plus Rama's commission if applicable)
7. **Insert audit log entry**
8. **Trigger notifications:**
   - To all owners: "Event {name} closed. Net profit Rp X, your share Rp Y"
   - To assigned crew: "Event {name} settled. Fee Rp Z added to your balance"

**On error (any step):** Rollback entire transaction. Show specific error to user (e.g., "Stok Sleeve tidak cukup, perlu adjust manual dulu").

### 10.6 Re-Open Settlement (Admin Only)

Sometimes mistakes happen. Super admin can re-open a settled event:

- Reverses all journal entries
- Restores inventory
- Reverts owner earnings
- Audit logged with reason
- Event status returns to `awaiting_settlement`

### 10.7 Loss Event Handling

**When net profit ≤ 0:**

UI shows clear warning:
- "⚠️ Event ini RUGI Rp X" (red banner)
- Sinking funds & owner pool sections greyed out with note
- Continue button labeled "Tutup Buku (Rugi)" with confirmation modal

System still creates journal entries (recording the loss properly), just skips profit-distribution flows.

Loss events appear in dashboard "Anomaly" section for review.

---

## Module 11 — Notifications & Anomaly Radar

### 11.1 Overview
Smart, actionable notifications that prevent problems before they happen. Replaces v1's "Command Center" with cleaner UX.

### 11.2 Notification Types

**Categories:**
1. **Alert** (red) — Critical, action required NOW
2. **Warning** (amber) — Important, action needed soon
3. **Info** (blue) — FYI, no action needed
4. **Success** (green) — Confirmation of something good

### 11.3 Anomaly Detection Rules

**Rule-based detection** (cron job runs daily at 6 AM WIB + on-demand triggers):

**Operational Anomalies:**
- 🔴 Event H-2 belum ada crew assigned
- 🔴 Event H-1 belum ada design approved
- 🟠 Event H-3 belum lunas pembayaran
- 🟠 Event H-7 belum ada DP
- 🔴 Crew double-booked (same time slot, different events)
- 🟠 Multiple events same day, jumlah crew tidak cukup

**Financial Anomalies:**
- 🔴 Invoice overdue >7 days
- 🟠 Invoice overdue 1-7 days
- 🟠 Loss event detected (net profit ≤ 0) — flagged for review
- 🔴 Cash position low (< Rp 5jt operating cash)
- 🟠 Outstanding receivables > Rp 20jt total

**Inventory Anomalies:**
- 🔴 Stock = 0 (HABIS) on critical item (sleeve, FD, mediaset)
- 🟠 Stock < min_stock_alert (KRITIS)
- 🟠 Equipment missing (last location was event, but check-in not done within 24h after event)
- 🟠 Equipment damaged unreported (incident submitted but no follow-up in 7 days)

**System Anomalies:**
- 🟠 Pending user approval (>24h)
- 🔵 Unused inventory (item with no movement in 90 days)

### 11.4 Notification Inbox (`/notifications`)

**Layout:**
- Filter tabs: Semua | Alert | Warning | Info | Done
- Grouped by date (Today, Yesterday, Earlier)
- Each notification card:
  - Severity icon + title
  - Description
  - Affected entity (event/item/payment with link)
  - Timestamp
  - CTA button (if actionable)
  - Mark as Read | Dismiss

**Bulk actions:**
- Mark all as read
- Dismiss all info-level

### 11.5 Real-time Push Notifications (PWA)

When PWA installed and user grants permission:
- New event assigned (to crew)
- Payment received (to owner)
- Settlement closed (to all owners)
- Critical anomaly detected (to super admin)

**Quiet hours:** No push 22:00 - 07:00 WIB unless severity = Alert

### 11.6 Top-bar Notification Bell

- Badge count = unread count (capped display "9+" if >9)
- Click → opens slide-over panel with last 10 notifications
- "Lihat semua" → goes to full inbox

---

## Module 12 — Reports & Analytics

### 12.1 Overview
Simple, non-technical reports for owners. NOT investor-grade dashboards.

### 12.2 Owner Personal Report (`/reports/owner-earnings`)

**For each owner:**
- Period selector (This Month | Last Month | YTD | Custom)
- Summary card: Total Earnings = Commissions + Profit Share + Bonus
- Breakdown:
  - Commissions list (per event, channel, amount)
  - Profit share (per event, Rp 50k each)
  - Withdrawals (when cashed out)
- Available balance to withdraw
- Withdraw form (if available > 0)

**Owner sees only their own data** (RLS enforced).

### 12.3 Monthly Business Report (auto-generated, simple)

**Triggered:** 1st of every month, system auto-generates last month's report PDF.

**Sections (1 page):**
1. **Headline Metrics** (4 boxes):
   - Total Revenue
   - Total Net Profit
   - Events Done
   - Avg Margin
2. **Top 3 Events** by margin
3. **Channel Performance** (Direct vs Vendor vs Relasi pie chart)
4. **Sinking Funds Status** (4 progress bars)
5. **Outstanding Receivables** (count + total amount)
6. **Cash Position** (current balance per account)

**Distribution:** Auto-saved to Google Drive (Owner-only folder), notification sent to all owners with download link.

### 12.4 Crew Performance Report (`/reports/crew`)

**Per crew, last 3 months:**
- Events worked
- Lead vs Asisten count
- Total fee earned
- On-time rate (events where checked-in on time)
- Damage incidents

Simple table, no rankings (avoid awkward dynamics with small team).

### 12.5 Event P&L Detail (`/reports/event/{id}`)

Already covered in Module 9 (Laba/Rugi tab). One-click to view P&L for any specific completed event.

---

## Module 13 — Settings & System Configuration

### 13.1 Overview
Super admin–only area for configuring business rules.

### 13.2 Tabs

- **System Config** (default)
- **Packages**
- **Add-ons**
- **Master Crew**
- **Items (Inv)**
- **Bank Accounts**
- **Sinking Funds Config**
- **WhatsApp Templates**
- **Notification Rules**
- **Audit Log Viewer**

### 13.3 System Config Tab

**Core Financials:**
- Default DP (Rp 500.000) — input
- Gross-up Pajak (1.75%) — input
- Biaya Aplikasi (Rp 35.000 per event) — input
- Bagi Hasil Owner Pool (Rp 200.000 per event) — input

**Owner Direct Commission Rules (Sliding Scale):**
- No discount: Rp 100.000
- Discount ≤ 10%: Rp 50.000
- Discount > 10%: Rp 0
- Editable inline

**Commission Rules:**
- Komisi Vendor/EO (10%) — input %
- Komisi Flat Relasi (Rp 100.000) — input

**Crew Payroll Rates:**
- Fee Crew Senior (Rp 200.000)
- Fee Crew Junior (Rp 150.000)

**Inventory Conversions:**
- Lembar 4R per Box
- Lembar 2R per Box
- Other unit conversions

**System & UI Variables:**
- Currency format (locked: IDR)
- Timezone (locked: Asia/Jakarta)
- Date format (DD/MM/YYYY)
- Default language (id-ID)

**[Save Config] [Refresh] buttons**

### 13.4 Sinking Funds Config

Already covered in Module 9.4. Full CRUD interface.

### 13.5 Notification Rules

For each anomaly type, configure:
- Enabled (toggle)
- Trigger condition (e.g., "H-2", "H-3")
- Severity (Alert / Warning / Info)
- Recipients (Super Admin / All Owners / Affected Crew)
- Push notification? (yes/no)

### 13.6 Audit Log Viewer

Read-only feed of all system actions:
- Timestamp
- Actor (user)
- Action (create/update/delete)
- Entity (table + record_id)
- Before/After values (JSON diff)
- IP address (optional)

**Search & filter** by user, entity, date range.

---

## Module 14 — Onboarding Wizard

### 14.1 Overview
First-time setup flow for fresh deploy. Friendly, step-by-step, with smart defaults.

### 14.2 When Triggered
Detected by checking `system_config.is_initialized = false` on first super admin login.

### 14.3 Steps Overview

```
Step 1: Welcome → Step 2: Business Profile → Step 3: Master Data
   → Step 4: Tim Kamu → Step 5: Inventory Awal → Step 6: Saldo Awal
   → Step 7: Klien Eksisting (skip default) → Step 8: Active Events
   → Step 9: Done & Tutorial
```

Each step:
- Progress bar (Step X of 9)
- Skippable steps marked clearly
- Back button always available
- Auto-save draft (resume later if exit)

### 14.4 Step Details

**Step 1: Welcome**
- Big "Selamat datang di Tetra Ops!" heading
- 30-sec intro video (optional, embedded)
- Bullet list of what's coming
- "Mulai Setup" CTA

**Step 2: Business Profile**
- Nama Bisnis (default: "Tetra Photobooth")
- Tagline
- Alamat operasional
- Email kontak
- Telepon kontak
- Upload logo (auto-resize)
- "Lanjut" CTA

**Step 3: Master Data**
- Pre-filled cards for:
  - 9 Packages (from pricelist 2026)
  - 7 Add-ons
- Allow Edit / Disable per item
- "Skip & Use Defaults" button → all enabled
- Add custom package option
- "Lanjut" CTA

**Step 4: Tim Kamu**
- Pre-filled rows for known team:
  - Rama (Super Admin)
  - Fahmi, Acuy, Iqbal (Owners)
  - 8 crew (input names + tier per crew)
- Each row: name, email (for OAuth), role, tier, phone
- "Tambah Anggota" button
- "Lanjut" CTA

**Step 5: Inventory Awal**
Two modes:
- **Smart Form (default):** Pre-filled common items (sleeve, mediaset, FD, pouch, keychain) with input "current stock" + "min alert"
- **Bulk CSV Import (advanced):** Download template → fill → upload
- Both modes: equipment items input separately (or via CSV)

Pre-filled equipment from existing list shown with checkbox: "Saya punya item ini" → input qty + condition.

"Lanjut" CTA

**Step 6: Saldo Awal**
- For each bank account (pre-listed: Kas Tunai, BCA, Mandiri, BSI):
  - Saldo per tanggal go-live (date input)
  - Saldo amount
  - Account number (optional, for reference)
- "Lanjut" CTA

**Step 7: Klien Eksisting**
- Default: SKIP (recommended)
- Banner: "Tidak ada klien lama? Klik Skip — kamu bisa input klien baru saat booking."
- Optional: Bulk CSV import for advanced users
- "Skip" or "Lanjut" CTA

**Step 8: Active Events**
- "Apakah kamu punya event yang sudah di-booking dan akan datang?"
- Default: 0 events
- For each event, input form (simplified booking form):
  - Klien name + WA
  - Channel (Direct/Vendor/Relasi)
  - Tanggal + jam
  - Paket
  - Grand total
  - DP yang sudah masuk
- Can add up to N events one by one
- Saves them all atomically on next step

**Step 9: Done!**
- "Selamat! Setup selesai." 🎉
- 4 summary cards: Tim aktif, Inventory items, Saldo total, Active events
- "Tutorial Cepat 2 Menit" video (optional)
- "Mulai Pakai Tetra Ops" CTA → goes to /dashboard

### 14.5 Post-Onboarding

- `system_config.is_initialized = true`
- Cannot trigger wizard again (except via reset by super admin in danger zone)
- Welcome dashboard shows recommended next actions:
  - "Buat booking pertama" CTA
  - "Lihat tutorial"
  - "Ajak tim onboarding"

### 14.6 Resume Capability

If user abandons mid-wizard:
- Draft saved in localStorage + DB
- Re-login → modal "Lanjutkan setup di mana kamu tinggalkan?" (Step 5 of 9)
- Click "Lanjutkan" → resume

---

## Cross-Cutting Concerns

### CC-1: Empty States

Every list view has thoughtful empty state with:
- Friendly illustration
- Message ("Belum ada event bulan ini")
- Primary CTA ("Buat Booking Pertama")

### CC-2: Loading States

- Skeleton screens (not spinners) for content areas
- Buttons show inline spinner during action
- Page transitions <100ms

### CC-3: Error States

- Form errors: inline below field, red text
- API errors: toast notification with retry button
- Page-level errors: full-page error component with "Coba lagi" button + report bug option

### CC-4: Confirmation Dialogs

Required for destructive actions:
- Delete item
- Cancel event
- Reverse payment
- Re-open settlement

Pattern: "Yakin ingin {action}? Tindakan ini tidak bisa dibatalkan." [Batal] [Ya, lanjut]

### CC-5: Undo Actions

Where reversible (within 10 seconds):
- Toast with "Undo" button after destructive action (e.g., "Event archived. Undo")

### CC-6: Mobile Gestures

- Swipe right on event card → quick action menu
- Swipe down to refresh
- Long press on consumable item → quick adjust modal

### CC-7: Accessibility

- All inputs labeled (aria-label or visible label)
- Color contrast WCAG AA minimum
- Keyboard navigation throughout
- Focus indicators visible

### CC-8: Offline Behavior

PWA caches:
- Today's events for crew (full detail)
- Master data (packages, add-ons)
- User profile

Offline actions queued for sync:
- Equipment check-out/in
- Photo uploads (re-attempt when online)
- Form drafts

Online-required actions:
- Login
- Payment logging
- Settlement

---

**End of FSD**

*Next document: [03_TSD.md](./03_TSD.md) — Technical Specification Document*
