# 06 — API Specification

**Project:** Tetra Ops
**Version:** 1.0.0
**Companion to:** [02_FSD.md](./02_FSD.md), [05_DATABASE_SCHEMA.sql](./05_DATABASE_SCHEMA.sql)

---

## 1. Overview

Tetra Ops uses **Next.js Server Actions** as the primary mechanism for mutations, with **Route Handlers** (`app/api/*`) reserved for:
- OAuth callbacks (Google Drive)
- Webhooks (if any)
- Cron jobs (Vercel Cron)
- Public endpoints (if any in future)
- File upload endpoints that benefit from streaming

For data fetching, **Server Components** query the Supabase client directly during render. Client Components use **TanStack Query** with Server Actions as fetchers when interactivity is needed.

This document is a **contract reference** — the exact function signatures, input/output shapes, and validation rules. Implementation details live in code.

---

## 2. Conventions

### 2.1 Naming

- Server Actions: `verbNoun()` camelCase, e.g., `createEvent`, `logPayment`, `closeSettlement`
- Route Handlers: kebab-case URLs, e.g., `/api/google-drive/callback`
- Server Action files: grouped by module, e.g., `lib/actions/events.ts`, `lib/actions/payments.ts`

### 2.2 Return Shape (Standard)

All Server Actions return a discriminated union:

```ts
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; field?: string } };
```

Errors include:
- `code`: machine-readable identifier (e.g., `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `INSUFFICIENT_STOCK`)
- `message`: human-readable Indonesian message for end-users
- `field`: optional field name when validation error is field-specific

### 2.3 Validation

All inputs validated with **Zod** schemas. Schema files in `lib/validations/*.ts`. Same schema used client-side (form validation) and server-side (re-validation).

### 2.4 Authorization

Every Server Action calls `requireAuth(role?)` at top:

```ts
async function someAction(input: Input): Promise<ActionResult<Output>> {
  const user = await requireAuth(['owner', 'super_admin']);
  // ... rest of logic
}
```

If unauthorized, throws — caller layer translates to `{ success: false, error: { code: 'FORBIDDEN' } }`.

### 2.5 Atomicity

Multi-step operations (settlement, payment with journal, etc.) wrap in Supabase RPC functions or use explicit transactions to ensure atomicity. Failed transactions roll back fully.

---

## 3. Authentication Module

### 3.1 `signInWithGoogle()`

**Type:** Client-initiated, redirects to Google OAuth
**Implementation:** Supabase client `signInWithOAuth({ provider: 'google' })`
**Not a server action** — uses Supabase JS SDK directly from client.

### 3.2 `signOut()`

**Server Action**

```ts
async function signOut(): Promise<ActionResult<{ redirectTo: string }>>
```

**Behavior:**
- Calls Supabase `auth.signOut()`
- Clears session cookies
- Returns `{ redirectTo: '/login' }`

### 3.3 `getCurrentUser()`

**Server Component utility** (not a Server Action)

```ts
async function getCurrentUser(): Promise<User | null>
```

Reads session cookie, queries `users` table joined with `auth.users`. Returns null if not authenticated.

### 3.4 `requireAuth(allowedRoles?)`

**Server utility**

```ts
async function requireAuth(allowedRoles?: UserRole[]): Promise<User>
```

Throws `UnauthorizedError` if not authenticated.
Throws `ForbiddenError` if `allowedRoles` provided and user role not in list.

### 3.5 `approvePendingUser({ userId, role, tier? })`

**Server Action — super admin only**

**Input:**
```ts
{
  userId: UUID;
  role: 'owner' | 'crew';
  tier?: 'senior' | 'junior';  // required if role = 'crew'
  fullName: string;
  nickname?: string;
  phoneWa?: string;
}
```

**Output:** `{ user: User }`

**Behavior:**
- Verifies user exists with `pending_approval` role
- Updates user record with new role + tier
- Creates audit log entry
- Sends notification to approved user
- Returns updated user

---

## 4. Master Data Module

### 4.1 Packages

#### `listPackages({ activeOnly? })`

**Server Action**

```ts
{ activeOnly?: boolean }  // default true
```

**Output:** `{ packages: Package[] }`

#### `createPackage(input)`

**Server Action — owner+**

**Input:**
```ts
{
  name: string;
  category: ServiceType;
  frameSize: FrameSize;
  durationHours: number;  // 1-24
  basePrice: number;      // > 0
  description?: string;
  defaultConsumablesEstimate?: Record<string, number>;
}
```

**Output:** `{ package: Package }`

#### `updatePackage({ id, ...patch })`

**Server Action — owner+**

Same fields as create, all optional except id. Soft-update — historical bookings unaffected.

#### `archivePackage({ id })`

**Server Action — owner+**

Sets `is_active = false` and `deleted_at = NOW()`. Hard delete blocked if any events reference this package.

### 4.2 Add-ons

Mirror operations to packages:
- `listAddons({ activeOnly? })`
- `createAddon(input)`
- `updateAddon({ id, ...patch })`
- `archiveAddon({ id })`

### 4.3 Bank Accounts

- `listBankAccounts()`
- `createBankAccount(input)` — super admin only
- `updateBankAccount({ id, ...patch })` — super admin only
- `setDefaultBankAccount({ id })` — super admin only

**Note:** Default account constraint enforced via unique partial index. Setting one as default automatically unsets others (handled in Server Action).

### 4.4 Inventory Items

#### `listItems({ category?, search?, lowStock? })`

```ts
{
  category?: 'consumable' | 'equipment';
  search?: string;        // fuzzy match on name
  lowStock?: boolean;     // filter to items below min_stock
}
```

**Output:** `{ items: ItemWithStock[] }` where `ItemWithStock` includes computed `current_stock` field.

#### `createItem(input)`

**Owner+**

Discriminated input by category:
```ts
| { category: 'consumable', sku?, name, unit, unitConversion?, coaAccount, minStockAlert, purchasePriceAvg, sellingPrice? }
| { category: 'equipment', sku?, name, unit, coaAccount, purchaseDate, purchasePrice, usefulLifeMonths, condition, currentLocation }
```

**Output:** `{ item: Item }`

#### `updateItem({ id, ...patch })`

#### `adjustStock({ itemId, quantity, direction, reason, notes? })`

**Server Action — owner+**

Manual stock adjustment (restocking, stock take corrections, etc.).

```ts
{
  itemId: UUID;
  quantity: number;          // positive integer
  direction: 'in' | 'out' | 'adjustment';
  reason: 'restock' | 'stock_take' | 'damaged' | 'loss' | 'manual';
  notes?: string;
}
```

**Behavior:**
- Inserts `stock_movements` record
- For 'in' with cost provided: updates `purchase_price_avg` (rolling average of last 5 'in' movements)
- Returns new `current_stock`

#### `bulkImportItems({ csvData, category })`

**Server Action — owner+**

Accepts parsed CSV rows, validates each, inserts in batch with transaction. Returns success/error per row.

---

## 5. Crew Management Module

### 5.1 `listCrew({ activeOnly?, role?, tier? })`

**Server Action**

```ts
{
  activeOnly?: boolean;
  role?: UserRole;
  tier?: CrewTier;
}
```

**Output:** `{ crew: User[] }` — for crew, returns trimmed view (no fee details unless owner+).

### 5.2 `updateCrewProfile({ userId, ...patch })`

**Owner+**

```ts
{
  userId: UUID;
  fullName?: string;
  nickname?: string;
  phoneWa?: string;
  tier?: CrewTier;
  defaultFeeOverride?: number | null;
  bankAccount?: string;
  isActive?: boolean;
  notes?: string;
}
```

### 5.3 `getCrewSchedule({ userId, dateFrom, dateTo })`

```ts
{
  userId?: UUID;       // defaults to current user
  dateFrom: Date;
  dateTo: Date;
}
```

**Output:** `{ events: EventSummary[] }` — events the user is assigned to.

### 5.4 `getCrewFeeBalance({ userId, period })`

```ts
{
  userId?: UUID;
  period: 'this_month' | 'last_month' | 'ytd' | { from: Date; to: Date };
}
```

**Output:**
```ts
{
  totalEarned: number;
  totalPaid: number;
  pending: number;
  events: { event: EventSummary, role: CrewRole, fee: number, bonus: number, isPaid: boolean }[];
}
```

### 5.5 `markCrewFeePaid({ assignmentId, paidVia, paidAt })`

**Owner+** — marks crew fee as disbursed.

---

## 6. Events Module

### 6.1 `listEvents({ filter })`

**Server Action**

```ts
{
  year?: number;
  month?: number;       // 1-12
  status?: EventStatus | 'all';
  search?: string;
  channel?: ChannelType;
  limit?: number;       // default 50
  offset?: number;
}
```

**Output:** `{ events: EventListItem[]; total: number }`

`EventListItem` is denormalized for table display: includes assigned crew names, payment status, key dates.

### 6.2 `getEvent({ id })`

```ts
{ id: UUID } | { projectId: string }
```

**Output:** Full event with addons, crew assignments, payments, rekap, settlement (if exists).

### 6.3 `createEvent(input)`

**Server Action — owner+**

**Input (large, validated with Zod):**

```ts
{
  // Channel
  channel: ChannelType;
  vendorName?: string;
  vendorCommissionRate?: number;
  vendorCommissionAmount?: number;
  referrerUserId?: UUID;
  referrerType?: 'owner' | 'crew';
  referrerCommission?: number;
  
  // Client
  clientName: string;
  clientWa: string;       // validated for ID phone format
  clientEmail?: string;
  picName?: string;
  picWa?: string;
  
  // Service
  serviceType: ServiceType;
  packageId?: UUID;
  customPackageName?: string;
  customPackagePrice?: number;
  frameSize: FrameSize;
  
  // Customization
  backdropSource: 'basic_tetra' | 'custom';
  backdropColor?: BackdropColor;
  includeFlashdiskPouch?: boolean;
  
  // Event
  eventCategory: string;
  eventDate: Date;        // future date
  setupTime: string;      // HH:MM
  startTime: string;      // HH:MM
  endTime: string;        // HH:MM
  
  // Location
  venueName: string;
  venueAddress?: string;
  venueCity?: string;
  googleMapsUrl?: string;
  logisticNotes?: string;
  
  // Notes
  crewNotes?: string;
  
  // Add-ons
  addons: { addonId: UUID; quantity: number }[];
  
  // Crew
  leadCrewId: UUID;
  asistenCrewId?: UUID;
  crewCId?: UUID;
  
  // Modifiers
  discountAmount?: number;
  discountPercentage?: number;
  grossUpPph?: boolean;
  
  // Initial DP
  initialDp?: {
    amount: number;
    bankAccountId: UUID;
    proofUrl?: string;
    paymentDate?: Date;
  };
}
```

**Behavior:**
1. Validates all fields via Zod
2. Generates `project_id`: `PRJ-{YYYYMMDD}-{4-digit}`
3. Computes `base_price`, `addons_total`, `discount_amount`, `gross_up_pph_amount`, `grand_total`
4. Computes `direct_sales_commission` if channel = direct (sliding scale)
5. Inserts `events` record
6. Inserts `event_addons` rows
7. Inserts `crew_assignments` rows with computed fees (snapshot of current rates)
8. Validates crew schedule (overlap warnings/blocks)
9. If `initialDp` provided:
   - Inserts payment record
   - Triggers payment-to-status recalc
   - Creates journal entry (Cash Dr, AR Cr)
10. Sets initial status: 'confirmed' if DP received, else 'draft'
11. Triggers notifications to assigned crew
12. Returns `{ event: Event }`

**Errors:**
- `VALIDATION_ERROR` (per field)
- `CREW_DOUBLE_BOOKED` (crew_id, conflicting_event_id) — when overlap detected
- `PACKAGE_INACTIVE`
- `INSUFFICIENT_BALANCE` (if DP > grand_total)

### 6.4 `updateEvent({ id, ...patch })`

**Owner+**

Same fields as create, all optional. Restricted fields based on event status:
- `completed` events: only `crewNotes`, `documentationDriveFolderUrl` editable
- `cancelled` events: read-only (use `restoreEvent` first)

Audit log captures every change.

### 6.5 `cancelEvent({ id, reason })`

**Owner+**

Sets status to 'cancelled', logs reason, retains all financial records (DP becomes non-refundable per T&C — manual refund handled separately).

### 6.6 `restoreEvent({ id })`

**Super admin only** — restores cancelled event to 'draft' or 'confirmed' based on payment status.

### 6.7 `transitionEventStatus({ id, toStatus, metadata? })`

**Owner+**

Manually moves event through lifecycle states. Validates legal transitions.

```ts
{
  id: UUID;
  toStatus: EventStatus;
  metadata?: { reason?: string; designApprovedAt?: Date; };
}
```

Legal transitions enforced server-side (e.g., can't go from `draft` directly to `completed`).

### 6.8 `assignCrew({ eventId, leadCrewId, asistenCrewId?, crewCId? })`

**Owner+**

Replaces current assignments with new ones. Recalculates fees based on each crew's current tier. Returns conflict warnings if non-blocking overlaps exist.

**Output:**
```ts
{
  assignments: CrewAssignment[];
  warnings: { crewId: UUID; conflictType: 'same_day' | 'time_overlap'; conflictingEventId: UUID }[];
}
```

If `time_overlap` exists, action fails unless `force: true` flag included.

---

## 7. Payments Module

### 7.1 `logPayment(input)`

**Server Action — owner+**

```ts
{
  eventId: UUID;
  amount: number;          // > 0, ≤ remaining balance
  paymentDate: Date;
  bankAccountId: UUID;
  paymentType: 'dp' | 'partial' | 'pelunasan';
  proofUrl?: string;       // Supabase Storage or Drive link
  notes?: string;
}
```

**Behavior:**
1. Validates amount ≤ remaining balance (or = if `paymentType: 'pelunasan'`)
2. Inserts `payments` record
3. Trigger auto-recalculates event payment_status
4. Creates journal entry:
   - Debit: bank account COA
   - Credit: AR (Piutang Klien `1-300`)
5. If event status was `draft` and DP received → transition to `confirmed`
6. If payment makes status = `paid` → trigger thank-you notification template suggestion
7. Returns `{ payment: Payment, event: EventWithPaymentStatus }`

### 7.2 `reversePayment({ paymentId, reason })`

**Super admin only** — for correcting mistakes.

**Behavior:**
- Marks payment as reversed
- Creates reversal journal entry (mirror)
- Recalculates event status
- Audit logged with reason

### 7.3 `listPayments({ filter })`

```ts
{
  eventId?: UUID;
  bankAccountId?: UUID;
  dateFrom?: Date;
  dateTo?: Date;
  paymentStatus?: PaymentStatus;
}
```

### 7.4 `getInvoiceData({ eventId })`

**Returns structured data for PDF rendering.**

```ts
{
  event: Event;
  client: ClientInfo;
  package: PackageDetails;
  addons: AddonLineItem[];
  payments: Payment[];
  totals: { subtotal, discount, grossUp, grandTotal, paid, balance };
  dueDate: Date;
  bankInfo: BankAccount;
}
```

PDF rendering happens client-side via `@react-pdf/renderer`. This action just provides the data.

### 7.5 `generateWhatsappLink({ eventId, templateCode })`

**Server Action**

```ts
{
  eventId: UUID;
  templateCode: string;  // e.g., 'reminder_dp', 'thank_you_post_event'
  customVariables?: Record<string, string>;
}
```

**Output:**
```ts
{
  link: string;        // wa.me/...?text=...
  preview: string;     // rendered template body
}
```

Looks up `whatsapp_templates`, fills variables from event/client data, URL-encodes, returns shareable link.

---

## 8. Crew Operations Module

### 8.1 `submitCrewRekap(input)`

**Server Action — crew (assigned to event) or owner+**

```ts
{
  eventId: UUID;
  cetakTotal: number;
  mediaSetUsed?: number;       // optional, defaults to calculated from cetakTotal + frameSize
  sleeveUsed?: number;         // same
  flashdiskUsed?: number;
  pouchUsed?: number;
  photomagnetUsed?: number;
  keychainUsed?: number;
  customMaterials?: Record<string, number>;
  proofPhotoUrls: string[];    // min 1 required
  crewNotes?: string;
}
```

**Behavior:**
1. Validates user is assigned to event
2. Calculates defaults if not provided (based on frame size formulas)
3. Inserts/updates `crew_rekap`
4. Transitions event status to `awaiting_settlement`
5. Triggers notification to owner: "Rekap submitted, ready to settle"

**Note:** Inventory deduction happens at settlement, NOT here. Rekap is preliminary; owner reviews before finalizing.

### 8.2 `reviewCrewRekap({ rekapId, isApproved, reviewNotes?, adjustments? })`

**Owner+** — reviews rekap, can adjust numbers before settlement.

```ts
{
  rekapId: UUID;
  isApproved: boolean;
  reviewNotes?: string;
  adjustments?: Partial<CrewRekap>;  // override any field
}
```

### 8.3 `checkOutEquipment(input)`

**Server Action — crew or owner+**

```ts
{
  eventId: UUID;
  items: { itemId: UUID; quantity?: number }[];  // quantity for items tracked by qty
  notes?: string;
  setupPhotoUrl?: string;
}
```

**Behavior:**
1. For each item: validates currently in `gudang_pusat`
2. Updates each item: `current_location = 'event'`, `current_event_id = eventId`
3. Inserts `equipment_movements` per item (from gudang to event)
4. Notifies owner with summary

### 8.4 `checkInEquipment(input)`

**Server Action — crew or owner+**

```ts
{
  eventId: UUID;
  items: {
    itemId: UUID;
    status: 'returned_ok' | 'damaged' | 'lost';
    damageDescription?: string;     // required if damaged/lost
    damagePhotoUrls?: string[];     // required if damaged/lost
  }[];
}
```

**Behavior:**
1. For each item, based on status:
   - `returned_ok`: location → `gudang_pusat`, condition → `normal`
   - `damaged`: location → `service_center`, condition → `service`, creates `equipment_incidents` record
   - `lost`: location → `lost`, condition → `lost`, creates `equipment_incidents` (severity: total)
2. Inserts `equipment_movements` per item
3. For incidents: notifies owner with severity badge

### 8.5 `reportEquipmentIncident(input)`

**Server Action — anyone authenticated**

```ts
{
  itemId: UUID;
  eventId?: UUID;
  severity: 'minor' | 'major' | 'total';
  description: string;
  whatHappened: string;
  locationOfIncident?: string;
  witnesses?: string;
  photoUrls: string[];   // min 1 required
}
```

**Behavior:**
1. Inserts `equipment_incidents` record
2. Updates item condition (minor → normal, major → service, total → lost)
3. Notifies owner

### 8.6 `resolveIncident({ incidentId, resolutionStatus, notes?, estimatedCost? })`

**Owner+** — resolves an incident.

---

## 9. Settlement Module

### 9.1 `getSettlementPreview({ eventId })`

**Server Action — owner+**

Returns calculated values for settlement modal **without** committing.

**Output:**
```ts
{
  event: Event;
  rekap: CrewRekap;
  crewAssignments: CrewAssignment[];
  
  // Auto-calculated defaults
  hpp: {
    mediaset: number;
    sleeve: number;
    flashdisk: number;
    pouch: number;
    photomagnet: number;
    keychain: number;
    other: number;
    total: number;
  };
  
  // From crew assignments + system_config
  defaults: {
    feeLead: number;
    feeAsisten: number;
    feeCrewC: number;
    platformFee: number;
    komisi: { vendor: number; relasi: number; salesDirect: number };
  };
  
  // Sinking fund rules
  sinkingRules: SinkingFund[];
  
  // Inventory check
  inventoryWarnings: { itemId: UUID; required: number; available: number }[];
}
```

### 9.2 `closeSettlement(input)`

**Server Action — owner+** — THE BIG ONE.

```ts
{
  eventId: UUID;
  
  // HPP overrides (use rekap defaults if not provided)
  hppMediaset?: number;
  hppSleeve?: number;
  hppFlashdisk?: number;
  hppPouch?: number;
  hppPhotomagnet?: number;
  hppKeychain?: number;
  hppOther?: number;
  
  // Fees (override defaults)
  feeLead?: number;
  feeAsisten?: number;
  feeCrewC?: number;
  feeExtra?: number;
  
  // OpEx
  transportBbm?: number;
  sewaAlat?: number;
  perawatan?: number;
  konsumsi?: number;
  
  // Komisi (auto-filled, can override)
  komisiVendor?: number;
  komisiRelasi?: number;
  komisiSalesDirect?: number;
  
  // Modifiers
  platformFee?: number;
  diskonTambahan?: number;
}
```

**Behavior (atomic transaction):**

1. **Validate inventory:** check stock available for all consumables. If insufficient, return error with details.
2. **Calculate values:**
   - `revenue_gross = event.grand_total`
   - `revenue_net = revenue_gross - discount_total`
   - `hpp_total = sum of all hpp_*`
   - `opex_total = sum of all opex items`
   - `total_biaya = hpp_total + opex_total`
   - `net_profit = revenue_net - total_biaya`
   - `is_loss = (net_profit ≤ 0)`
3. **Calculate sinking funds (only if profit):**
   - For each `sinking_fund`: amount based on allocation_type and value
4. **Calculate owner pool (only if profit):**
   - `owner_pool_total = system_config.owner_pool_per_event`
   - `owner_pool_per_person = owner_pool_total / owner_count`
5. **Insert `event_settlements`** (the snapshot)
6. **Update event status** to `completed`
7. **Insert stock_movements** for each consumable used
8. **Generate journal entries** (double-entry):
   - Revenue recognition (if not already recognized)
   - HPP entries (Inventory Cr, HPP Dr per item)
   - Crew fee payable (Crew Payable Cr, Fee Expense Dr)
   - Vendor commission (if any)
   - Direct sales commission (if any)
   - Platform fee
   - Sinking fund allocations (Sinking Liability Cr, retained earnings Dr)
   - Owner pool distribution (4 Owner Earnings entries)
9. **Insert sinking_fund_movements** for each fund
10. **Insert owner_earnings** entries:
    - 4 entries of `owner_pool_per_person` (one per owner) with `earning_type: 'profit_share'`
    - If channel = direct: 1 extra entry for Rama with `earning_type: 'commission_direct'`
    - If channel = relasi (and referrer is owner): 1 extra for that owner with `earning_type: 'commission_relasi'`
11. **Audit log entry**
12. **Notifications:**
    - To all owners: settlement summary with their share
    - To assigned crew: fee added to balance

**Output:**
```ts
{
  settlement: EventSettlement;
  journalEntryId: UUID;
  notifications: number;  // count sent
}
```

**Errors:**
- `INSUFFICIENT_STOCK` (with item details)
- `EVENT_ALREADY_SETTLED`
- `EVENT_INVALID_STATUS` (must be `awaiting_settlement` or `in_progress`)

### 9.3 `reopenSettlement({ settlementId, reason })`

**Super admin only** — reverses a closed settlement.

**Behavior:**
1. Reverses all journal entries (creates reversal entries)
2. Restores inventory (reverses stock_movements)
3. Reverses owner_earnings entries
4. Reverses sinking_fund_movements
5. Updates event status back to `awaiting_settlement`
6. Sets `event_settlements.is_reopened = true`
7. Audit logged with reason

---

## 10. Sinking Funds Module

### 10.1 `listSinkingFunds()`

**Owner+**

Returns all funds with computed current balances.

### 10.2 `createSinkingFund(input)`

**Super admin only**

```ts
{
  code: string;
  name: string;
  description?: string;
  allocationType: 'percentage' | 'flat';
  allocationValue: number;
  targetBalance?: number;
  coaAccount?: string;
  displayOrder?: number;
}
```

### 10.3 `updateSinkingFund({ id, ...patch })`

**Super admin only**

### 10.4 `withdrawFromFund(input)`

**Owner+**

```ts
{
  fundId: UUID;
  amount: number;
  targetBankAccountId: UUID;
  description: string;
}
```

**Behavior:**
1. Validates fund balance ≥ amount
2. Inserts `sinking_fund_movements` (withdrawal)
3. Creates journal entry (Sinking Liability Dr, Bank Cr)
4. Audit logged

### 10.5 `getFundBalance({ fundId })`

Returns computed balance from movements.

---

## 11. Finance & Reports Module

### 11.1 `getCashPosition()`

**Owner+**

Returns balance per bank account + total + sinking funds locked + safe-to-spend.

```ts
{
  accounts: { account: BankAccount; balance: number }[];
  totalBank: number;
  sinkingFundsLocked: number;
  safeToSpend: number;        // totalBank - sinkingFundsLocked - operatingReserve
}
```

### 11.2 `getProjectPnL({ filter })`

**Owner+**

```ts
{
  year: number;
  month?: number;            // omit for full year
  status?: 'completed' | 'all';
}
```

**Output:** Array of P&L per event with revenue, HPP, OpEx, net, margin.

### 11.3 `getJournalEntries({ filter })`

**Owner+**

```ts
{
  dateFrom?: Date;
  dateTo?: Date;
  accountCode?: string;
  entryType?: JournalEntryType;
  search?: string;
  limit?: number;
  offset?: number;
}
```

**Output:** Entries with their lines (joined).

### 11.4 `addManualJournalEntry(input)`

**Owner+**

```ts
{
  entryDate: Date;
  description: string;
  entryType: JournalEntryType;
  lines: { accountCode: string; debit?: number; credit?: number; description?: string }[];
}
```

**Validates:** sum(debits) = sum(credits)

Used for non-event expenses (rent, internet, fuel for office, equipment purchases, etc.).

### 11.5 `getOwnerEarnings({ ownerUserId, period })`

Each owner can call for themselves. Super admin can call for anyone.

**Output:**
```ts
{
  totalEarned: number;
  totalWithdrawn: number;
  availableBalance: number;
  breakdown: {
    profitShare: number;
    commissionDirect: number;
    commissionRelasi: number;
    bonus: number;
    adjustment: number;
  };
  entries: OwnerEarningEntry[];
}
```

### 11.6 `withdrawOwnerEarnings(input)`

**Owner+ (self only) or super admin**

```ts
{
  amount: number;
  withdrawalMethod: 'transfer' | 'cash';
  withdrawalAccount?: string;
  withdrawalReference?: string;
  notes?: string;
}
```

Validates amount ≤ available balance. Creates `owner_earnings` entry with negative amount.

### 11.7 `getMonthlyReport({ year, month })`

Generates aggregate metrics for monthly report PDF.

---

## 12. Notifications Module

### 12.1 `listNotifications({ filter })`

```ts
{
  unreadOnly?: boolean;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  limit?: number;
  offset?: number;
}
```

User sees only their own (RLS enforced).

### 12.2 `markNotificationRead({ id })` / `markAllRead()`

### 12.3 `dismissNotification({ id })`

### 12.4 `runAnomalyScan()`

**Cron-triggered** — runs daily at 6 AM WIB via Vercel Cron.

**Behavior:**
1. For each enabled `notification_rules`, evaluate condition against current data
2. Insert `notifications` for each new occurrence (avoid duplicates by checking existing unresolved)
3. Auto-resolve previously-flagged items that no longer match condition
4. Send push notifications via Web Push API for users who opted in

**Endpoint:** `POST /api/cron/anomaly-scan` (protected by `CRON_SECRET` header)

---

## 13. File Storage Module

### 13.1 Supabase Storage (small files)

Used for: avatars, item images, brand assets.

**Server Action:** `uploadAvatar({ userId, file })`
- Validates user can update (self or super admin)
- Compresses image client-side first
- Uploads to `public-assets` bucket, path: `avatars/{userId}.{ext}`
- Updates `users.avatar_url`

### 13.2 Google Drive (large files)

**Auth setup endpoint:** `GET /api/auth/google-drive` and `GET /api/auth/google-drive/callback`
- Super admin–only OAuth flow to authorize Drive access
- Stores refresh_token encrypted in `system_config`

**Server Actions for Drive:**

#### `createEventDriveFolders({ eventId })`

Creates folder structure for an event:
```
Tetra Ops Storage/
└── 2026/01-Januari/PRJ-XXXX - Client Name/
    ├── Design/
    ├── Documentation/
    └── Payment Proofs/
```

Returns folder URLs, updates event record.

#### `uploadFileToDrive({ folderId, file, fileName })`

Streams file to Drive, returns shareable link. Used for:
- Crew photo uploads (rekap proof, equipment photos)
- Payment proof uploads (large)
- Generated PDFs archived

#### `getDriveFolder({ folderId })`

Lists files in a folder. Used for displaying linked files in event detail.

---

## 14. Settings & Config Module

### 14.1 `getSystemConfig({ key? })`

Returns single config or all (filtered to non-sensitive for non-super-admin).

### 14.2 `updateSystemConfig({ key, value })`

**Super admin only**

Audit logged.

### 14.3 `listNotificationRules()` / `updateNotificationRule({...})`

Super admin only.

### 14.4 `listWhatsappTemplates()` / `updateWhatsappTemplate({...})`

Super admin only.

---

## 15. Onboarding Wizard Module

### 15.1 `getOnboardingState()`

Returns wizard progress (which steps complete, draft data).

### 15.2 `saveOnboardingStep({ step, data })`

Saves draft for a specific step. Doesn't finalize.

### 15.3 `completeOnboarding()`

**Super admin only — only callable when `is_initialized = false`.**

**Behavior:**
1. Validates all required steps completed
2. Applies all draft data atomically:
   - Business profile → `system_config`
   - Team members → `users`
   - Inventory → `inventory_items` + initial `stock_movements`
   - Bank balances → initial journal entries
   - Active events → `events` + payments
3. Sets `system_config.is_initialized = true`
4. Returns success with summary

---

## 16. Cron Endpoints

All protected by `CRON_SECRET` header.

### 16.1 `POST /api/cron/anomaly-scan`

Daily 6 AM WIB. Runs anomaly detection (see §12.4).

### 16.2 `POST /api/cron/auto-status-update`

Daily 5 AM WIB. Auto-updates event statuses:
- `confirmed` → `upcoming` when within 7 days
- `upcoming` → `in_progress` on event date
- `awaiting_settlement` → no auto-transition (requires owner action)

### 16.3 `POST /api/cron/weekly-backup`

Sundays 2 AM WIB. Exports critical tables to CSV, uploads to Drive Backups folder.

---

## 17. Webhooks (Future)

None in V1. Reserved for future:
- `POST /api/webhooks/whatsapp-status` — if WA Business API integrated
- `POST /api/webhooks/payment-gateway` — if payment gateway added

---

## 18. Error Codes Reference

| Code | HTTP Equiv | Description |
|------|-----------|-------------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Authenticated but lacking permission |
| `NOT_FOUND` | 404 | Entity doesn't exist |
| `CONFLICT` | 409 | State conflict (e.g., already settled) |
| `INSUFFICIENT_STOCK` | 422 | Inventory not enough for operation |
| `INSUFFICIENT_BALANCE` | 422 | Sinking fund / account balance too low |
| `CREW_DOUBLE_BOOKED` | 422 | Crew time overlap |
| `INVALID_TRANSITION` | 422 | Status transition not allowed |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Drive API down, etc. |

---

## 19. Type Definitions Location

All shared TypeScript types live in `lib/types/*.ts` and are derived from:
- Supabase generated types (from schema): `lib/types/database.ts`
- Domain types (computed/composed): `lib/types/domain.ts`
- Zod schemas (single source of truth for validation): `lib/validations/*.ts`

Inferred types from Zod:
```ts
export const CreateEventSchema = z.object({...});
export type CreateEventInput = z.infer<typeof CreateEventSchema>;
```

This pattern keeps validation and types in sync — change the schema, type updates automatically.

---

**End of API Specification**

*Next document: [07_FOLDER_STRUCTURE.md](./07_FOLDER_STRUCTURE.md)*
