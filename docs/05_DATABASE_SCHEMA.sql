-- ============================================================================
-- TETRA OPS — DATABASE SCHEMA
-- ============================================================================
-- Project: Tetra Ops
-- Version: 1.0.0
-- Database: PostgreSQL 15+ (Supabase)
-- 
-- This file contains the COMPLETE schema for Tetra Ops including:
-- - Extensions
-- - Custom types (enums)
-- - Tables with constraints
-- - Indexes for performance
-- - Row Level Security (RLS) policies
-- - Triggers for derived data
-- - Seed data for initial setup
-- 
-- Run this file in order against a fresh Supabase project.
-- For migrations, split into separate files per change.
-- ============================================================================

-- ============================================================================
-- SECTION 1: EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- ============================================================================
-- SECTION 2: CUSTOM TYPES (ENUMS)
-- ============================================================================

CREATE TYPE user_role AS ENUM (
  'super_admin',
  'owner',
  'crew',
  'pending_approval'
);

CREATE TYPE crew_tier AS ENUM ('senior', 'junior');

CREATE TYPE event_status AS ENUM (
  'draft',
  'confirmed',
  'design_brief',
  'design_approved',
  'upcoming',
  'in_progress',
  'awaiting_settlement',
  'completed',
  'cancelled',
  'archived'
);

CREATE TYPE channel_type AS ENUM (
  'direct',
  'vendor',
  'relasi'
);

CREATE TYPE service_type AS ENUM (
  'photobooth_classic',
  'videobooth_360',
  'magazine_combo',
  'magazine_box_only',
  'photostage_only',
  'photostage_combo'
);

CREATE TYPE frame_size AS ENUM (
  '2R',
  '4R',
  'polaroid',
  'none'
);

CREATE TYPE backdrop_color AS ENUM (
  'merah',
  'gold',
  'putih',
  'silver',
  'custom'
);

CREATE TYPE payment_status AS ENUM (
  'unpaid',
  'partial',
  'paid',
  'overdue'
);

CREATE TYPE item_category AS ENUM (
  'consumable',
  'equipment'
);

CREATE TYPE equipment_condition AS ENUM (
  'normal',
  'service',
  'damaged',
  'lost'
);

CREATE TYPE equipment_location AS ENUM (
  'gudang_pusat',
  'event',
  'service_center',
  'crew_carry',
  'lost'
);

CREATE TYPE movement_direction AS ENUM ('in', 'out', 'adjustment');

CREATE TYPE movement_source AS ENUM (
  'settlement',
  'purchase',
  'manual_adjust',
  'damage',
  'loss',
  'stock_take',
  'transfer'
);

CREATE TYPE journal_entry_type AS ENUM (
  'revenue',
  'expense',
  'asset_in',
  'asset_out',
  'transfer',
  'adjustment',
  'reversal'
);

CREATE TYPE notification_severity AS ENUM (
  'alert',
  'warning',
  'info',
  'success'
);

CREATE TYPE notification_category AS ENUM (
  'operational',
  'financial',
  'inventory',
  'system'
);

CREATE TYPE addon_category AS ENUM (
  'voucher',
  'print_extras',
  'time_extras',
  'experience',
  'costume'
);

CREATE TYPE crew_role_in_event AS ENUM ('lead', 'asisten', 'crew_c');

CREATE TYPE incident_severity AS ENUM ('minor', 'major', 'total');

-- ============================================================================
-- SECTION 3: CORE USER MANAGEMENT
-- ============================================================================

-- Custom users table (extends Supabase auth.users)
-- Note: auth.users is managed by Supabase Auth.
-- This table holds our custom user attributes.
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  nickname TEXT,
  phone_wa TEXT,
  role user_role NOT NULL DEFAULT 'pending_approval',
  tier crew_tier,  -- only for crew role
  default_fee_override INTEGER,  -- nullable; if set, overrides tier rate
  bank_account TEXT,
  joined_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  notes TEXT,
  
  -- Notification preferences (JSON)
  notification_prefs JSONB DEFAULT '{"push": true, "email": false}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  CONSTRAINT valid_tier_for_crew CHECK (
    (role = 'crew' AND tier IS NOT NULL) OR
    (role <> 'crew' AND tier IS NULL)
  )
);

CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active ON users(is_active) WHERE deleted_at IS NULL;

-- ============================================================================
-- SECTION 4: SYSTEM CONFIGURATION
-- ============================================================================

-- Key-value system config
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  category TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SECTION 5: MASTER DATA — PACKAGES, ADDONS, BANK ACCOUNTS
-- ============================================================================

CREATE TABLE packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category service_type NOT NULL,
  frame_size frame_size NOT NULL,
  duration_hours INTEGER NOT NULL,
  base_price BIGINT NOT NULL,  -- IDR (no decimals)
  description TEXT,
  default_consumables_estimate JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  CONSTRAINT positive_price CHECK (base_price > 0),
  CONSTRAINT positive_duration CHECK (duration_hours > 0)
);

CREATE INDEX idx_packages_active ON packages(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_packages_category ON packages(category) WHERE deleted_at IS NULL;

CREATE TABLE addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  price BIGINT NOT NULL,
  category addon_category NOT NULL,
  requires_extra_crew BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  CONSTRAINT positive_addon_price CHECK (price >= 0)
);

CREATE INDEX idx_addons_active ON addons(is_active) WHERE deleted_at IS NULL;

CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT,
  account_holder TEXT,
  coa_code TEXT NOT NULL UNIQUE,  -- e.g., "1-110"
  is_default_receive BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one default
CREATE UNIQUE INDEX idx_bank_accounts_default 
  ON bank_accounts(is_default_receive) 
  WHERE is_default_receive = true AND is_active = true;

-- ============================================================================
-- SECTION 6: CHART OF ACCOUNTS
-- ============================================================================

CREATE TABLE chart_of_accounts (
  code TEXT PRIMARY KEY,        -- e.g., "1-100", "5-200"
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,   -- asset, liability, equity, revenue, expense
  parent_code TEXT REFERENCES chart_of_accounts(code),
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coa_type ON chart_of_accounts(account_type);

-- ============================================================================
-- SECTION 7: INVENTORY — ITEMS, MOVEMENTS, EQUIPMENT
-- ============================================================================

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL UNIQUE,  -- e.g., "ITM-SLEEVE-2R"
  name TEXT NOT NULL,
  category item_category NOT NULL,
  unit TEXT NOT NULL,  -- "pcs", "box", "set", etc.
  unit_conversion JSONB DEFAULT '{}'::jsonb,  -- e.g., {"box": 1400, "pcs": 1}
  coa_account TEXT REFERENCES chart_of_accounts(code),
  
  -- Stock thresholds
  min_stock_alert INTEGER NOT NULL DEFAULT 0,
  
  -- Pricing (rolling avg of last N purchases)
  purchase_price_avg BIGINT NOT NULL DEFAULT 0,
  selling_price BIGINT,  -- nullable; only for items sold separately
  
  -- Equipment-specific (NULL for consumables)
  purchase_date DATE,
  purchase_price BIGINT,
  useful_life_months INTEGER,
  
  -- Equipment current state
  condition equipment_condition,
  current_location equipment_location,
  current_event_id UUID,  -- when location = 'event'
  current_crew_id UUID REFERENCES users(id),  -- when location = 'crew_carry'
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  CONSTRAINT consumable_no_equipment_fields CHECK (
    category = 'consumable' AND condition IS NULL AND current_location IS NULL
    OR category = 'equipment'
  )
);

CREATE INDEX idx_inventory_sku ON inventory_items(sku);
CREATE INDEX idx_inventory_category ON inventory_items(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_active ON inventory_items(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_name_trgm ON inventory_items USING gin (name gin_trgm_ops);

-- Stock movements (append-only ledger)
-- current_stock for any item = SUM of all movements for that item
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref_id TEXT NOT NULL UNIQUE,  -- e.g., "MOV-S-77979110"
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  direction movement_direction NOT NULL,
  quantity INTEGER NOT NULL,  -- always positive; direction determines sign
  unit_cost BIGINT,  -- per-unit cost at time of movement
  
  source movement_source NOT NULL,
  source_id UUID,  -- references events.id, purchases.id, or NULL
  source_description TEXT,
  
  notes TEXT,
  performed_by UUID REFERENCES users(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT positive_quantity CHECK (quantity > 0)
);

CREATE INDEX idx_stock_movements_item ON stock_movements(item_id, created_at DESC);
CREATE INDEX idx_stock_movements_source ON stock_movements(source, source_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(created_at DESC);

-- Equipment movements (separate from stock for clarity)
CREATE TABLE equipment_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  
  from_location equipment_location,
  to_location equipment_location NOT NULL,
  from_event_id UUID,
  to_event_id UUID,
  from_crew_id UUID REFERENCES users(id),
  to_crew_id UUID REFERENCES users(id),
  
  movement_type TEXT NOT NULL,  -- 'check_out', 'check_in', 'transfer', 'service', 'restore'
  notes TEXT,
  performed_by UUID REFERENCES users(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_equipment_movements_item ON equipment_movements(item_id, created_at DESC);

-- Equipment incidents (damage/loss reports)
CREATE TABLE equipment_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  event_id UUID,  -- the event during which it happened
  reported_by UUID NOT NULL REFERENCES users(id),
  
  severity incident_severity NOT NULL,
  description TEXT NOT NULL,
  what_happened TEXT,
  location_of_incident TEXT,
  witnesses TEXT,  -- comma-separated names
  
  photo_urls TEXT[],  -- array of URLs (Google Drive links)
  
  estimated_cost BIGINT,  -- optional, owner-set after review
  resolution_status TEXT NOT NULL DEFAULT 'pending',  -- pending, in_progress, resolved
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incidents_item ON equipment_incidents(item_id);
CREATE INDEX idx_incidents_status ON equipment_incidents(resolution_status);

-- ============================================================================
-- SECTION 8: EVENTS — THE CORE ENTITY
-- ============================================================================

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id TEXT NOT NULL UNIQUE,  -- e.g., "PRJ-20260501-6026"
  
  -- Status
  status event_status NOT NULL DEFAULT 'draft',
  
  -- Channel & Sales
  channel channel_type NOT NULL,
  vendor_name TEXT,  -- when channel = vendor
  vendor_contact TEXT,
  vendor_commission_rate DECIMAL(5,2),  -- percentage, e.g., 10.00
  vendor_commission_amount BIGINT,  -- absolute IDR (overrides rate if set)
  referrer_user_id UUID REFERENCES users(id),  -- when channel = relasi
  referrer_type TEXT,  -- 'owner' or 'crew'
  referrer_commission BIGINT,
  
  -- Direct sales commission (calculated post-discount)
  direct_sales_commission BIGINT DEFAULT 0,
  
  -- Client
  client_name TEXT NOT NULL,
  client_wa TEXT NOT NULL,
  client_email TEXT,
  pic_name TEXT,
  pic_wa TEXT,
  
  -- Service Specification
  service_type service_type NOT NULL,
  package_id UUID REFERENCES packages(id),
  custom_package_name TEXT,
  custom_package_price BIGINT,
  
  frame_size frame_size NOT NULL,
  
  -- Customization
  backdrop_source TEXT NOT NULL DEFAULT 'basic_tetra',  -- 'basic_tetra' or 'custom'
  backdrop_color backdrop_color,
  include_flashdisk_pouch BOOLEAN NOT NULL DEFAULT true,
  
  -- Event details
  event_category TEXT NOT NULL,  -- 'pernikahan', 'corporate', etc.
  event_date DATE NOT NULL,
  setup_time TIME NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Location
  venue_name TEXT NOT NULL,
  venue_address TEXT,
  venue_city TEXT,
  google_maps_url TEXT,
  google_maps_lat DECIMAL(10, 7),
  google_maps_lng DECIMAL(11, 7),
  logistic_notes TEXT,
  
  -- Special notes for crew
  crew_notes TEXT,
  
  -- Financial
  base_price BIGINT NOT NULL DEFAULT 0,
  addons_total BIGINT NOT NULL DEFAULT 0,
  discount_amount BIGINT NOT NULL DEFAULT 0,
  discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  gross_up_pph_amount BIGINT NOT NULL DEFAULT 0,
  grand_total BIGINT NOT NULL DEFAULT 0,
  
  -- Payment tracking
  total_paid BIGINT NOT NULL DEFAULT 0,
  remaining_balance BIGINT NOT NULL DEFAULT 0,  -- = grand_total - total_paid
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  due_date DATE,  -- typically event_date - 3 days
  
  -- Design tracking
  design_brief_at TIMESTAMPTZ,
  design_approved_at TIMESTAMPTZ,
  design_drive_folder_url TEXT,
  
  -- Documentation
  documentation_drive_folder_url TEXT,
  
  -- Audit
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  CONSTRAINT positive_grand_total CHECK (grand_total >= 0)
);

CREATE INDEX idx_events_status ON events(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_date ON events(event_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_payment_status ON events(payment_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_channel ON events(channel) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_client_name_trgm ON events USING gin (client_name gin_trgm_ops);
CREATE INDEX idx_events_project_id ON events(project_id);
CREATE INDEX idx_events_created_at ON events(created_at DESC);

-- Junction: event addons
CREATE TABLE event_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES addons(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price BIGINT NOT NULL,  -- snapshot at time of booking
  total_price BIGINT NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(event_id, addon_id),
  CONSTRAINT positive_quantity CHECK (quantity > 0)
);

CREATE INDEX idx_event_addons_event ON event_addons(event_id);

-- Crew assignments
CREATE TABLE crew_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role_in_event crew_role_in_event NOT NULL,
  
  -- Fee at time of assignment (snapshot)
  fee_amount BIGINT NOT NULL,
  fee_override_reason TEXT,  -- if differs from tier default
  bonus_amount BIGINT NOT NULL DEFAULT 0,
  
  -- Disbursement tracking
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  paid_via_account TEXT,
  
  assigned_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(event_id, user_id)
);

CREATE INDEX idx_crew_assignments_event ON crew_assignments(event_id);
CREATE INDEX idx_crew_assignments_user ON crew_assignments(user_id, created_at DESC);
CREATE INDEX idx_crew_assignments_paid ON crew_assignments(is_paid);

-- Crew rekap (consumable usage report from field crew)
CREATE TABLE crew_rekap (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES users(id),
  
  -- Print counts
  cetak_total INTEGER NOT NULL DEFAULT 0,
  media_set_used INTEGER NOT NULL DEFAULT 0,
  sleeve_used INTEGER NOT NULL DEFAULT 0,
  
  -- FD/Pouch
  flashdisk_used INTEGER NOT NULL DEFAULT 0,
  pouch_used INTEGER NOT NULL DEFAULT 0,
  
  -- Add-on materials
  photomagnet_used INTEGER NOT NULL DEFAULT 0,
  keychain_used INTEGER NOT NULL DEFAULT 0,
  custom_materials JSONB DEFAULT '{}'::jsonb,  -- for ad-hoc items
  
  -- Proof
  proof_photo_urls TEXT[] NOT NULL,  -- min 1 required (validated app-side)
  
  -- Notes
  crew_notes TEXT,
  
  -- Owner review (post-submission)
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  is_approved BOOLEAN,
  review_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crew_rekap_event ON crew_rekap(event_id);
CREATE INDEX idx_crew_rekap_submitted_by ON crew_rekap(submitted_by);

-- End of Schema Part 1
-- Continued in 05_DATABASE_SCHEMA_part2.sql

-- TETRA OPS — DATABASE SCHEMA (PART 2)
-- ============================================================================
-- Continues from 05_DATABASE_SCHEMA_part1.sql
-- 
-- Sections in this file:
--   9. Payments
--  10. Journal Entries (Double-Entry Bookkeeping)
--  11. Event Settlements (Snapshot)
--  12. Sinking Funds
--  13. Owner Earnings Ledger
--  14. Notifications
--  15. Audit Log
--  16. Notification Rules & WhatsApp Templates
--  17. Triggers & Functions
--  18. Row Level Security (RLS) Policies
--  19. Seed Data
-- ============================================================================

-- ============================================================================
-- SECTION 9: PAYMENTS
-- ============================================================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref_id TEXT NOT NULL UNIQUE,  -- e.g., "PAY-20260501-1234"
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  
  amount BIGINT NOT NULL,
  payment_date DATE NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  
  -- Type: 'dp' (down payment), 'partial', 'pelunasan' (full settlement)
  payment_type TEXT NOT NULL,
  
  proof_url TEXT,  -- bukti transfer (Supabase Storage or Drive link)
  notes TEXT,
  
  -- Audit
  recorded_by UUID NOT NULL REFERENCES users(id),
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES users(id),
  reversal_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT positive_amount CHECK (amount > 0)
);

CREATE INDEX idx_payments_event ON payments(event_id);
CREATE INDEX idx_payments_date ON payments(payment_date DESC);
CREATE INDEX idx_payments_bank ON payments(bank_account_id);
CREATE INDEX idx_payments_active ON payments(is_reversed) WHERE is_reversed = false;

-- ============================================================================
-- SECTION 10: JOURNAL ENTRIES (DOUBLE-ENTRY BOOKKEEPING)
-- ============================================================================

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref_id TEXT NOT NULL UNIQUE,  -- e.g., "JE-20260501-9988"
  
  entry_date DATE NOT NULL,
  entry_type journal_entry_type NOT NULL,
  description TEXT NOT NULL,
  
  -- Source linking (denormalized for fast queries)
  source_type TEXT,  -- 'event', 'payment', 'settlement', 'manual', 'sinking_fund'
  source_id UUID,
  source_event_id UUID REFERENCES events(id),
  
  -- Total amount (sum of debits = sum of credits)
  total_amount BIGINT NOT NULL,
  
  -- Reversal tracking
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  reversed_by_entry_id UUID REFERENCES journal_entries(id),
  reversed_at TIMESTAMPTZ,
  
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT positive_total CHECK (total_amount >= 0)
);

CREATE INDEX idx_journal_entries_date ON journal_entries(entry_date DESC);
CREATE INDEX idx_journal_entries_type ON journal_entries(entry_type);
CREATE INDEX idx_journal_entries_source ON journal_entries(source_type, source_id);
CREATE INDEX idx_journal_entries_event ON journal_entries(source_event_id);

-- Journal lines (the actual double-entry debits and credits)
-- Every entry must have at least 2 lines, with sum(debits) = sum(credits)
CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  
  account_code TEXT NOT NULL REFERENCES chart_of_accounts(code),
  
  -- One of these is non-zero, the other is 0
  debit_amount BIGINT NOT NULL DEFAULT 0,
  credit_amount BIGINT NOT NULL DEFAULT 0,
  
  description TEXT,
  line_order INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT only_one_side CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (debit_amount = 0 AND credit_amount > 0)
  )
);

CREATE INDEX idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_code);
CREATE INDEX idx_journal_lines_created ON journal_lines(created_at DESC);

-- ============================================================================
-- SECTION 11: EVENT SETTLEMENTS (SNAPSHOT)
-- ============================================================================

-- Stores a SNAPSHOT of all calculations at the moment settlement is closed.
-- Even if rates change later, historical settlements remain accurate.
CREATE TABLE event_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE RESTRICT,
  
  -- Revenue side
  revenue_gross BIGINT NOT NULL,
  discount_total BIGINT NOT NULL DEFAULT 0,
  revenue_net BIGINT NOT NULL,
  
  -- HPP (Cost of Goods Sold)
  hpp_mediaset BIGINT NOT NULL DEFAULT 0,
  hpp_sleeve BIGINT NOT NULL DEFAULT 0,
  hpp_flashdisk BIGINT NOT NULL DEFAULT 0,
  hpp_pouch BIGINT NOT NULL DEFAULT 0,
  hpp_photomagnet BIGINT NOT NULL DEFAULT 0,
  hpp_keychain BIGINT NOT NULL DEFAULT 0,
  hpp_other BIGINT NOT NULL DEFAULT 0,
  hpp_total BIGINT NOT NULL,
  
  -- OpEx
  fee_lead BIGINT NOT NULL DEFAULT 0,
  fee_asisten BIGINT NOT NULL DEFAULT 0,
  fee_crew_c BIGINT NOT NULL DEFAULT 0,
  fee_extra BIGINT NOT NULL DEFAULT 0,
  transport_bbm BIGINT NOT NULL DEFAULT 0,
  sewa_alat BIGINT NOT NULL DEFAULT 0,
  perawatan BIGINT NOT NULL DEFAULT 0,
  konsumsi BIGINT NOT NULL DEFAULT 0,
  komisi_vendor BIGINT NOT NULL DEFAULT 0,
  komisi_relasi BIGINT NOT NULL DEFAULT 0,
  komisi_sales_direct BIGINT NOT NULL DEFAULT 0,
  platform_fee BIGINT NOT NULL DEFAULT 0,
  diskon_tambahan BIGINT NOT NULL DEFAULT 0,
  opex_total BIGINT NOT NULL,
  
  -- Profit & distribution
  total_biaya BIGINT NOT NULL,    -- HPP + OpEx
  net_profit BIGINT NOT NULL,     -- can be negative (loss)
  margin_percentage DECIMAL(5,2),
  is_loss BOOLEAN NOT NULL DEFAULT false,
  
  -- Sinking fund allocations (snapshot)
  sinking_equipment BIGINT NOT NULL DEFAULT 0,
  sinking_maintenance BIGINT NOT NULL DEFAULT 0,
  sinking_crew_reserve BIGINT NOT NULL DEFAULT 0,
  sinking_emergency BIGINT NOT NULL DEFAULT 0,
  sinking_total BIGINT NOT NULL DEFAULT 0,
  
  -- Owner pool distribution (Rp 50k × 4 = Rp 200k default, only if profit > 0)
  owner_pool_total BIGINT NOT NULL DEFAULT 0,
  owner_pool_per_person BIGINT NOT NULL DEFAULT 0,
  
  -- Operating cash retained
  operating_cash_kept BIGINT NOT NULL DEFAULT 0,
  
  -- Linked journal entry
  journal_entry_id UUID REFERENCES journal_entries(id),
  
  -- Status
  is_reopened BOOLEAN NOT NULL DEFAULT false,
  reopened_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES users(id),
  reopen_reason TEXT,
  
  closed_by UUID NOT NULL REFERENCES users(id),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlements_event ON event_settlements(event_id);
CREATE INDEX idx_settlements_closed_at ON event_settlements(closed_at DESC);
CREATE INDEX idx_settlements_loss ON event_settlements(is_loss);

-- ============================================================================
-- SECTION 12: SINKING FUNDS
-- ============================================================================

CREATE TABLE sinking_funds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,  -- e.g., 'equipment', 'maintenance', 'crew_reserve', 'emergency'
  name TEXT NOT NULL,
  description TEXT,
  
  -- Allocation rule
  allocation_type TEXT NOT NULL,  -- 'percentage' or 'flat'
  allocation_value DECIMAL(10,4) NOT NULL,  -- e.g., 5.00 for 5%, or 100000 for Rp 100k
  
  -- Target (optional)
  target_balance BIGINT,
  
  -- Linked COA account (for ledger)
  coa_account TEXT REFERENCES chart_of_accounts(code),
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sinking_funds_active ON sinking_funds(is_active);

-- Movements per fund (deposits + withdrawals)
-- Current balance = SUM(deposits) - SUM(withdrawals)
CREATE TABLE sinking_fund_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fund_id UUID NOT NULL REFERENCES sinking_funds(id),
  
  movement_type TEXT NOT NULL,  -- 'deposit', 'withdrawal'
  amount BIGINT NOT NULL,
  
  -- Source linking
  source_type TEXT,  -- 'settlement', 'manual', 'transfer'
  source_event_id UUID REFERENCES events(id),
  source_settlement_id UUID REFERENCES event_settlements(id),
  
  -- For withdrawals: where did money go
  target_bank_account_id UUID REFERENCES bank_accounts(id),
  
  description TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES users(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT positive_amount CHECK (amount > 0)
);

CREATE INDEX idx_sinking_movements_fund ON sinking_fund_movements(fund_id, created_at DESC);
CREATE INDEX idx_sinking_movements_event ON sinking_fund_movements(source_event_id);

-- ============================================================================
-- SECTION 13: OWNER EARNINGS LEDGER
-- ============================================================================

-- Per-owner earnings tracking. Append-only ledger.
-- Balance = SUM(earned) - SUM(withdrawn)
CREATE TABLE owner_earnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  
  -- Type: 'profit_share', 'commission_direct', 'commission_relasi', 'withdrawal', 'bonus', 'adjustment'
  earning_type TEXT NOT NULL,
  amount BIGINT NOT NULL,  -- positive for earned, negative for withdrawn
  
  -- Source linking
  source_event_id UUID REFERENCES events(id),
  source_settlement_id UUID REFERENCES event_settlements(id),
  
  description TEXT NOT NULL,
  
  -- Withdrawal-specific
  withdrawal_method TEXT,  -- 'transfer', 'cash'
  withdrawal_account TEXT,
  withdrawal_reference TEXT,
  
  performed_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_owner_earnings_user ON owner_earnings(owner_user_id, created_at DESC);
CREATE INDEX idx_owner_earnings_event ON owner_earnings(source_event_id);
CREATE INDEX idx_owner_earnings_type ON owner_earnings(earning_type);

-- ============================================================================
-- SECTION 14: NOTIFICATIONS
-- ============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  severity notification_severity NOT NULL,
  category notification_category NOT NULL,
  
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  
  -- Linked entity
  entity_type TEXT,  -- 'event', 'item', 'payment', etc.
  entity_id UUID,
  action_url TEXT,  -- where to navigate when clicked
  
  -- State
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  
  -- Anomaly tracking (auto-resolution)
  anomaly_rule_id UUID,  -- references notification_rules
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC) 
  WHERE is_read = false AND is_dismissed = false;
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_entity ON notifications(entity_type, entity_id);
CREATE INDEX idx_notifications_severity ON notifications(severity);

-- ============================================================================
-- SECTION 15: AUDIT LOG
-- ============================================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Who
  actor_id UUID REFERENCES users(id),
  actor_email TEXT,  -- denormalized for cases where user deleted
  
  -- What
  action TEXT NOT NULL,  -- 'create', 'update', 'delete', 'login', 'role_change', etc.
  entity_type TEXT NOT NULL,
  entity_id UUID,
  
  -- Changes
  changes JSONB,  -- { "before": {...}, "after": {...} }
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at DESC);
CREATE INDEX idx_audit_log_date ON audit_log(created_at DESC);

-- ============================================================================
-- SECTION 16: NOTIFICATION RULES & WHATSAPP TEMPLATES
-- ============================================================================

CREATE TABLE notification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,  -- e.g., 'h_minus_2_no_crew'
  name TEXT NOT NULL,
  description TEXT,
  
  category notification_category NOT NULL,
  severity notification_severity NOT NULL,
  
  -- Trigger configuration
  trigger_condition JSONB NOT NULL,  -- e.g., { "days_before_event": 2, "check": "no_crew_assigned" }
  
  -- Recipients
  recipient_roles TEXT[] NOT NULL DEFAULT ARRAY['super_admin'],  -- ['super_admin', 'owner', 'crew']
  
  -- Push notification?
  send_push BOOLEAN NOT NULL DEFAULT true,
  
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,  -- e.g., 'reminder_dp', 'thank_you'
  name TEXT NOT NULL,
  description TEXT,
  
  -- Template body with placeholders like {client_name}, {event_date}
  template_body TEXT NOT NULL,
  
  -- Available variables for this template
  available_variables TEXT[],
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SECTION 17: TRIGGERS & FUNCTIONS
-- ============================================================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_packages_updated_at BEFORE UPDATE ON packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_addons_updated_at BEFORE UPDATE ON addons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_crew_assignments_updated_at BEFORE UPDATE ON crew_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_crew_rekap_updated_at BEFORE UPDATE ON crew_rekap
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_equipment_incidents_updated_at BEFORE UPDATE ON equipment_incidents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sinking_funds_updated_at BEFORE UPDATE ON sinking_funds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function: Calculate event remaining_balance and payment_status
CREATE OR REPLACE FUNCTION recalculate_event_payment_status(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  v_grand_total BIGINT;
  v_total_paid BIGINT;
  v_event_date DATE;
  v_due_date DATE;
  v_new_status payment_status;
BEGIN
  SELECT grand_total, event_date, due_date
    INTO v_grand_total, v_event_date, v_due_date
  FROM events WHERE id = p_event_id;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments
  WHERE event_id = p_event_id AND is_reversed = false;
  
  -- Determine status
  IF v_total_paid = 0 THEN
    IF v_due_date IS NOT NULL AND v_due_date < CURRENT_DATE THEN
      v_new_status := 'overdue';
    ELSE
      v_new_status := 'unpaid';
    END IF;
  ELSIF v_total_paid >= v_grand_total THEN
    v_new_status := 'paid';
  ELSE
    IF v_due_date IS NOT NULL AND v_due_date < CURRENT_DATE THEN
      v_new_status := 'overdue';
    ELSE
      v_new_status := 'partial';
    END IF;
  END IF;
  
  UPDATE events
  SET total_paid = v_total_paid,
      remaining_balance = v_grand_total - v_total_paid,
      payment_status = v_new_status
  WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Recalculate payment status when payment inserted/updated
CREATE OR REPLACE FUNCTION trg_payments_recalc()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_event_payment_status(OLD.event_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_event_payment_status(NEW.event_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_after_change
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION trg_payments_recalc();

-- Function: Get current stock for an item
CREATE OR REPLACE FUNCTION get_current_stock(p_item_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_stock INTEGER;
BEGIN
  SELECT COALESCE(SUM(
    CASE 
      WHEN direction = 'in' THEN quantity
      WHEN direction = 'out' THEN -quantity
      WHEN direction = 'adjustment' THEN quantity  -- adjustment can be + or -, encoded by sign in extra field; here treat as set value, see notes
      ELSE 0
    END
  ), 0) INTO v_stock
  FROM stock_movements
  WHERE item_id = p_item_id;
  
  RETURN v_stock;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Get sinking fund balance
CREATE OR REPLACE FUNCTION get_sinking_fund_balance(p_fund_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  SELECT COALESCE(SUM(
    CASE 
      WHEN movement_type = 'deposit' THEN amount
      WHEN movement_type = 'withdrawal' THEN -amount
      ELSE 0
    END
  ), 0) INTO v_balance
  FROM sinking_fund_movements
  WHERE fund_id = p_fund_id;
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Get owner balance (earnings - withdrawals)
CREATE OR REPLACE FUNCTION get_owner_balance(p_owner_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM owner_earnings
  WHERE owner_user_id = p_owner_id;
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Get bank account balance from journal lines
CREATE OR REPLACE FUNCTION get_bank_balance(p_coa_code TEXT)
RETURNS BIGINT AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) INTO v_balance
  FROM journal_lines jl
  JOIN journal_entries je ON jl.entry_id = je.id
  WHERE jl.account_code = p_coa_code
    AND je.is_reversed = false;
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger: Generic audit log capture for important tables
CREATE OR REPLACE FUNCTION trg_audit_capture()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
  v_changes JSONB;
BEGIN
  -- Capture current user (set via app context)
  BEGIN
    v_actor := current_setting('app.current_user_id', true)::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;
  
  IF TG_OP = 'INSERT' THEN
    v_changes := jsonb_build_object('after', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    v_changes := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_changes := jsonb_build_object('before', to_jsonb(OLD));
  END IF;
  
  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, changes)
  VALUES (
    v_actor,
    LOWER(TG_OP),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_changes
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to financial tables
CREATE TRIGGER trg_audit_events 
  AFTER INSERT OR UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION trg_audit_capture();
CREATE TRIGGER trg_audit_payments 
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION trg_audit_capture();
CREATE TRIGGER trg_audit_settlements 
  AFTER INSERT OR UPDATE OR DELETE ON event_settlements
  FOR EACH ROW EXECUTE FUNCTION trg_audit_capture();
CREATE TRIGGER trg_audit_journal 
  AFTER INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION trg_audit_capture();
CREATE TRIGGER trg_audit_owner_earnings 
  AFTER INSERT OR UPDATE OR DELETE ON owner_earnings
  FOR EACH ROW EXECUTE FUNCTION trg_audit_capture();
CREATE TRIGGER trg_audit_users 
  AFTER UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION trg_audit_capture();

-- ============================================================================
-- SECTION 18: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_rekap ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sinking_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE sinking_fund_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper: is user owner-level (super_admin or owner)
CREATE OR REPLACE FUNCTION is_owner_level()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_user_role() IN ('super_admin', 'owner');
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_user_role() = 'super_admin';
END;
$$ LANGUAGE plpgsql STABLE;

-- USERS table policies
CREATE POLICY "users_read_own" ON users FOR SELECT
  USING (auth.uid() = id OR is_owner_level());
CREATE POLICY "users_super_admin_all" ON users FOR ALL
  USING (is_super_admin());
CREATE POLICY "users_update_own" ON users FOR UPDATE
  USING (auth.uid() = id);

-- SYSTEM_CONFIG: only super_admin
CREATE POLICY "system_config_super_admin" ON system_config FOR ALL
  USING (is_super_admin());
CREATE POLICY "system_config_read_owner" ON system_config FOR SELECT
  USING (is_owner_level());

-- MASTER DATA: read by all authenticated, write by owner-level
CREATE POLICY "master_data_read_all" ON packages FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "master_data_write_owner" ON packages FOR ALL
  USING (is_owner_level());

CREATE POLICY "addons_read_all" ON addons FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "addons_write_owner" ON addons FOR ALL
  USING (is_owner_level());

CREATE POLICY "bank_read_owner" ON bank_accounts FOR SELECT
  USING (is_owner_level());
CREATE POLICY "bank_write_super_admin" ON bank_accounts FOR ALL
  USING (is_super_admin());

CREATE POLICY "coa_read_owner" ON chart_of_accounts FOR SELECT
  USING (is_owner_level());
CREATE POLICY "coa_write_super_admin" ON chart_of_accounts FOR ALL
  USING (is_super_admin());

-- INVENTORY: read by owner+crew (crew needs to check stock), write by owner-level
CREATE POLICY "inventory_read_all" ON inventory_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "inventory_write_owner" ON inventory_items FOR ALL
  USING (is_owner_level());

CREATE POLICY "stock_movements_read_owner" ON stock_movements FOR SELECT
  USING (is_owner_level() OR performed_by = auth.uid());
CREATE POLICY "stock_movements_insert_all" ON stock_movements FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "equipment_movements_read" ON equipment_movements FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_movements_insert" ON equipment_movements FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "incidents_read" ON equipment_incidents FOR SELECT
  USING (is_owner_level() OR reported_by = auth.uid());
CREATE POLICY "incidents_write" ON equipment_incidents FOR ALL
  USING (is_owner_level() OR reported_by = auth.uid());

-- EVENTS: owner-level sees all, crew sees only assigned
CREATE POLICY "events_read_owner" ON events FOR SELECT
  USING (is_owner_level());
CREATE POLICY "events_read_crew_assigned" ON events FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM crew_assignments WHERE event_id = events.id
    )
  );
CREATE POLICY "events_write_owner" ON events FOR ALL
  USING (is_owner_level());

CREATE POLICY "event_addons_read" ON event_addons FOR SELECT
  USING (
    is_owner_level() OR
    auth.uid() IN (
      SELECT ca.user_id FROM crew_assignments ca WHERE ca.event_id = event_addons.event_id
    )
  );
CREATE POLICY "event_addons_write" ON event_addons FOR ALL
  USING (is_owner_level());

CREATE POLICY "crew_assignments_read" ON crew_assignments FOR SELECT
  USING (is_owner_level() OR user_id = auth.uid());
CREATE POLICY "crew_assignments_write" ON crew_assignments FOR ALL
  USING (is_owner_level());

CREATE POLICY "crew_rekap_read" ON crew_rekap FOR SELECT
  USING (
    is_owner_level() OR
    submitted_by = auth.uid() OR
    auth.uid() IN (
      SELECT user_id FROM crew_assignments WHERE event_id = crew_rekap.event_id
    )
  );
CREATE POLICY "crew_rekap_write_crew" ON crew_rekap FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM crew_assignments WHERE event_id = crew_rekap.event_id
    )
  );
CREATE POLICY "crew_rekap_update_owner" ON crew_rekap FOR UPDATE
  USING (is_owner_level() OR submitted_by = auth.uid());

-- PAYMENTS: owner-level only
CREATE POLICY "payments_owner" ON payments FOR ALL
  USING (is_owner_level());

-- JOURNAL: owner-level only
CREATE POLICY "journal_entries_owner" ON journal_entries FOR ALL
  USING (is_owner_level());
CREATE POLICY "journal_lines_owner" ON journal_lines FOR ALL
  USING (is_owner_level());

-- SETTLEMENTS: owner-level only
CREATE POLICY "settlements_owner" ON event_settlements FOR ALL
  USING (is_owner_level());

-- SINKING FUNDS: owner-level
CREATE POLICY "sinking_funds_read_owner" ON sinking_funds FOR SELECT
  USING (is_owner_level());
CREATE POLICY "sinking_funds_write_super_admin" ON sinking_funds FOR ALL
  USING (is_super_admin());
CREATE POLICY "sinking_movements_owner" ON sinking_fund_movements FOR ALL
  USING (is_owner_level());

-- OWNER EARNINGS: each owner sees only their own
CREATE POLICY "owner_earnings_self" ON owner_earnings FOR SELECT
  USING (owner_user_id = auth.uid() OR is_super_admin());
CREATE POLICY "owner_earnings_super_admin" ON owner_earnings FOR ALL
  USING (is_super_admin());

-- NOTIFICATIONS: each user sees only their own
CREATE POLICY "notifications_self" ON notifications FOR ALL
  USING (user_id = auth.uid());

-- AUDIT LOG: super_admin only
CREATE POLICY "audit_log_super_admin" ON audit_log FOR SELECT
  USING (is_super_admin());

-- NOTIFICATION RULES & WA TEMPLATES: read by owner-level, write by super_admin
CREATE POLICY "notification_rules_read" ON notification_rules FOR SELECT
  USING (is_owner_level());
CREATE POLICY "notification_rules_write" ON notification_rules FOR ALL
  USING (is_super_admin());

CREATE POLICY "wa_templates_read" ON whatsapp_templates FOR SELECT
  USING (is_owner_level());
CREATE POLICY "wa_templates_write" ON whatsapp_templates FOR ALL
  USING (is_super_admin());

-- ============================================================================
-- SECTION 19: SEED DATA
-- ============================================================================

-- 19.1 System Config defaults
INSERT INTO system_config (key, value, description, category) VALUES
  ('default_dp_amount', '500000', 'Default DP amount in IDR', 'financial'),
  ('gross_up_pph_rate', '1.75', 'PPh23 gross-up rate %', 'financial'),
  ('platform_fee_per_event', '35000', 'Platform/app fee allocation per event', 'financial'),
  ('owner_pool_per_event', '200000', 'Total owner pool per event (Rp 50k x 4 owners)', 'financial'),
  ('owner_pool_per_person', '50000', 'Per-owner share', 'financial'),
  ('owner_count', '4', 'Total owners receiving pool share', 'financial'),
  ('direct_commission_no_discount', '100000', 'Direct sales commission - no discount', 'commission'),
  ('direct_commission_low_discount', '50000', 'Direct sales commission - discount <= 10%', 'commission'),
  ('direct_commission_high_discount', '0', 'Direct sales commission - discount > 10%', 'commission'),
  ('vendor_commission_rate', '10', 'Default vendor commission %', 'commission'),
  ('relasi_commission_flat', '100000', 'Flat referrer commission for Relasi channel', 'commission'),
  ('crew_fee_senior', '200000', 'Senior crew fee per event', 'crew'),
  ('crew_fee_junior', '150000', 'Junior crew fee per event', 'crew'),
  ('payment_due_days_before_event', '3', 'Days before event when balance due', 'financial'),
  ('default_dp_minimum', '500000', 'Minimum DP for booking confirmation', 'financial'),
  ('timezone', '"Asia/Jakarta"', 'System timezone', 'system'),
  ('currency', '"IDR"', 'System currency', 'system'),
  ('date_format', '"DD/MM/YYYY"', 'Default date format', 'system'),
  ('default_language', '"id-ID"', 'Default language', 'system'),
  ('is_initialized', 'false', 'Set to true after onboarding wizard complete', 'system'),
  ('business_name', '"Tetra Photobooth"', 'Business name', 'profile'),
  ('business_tagline', '"Memorable photobooth experiences"', 'Business tagline', 'profile'),
  ('business_address', '"Bogor, Indonesia"', 'Business address', 'profile'),
  ('business_phone', '""', 'Contact phone', 'profile'),
  ('business_email', '""', 'Contact email', 'profile'),
  ('cash_low_threshold', '5000000', 'Trigger alert when operating cash below this', 'alerts'),
  ('outstanding_high_threshold', '20000000', 'Trigger alert when total outstanding above this', 'alerts');

-- 19.2 Chart of Accounts (simplified Indonesian COA)
INSERT INTO chart_of_accounts (code, name, account_type, parent_code, description) VALUES
  -- ASSETS (1-xxx)
  ('1-000', 'ASSETS', 'asset', NULL, 'All assets'),
  ('1-100', 'Kas Tunai', 'asset', '1-000', 'Cash on hand'),
  ('1-110', 'Bank BCA', 'asset', '1-000', 'BCA bank account'),
  ('1-111', 'Bank Mandiri', 'asset', '1-000', 'Mandiri bank account'),
  ('1-112', 'Bank BSI', 'asset', '1-000', 'BSI bank account'),
  ('1-200', 'Persediaan Media Set', 'asset', '1-000', 'Media set inventory'),
  ('1-201', 'Persediaan Sleeve', 'asset', '1-000', 'Sleeve inventory'),
  ('1-202', 'Persediaan Flashdisk', 'asset', '1-000', 'Flashdisk inventory'),
  ('1-203', 'Persediaan Pouch', 'asset', '1-000', 'Pouch inventory'),
  ('1-204', 'Persediaan Photomagnet', 'asset', '1-000', 'Photomagnet inventory'),
  ('1-205', 'Persediaan Keychain', 'asset', '1-000', 'Keychain inventory'),
  ('1-209', 'Persediaan Lainnya', 'asset', '1-000', 'Other consumables'),
  ('1-300', 'Piutang Klien', 'asset', '1-000', 'Accounts receivable'),
  ('1-400', 'Peralatan & Gear', 'asset', '1-000', 'Equipment'),
  ('1-401', 'Akumulasi Penyusutan', 'asset', '1-000', 'Accumulated depreciation (contra)'),
  
  -- LIABILITIES (2-xxx)
  ('2-000', 'LIABILITIES', 'liability', NULL, 'All liabilities'),
  ('2-100', 'Hutang Crew', 'liability', '2-000', 'Crew fees payable'),
  ('2-101', 'Hutang Vendor', 'liability', '2-000', 'Vendor commissions payable'),
  ('2-200', 'Sinking Fund - Equipment', 'liability', '2-000', 'Equipment fund reserved'),
  ('2-201', 'Sinking Fund - Maintenance', 'liability', '2-000', 'Maintenance fund reserved'),
  ('2-202', 'Sinking Fund - Crew Reserve', 'liability', '2-000', 'Crew reserve fund'),
  ('2-203', 'Sinking Fund - Emergency', 'liability', '2-000', 'Emergency fund reserved'),
  ('2-300', 'Hutang Bagi Hasil Owner', 'liability', '2-000', 'Owner profit share payable'),
  
  -- EQUITY (3-xxx)
  ('3-000', 'EQUITY', 'equity', NULL, 'All equity'),
  ('3-100', 'Modal Owner', 'equity', '3-000', 'Owner capital'),
  ('3-200', 'Laba Ditahan', 'equity', '3-000', 'Retained earnings'),
  
  -- REVENUE (4-xxx)
  ('4-000', 'REVENUE', 'revenue', NULL, 'All revenue'),
  ('4-100', 'Pendapatan Photobooth', 'revenue', '4-000', 'Photobooth service revenue'),
  ('4-110', 'Pendapatan Videobooth', 'revenue', '4-000', 'Videobooth service revenue'),
  ('4-120', 'Pendapatan Magazine Box', 'revenue', '4-000', 'Magazine box revenue'),
  ('4-130', 'Pendapatan Photo Stage', 'revenue', '4-000', 'Photo stage revenue'),
  ('4-140', 'Pendapatan Add-ons', 'revenue', '4-000', 'Add-ons revenue'),
  ('4-200', 'Diskon Penjualan', 'revenue', '4-000', 'Sales discounts (contra-revenue)'),
  
  -- EXPENSES (5-xxx)
  ('5-000', 'EXPENSES', 'expense', NULL, 'All expenses'),
  ('5-100', 'HPP Media Set', 'expense', '5-000', 'COGS - Media set'),
  ('5-101', 'HPP Sleeve', 'expense', '5-000', 'COGS - Sleeve'),
  ('5-102', 'HPP Flashdisk', 'expense', '5-000', 'COGS - Flashdisk'),
  ('5-103', 'HPP Pouch', 'expense', '5-000', 'COGS - Pouch'),
  ('5-104', 'HPP Photomagnet', 'expense', '5-000', 'COGS - Photomagnet'),
  ('5-105', 'HPP Keychain', 'expense', '5-000', 'COGS - Keychain'),
  ('5-109', 'HPP Lainnya', 'expense', '5-000', 'COGS - Other'),
  ('5-200', 'Beban Fee Crew', 'expense', '5-000', 'Crew fee expense'),
  ('5-210', 'Beban Transport BBM', 'expense', '5-000', 'Transport & fuel'),
  ('5-220', 'Beban Sewa Alat', 'expense', '5-000', 'Equipment rental'),
  ('5-230', 'Beban Perawatan Alat', 'expense', '5-000', 'Equipment maintenance'),
  ('5-240', 'Beban Konsumsi', 'expense', '5-000', 'F&B / consumption'),
  ('5-300', 'Beban Komisi Vendor', 'expense', '5-000', 'Vendor commission'),
  ('5-301', 'Beban Komisi Sales/Relasi', 'expense', '5-000', 'Sales/referrer commission'),
  ('5-400', 'Beban Platform/Aplikasi', 'expense', '5-000', 'App/platform fees'),
  ('5-500', 'Beban Penyusutan', 'expense', '5-000', 'Depreciation expense'),
  ('5-900', 'Beban Operasional Lain', 'expense', '5-000', 'Other operating expenses');

-- 19.3 Bank Accounts
INSERT INTO bank_accounts (account_name, bank_name, account_holder, coa_code, is_default_receive, is_active) VALUES
  ('Kas Tunai', 'Cash', 'Tetra Photobooth', '1-100', false, true),
  ('Bank BCA', 'BCA', 'Muhamad Ramadan Saputra', '1-110', true, true),
  ('Bank Mandiri', 'Mandiri', 'Muhamad Ramadan Saputra', '1-111', false, true),
  ('Bank BSI', 'BSI', 'Muhamad Ramadan Saputra', '1-112', false, true);

-- 19.4 Default Packages (from Tetra Pricelist 2026)
INSERT INTO packages (name, category, frame_size, duration_hours, base_price, description) VALUES
  -- Photobooth Classic 2R
  ('2R Unlimited 2 Jam', 'photobooth_classic', '2R', 2, 2000000, 'Photobooth classic dengan cetak 2R unlimited selama 2 jam'),
  ('2R Unlimited 3 Jam', 'photobooth_classic', '2R', 3, 2500000, 'Photobooth classic dengan cetak 2R unlimited selama 3 jam'),
  ('2R Unlimited 4 Jam', 'photobooth_classic', '2R', 4, 3000000, 'Photobooth classic dengan cetak 2R unlimited selama 4 jam'),
  ('2R Unlimited 5 Jam', 'photobooth_classic', '2R', 5, 3500000, 'Photobooth classic dengan cetak 2R unlimited selama 5 jam'),
  ('2R Unlimited 6 Jam', 'photobooth_classic', '2R', 6, 4000000, 'Photobooth classic dengan cetak 2R unlimited selama 6 jam'),
  ('2R Unlimited 8 Jam', 'photobooth_classic', '2R', 8, 5000000, 'Photobooth classic dengan cetak 2R unlimited selama 8 jam'),
  
  -- Photobooth Classic 4R
  ('4R Unlimited 2 Jam', 'photobooth_classic', '4R', 2, 2000000, 'Photobooth classic dengan cetak 4R unlimited selama 2 jam'),
  ('4R Unlimited 3 Jam', 'photobooth_classic', '4R', 3, 2500000, 'Photobooth classic dengan cetak 4R unlimited selama 3 jam'),
  ('4R Unlimited 4 Jam', 'photobooth_classic', '4R', 4, 3000000, 'Photobooth classic dengan cetak 4R unlimited selama 4 jam'),
  ('4R Unlimited 5 Jam', 'photobooth_classic', '4R', 5, 3500000, 'Photobooth classic dengan cetak 4R unlimited selama 5 jam'),
  ('4R Unlimited 6 Jam', 'photobooth_classic', '4R', 6, 4000000, 'Photobooth classic dengan cetak 4R unlimited selama 6 jam'),
  ('4R Unlimited 8 Jam', 'photobooth_classic', '4R', 8, 5000000, 'Photobooth classic dengan cetak 4R unlimited selama 8 jam'),
  
  -- Polaroid
  ('Polaroid Unlimited 2 Jam', 'photobooth_classic', 'polaroid', 2, 2000000, 'Photobooth Polaroid unlimited 2 jam'),
  ('Polaroid Unlimited 3 Jam', 'photobooth_classic', 'polaroid', 3, 2500000, 'Photobooth Polaroid unlimited 3 jam'),
  ('Polaroid Unlimited 4 Jam', 'photobooth_classic', 'polaroid', 4, 3000000, 'Photobooth Polaroid unlimited 4 jam'),
  ('Polaroid Unlimited 5 Jam', 'photobooth_classic', 'polaroid', 5, 3500000, 'Photobooth Polaroid unlimited 5 jam'),
  ('Polaroid Unlimited 6 Jam', 'photobooth_classic', 'polaroid', 6, 4000000, 'Photobooth Polaroid unlimited 6 jam'),
  ('Polaroid Unlimited 8 Jam', 'photobooth_classic', 'polaroid', 8, 5000000, 'Photobooth Polaroid unlimited 8 jam'),
  
  -- Videobooth 360
  ('Videobooth 360 - 2 Jam', 'videobooth_360', 'none', 2, 2500000, '360 Spin Videobooth 2 jam'),
  ('Videobooth 360 - 3 Jam', 'videobooth_360', 'none', 3, 3000000, '360 Spin Videobooth 3 jam'),
  ('Videobooth 360 - 4 Jam', 'videobooth_360', 'none', 4, 3500000, '360 Spin Videobooth 4 jam'),
  ('Videobooth 360 - 5 Jam', 'videobooth_360', 'none', 5, 4000000, '360 Spin Videobooth 5 jam'),
  ('Videobooth 360 - 6 Jam', 'videobooth_360', 'none', 6, 4500000, '360 Spin Videobooth 6 jam'),
  ('Videobooth 360 - 8 Jam', 'videobooth_360', 'none', 8, 5500000, '360 Spin Videobooth 8 jam'),
  
  -- Magazine Combo
  ('Magazine Box + Photobooth - 3 Jam', 'magazine_combo', '4R', 3, 5500000, 'Magazine Box installation plus Photobooth 3 jam'),
  ('Magazine Box + Photobooth - 5 Jam', 'magazine_combo', '4R', 5, 6000000, 'Magazine Box installation plus Photobooth 5 jam'),
  ('Magazine Box + Photobooth - 8 Jam', 'magazine_combo', '4R', 8, 7000000, 'Magazine Box installation plus Photobooth 8 jam'),
  
  -- Magazine Box Only
  ('Magazine Box Only - 8 Jam', 'magazine_box_only', 'none', 8, 2500000, 'Magazine Box installation only (no crew standby)'),
  
  -- Photo Stage Only
  ('Photo Stage Only - 2 Jam', 'photostage_only', 'none', 2, 1500000, 'Photo Stage 2 jam'),
  ('Photo Stage Only - 3 Jam', 'photostage_only', 'none', 3, 2000000, 'Photo Stage 3 jam'),
  
  -- Photo Stage Combo
  ('Photo Stage + Photobooth - 2 Jam', 'photostage_combo', '4R', 2, 4000000, 'Photo Stage plus Photobooth 2 jam'),
  ('Photo Stage + Photobooth - 3 Jam', 'photostage_combo', '4R', 3, 4500000, 'Photo Stage plus Photobooth 3 jam');

-- 19.5 Default Add-ons
INSERT INTO addons (name, unit, price, category, requires_extra_crew) VALUES
  ('Voucher Photobooth', '100 pcs', 25000, 'voucher', false),
  ('Guest Books Photo', '25 lembar', 200000, 'experience', false),
  ('Photomagnet', '50 cetak', 350000, 'print_extras', false),
  ('Break Time', '1 Jam', 150000, 'time_extras', false),
  ('Album Photostripe', '20 halaman', 100000, 'experience', false),
  ('Costume Sleeve', '1000 lembar', 1500000, 'costume', false),
  ('Keychain Photobooth Station', 'pcs', 10000, 'experience', true);

-- 19.6 Default Sinking Funds
INSERT INTO sinking_funds (code, name, description, allocation_type, allocation_value, target_balance, coa_account, display_order) VALUES
  ('equipment', 'Equipment Fund', 'Reserve untuk pembelian alat baru / upgrade', 'percentage', 5.00, 20000000, '2-200', 1),
  ('maintenance', 'Maintenance Fund', 'Reserve untuk service & perawatan alat', 'percentage', 3.00, 10000000, '2-201', 2),
  ('crew_reserve', 'Crew Reserve', 'Reserve untuk bonus crew / kebutuhan tim', 'flat', 100000, 5000000, '2-202', 3),
  ('emergency', 'Emergency Fund', 'Reserve dana darurat operasional', 'percentage', 2.00, 15000000, '2-203', 4);

-- 19.7 Default Notification Rules
INSERT INTO notification_rules (code, name, description, category, severity, trigger_condition, recipient_roles) VALUES
  ('h_minus_2_no_crew', 'Event H-2 belum ada crew', 'Alert when event 2 days away has no crew assigned', 'operational', 'alert',
    '{"days_before_event": 2, "check": "no_crew_assigned"}', ARRAY['super_admin', 'owner']),
  ('h_minus_1_no_design', 'Event H-1 belum ada desain', 'Alert when event 1 day away design not approved', 'operational', 'alert',
    '{"days_before_event": 1, "check": "design_not_approved"}', ARRAY['super_admin', 'owner']),
  ('h_minus_3_not_paid', 'Event H-3 belum lunas', 'Warn when event 3 days away balance not zero', 'financial', 'warning',
    '{"days_before_event": 3, "check": "not_fully_paid"}', ARRAY['super_admin', 'owner']),
  ('h_minus_7_no_dp', 'Event H-7 belum DP', 'Warn when event 7 days away no DP received', 'financial', 'warning',
    '{"days_before_event": 7, "check": "no_payment"}', ARRAY['super_admin', 'owner']),
  ('invoice_overdue_1d', 'Invoice overdue', 'Alert when invoice 1+ days past due date', 'financial', 'warning',
    '{"days_after_due": 1, "check": "still_unpaid"}', ARRAY['super_admin', 'owner']),
  ('invoice_overdue_7d', 'Invoice severely overdue', 'Critical when invoice 7+ days overdue', 'financial', 'alert',
    '{"days_after_due": 7, "check": "still_unpaid"}', ARRAY['super_admin', 'owner']),
  ('stock_critical', 'Stok kritis', 'Warn when consumable below min_stock_alert', 'inventory', 'warning',
    '{"check": "stock_below_min"}', ARRAY['super_admin', 'owner']),
  ('stock_zero', 'Stok habis', 'Alert when consumable at zero stock', 'inventory', 'alert',
    '{"check": "stock_zero"}', ARRAY['super_admin', 'owner']),
  ('crew_double_booked', 'Crew double-booked', 'Alert when crew assigned to overlapping events', 'operational', 'alert',
    '{"check": "crew_time_overlap"}', ARRAY['super_admin', 'owner']),
  ('loss_event', 'Event rugi', 'Flag completed events with negative profit', 'financial', 'warning',
    '{"check": "settlement_loss"}', ARRAY['super_admin', 'owner']),
  ('cash_low', 'Cash position rendah', 'Alert when operating cash below threshold', 'financial', 'warning',
    '{"check": "cash_below_threshold"}', ARRAY['super_admin', 'owner']),
  ('equipment_missing', 'Alat belum kembali', 'Equipment last seen at event, no check-in 24h after', 'inventory', 'warning',
    '{"hours_after_event": 24, "check": "equipment_at_event"}', ARRAY['super_admin', 'owner']),
  ('pending_user_24h', 'User pending approval', 'New user pending approval >24h', 'system', 'info',
    '{"hours_pending": 24}', ARRAY['super_admin']);

-- 19.8 Default WhatsApp Templates
INSERT INTO whatsapp_templates (code, name, description, template_body, available_variables, display_order) VALUES
  ('booking_confirmation', 'Konfirmasi Booking', 'Sent after DP received',
    'Halo {client_name}! Terima kasih sudah booking Tetra Photobooth untuk acara {event_date}. DP sebesar Rp {dp_amount} telah kami terima. Project ID: {project_id}. Detail: {package_name}, {duration_hours} jam, mulai {start_time}. Sisa pembayaran Rp {remaining_balance} mohon dilunasi maksimal H-3 ({due_date}). Salam, Tim Tetra.',
    ARRAY['client_name', 'event_date', 'dp_amount', 'project_id', 'package_name', 'duration_hours', 'start_time', 'remaining_balance', 'due_date'], 1),
  
  ('reminder_dp', 'Reminder DP (H-7 belum DP)', 'Sent 7 days before event if no DP',
    'Halo {client_name}, kami ingatkan untuk booking Tetra Photobooth tanggal {event_date}, DP belum kami terima. Mohon segera transfer DP sebesar Rp {dp_amount} ke BCA 0954965224 a.n. Muhamad Ramadan Saputra agar booking terkonfirmasi. Terima kasih!',
    ARRAY['client_name', 'event_date', 'dp_amount'], 2),
  
  ('reminder_pelunasan', 'Reminder Pelunasan (H-3)', 'Sent 3 days before event if not fully paid',
    'Halo {client_name}, mengingatkan acara {event_date} sudah dekat. Sisa pembayaran Rp {remaining_balance} mohon dilunasi paling lambat hari ini ke BCA 0954965224 a.n. Muhamad Ramadan Saputra. Project ID: {project_id}. Terima kasih!',
    ARRAY['client_name', 'event_date', 'remaining_balance', 'project_id'], 3),
  
  ('konfirmasi_h_minus_1', 'Konfirmasi H-1', 'Sent 1 day before event',
    'Halo {client_name}! Acara besok {event_date}, Tetra crew akan tiba untuk setup pukul {setup_time}, mulai cetak {start_time}. Lokasi: {venue_name}. Crew: {crew_lead} & {crew_asisten}. Mohon kabari kalau ada perubahan. Sampai bertemu besok!',
    ARRAY['client_name', 'event_date', 'setup_time', 'start_time', 'venue_name', 'crew_lead', 'crew_asisten'], 4),
  
  ('thank_you_post_event', 'Thank You + Settlement', 'Sent after event completed',
    'Halo {client_name}! Terima kasih sudah memilih Tetra Photobooth untuk acara {event_date}. Semua dokumentasi bisa diakses di link berikut: {drive_link}. Senang bisa jadi bagian dari momen spesial Anda. Salam hangat dari Tim Tetra!',
    ARRAY['client_name', 'event_date', 'drive_link'], 5),
  
  ('reminder_overdue', 'Reminder Overdue', 'Sent when invoice past due',
    'Halo {client_name}, ini adalah pengingat ke-{reminder_count} untuk pembayaran acara {event_date}. Sisa Rp {remaining_balance}. Mohon segera lunasi ke BCA 0954965224 a.n. Muhamad Ramadan Saputra. Hubungi kami jika ada kendala. Terima kasih.',
    ARRAY['client_name', 'event_date', 'reminder_count', 'remaining_balance'], 6);

-- ============================================================================
-- END OF SCHEMA PART 2
-- ============================================================================

-- After running both parts, the database is fully set up.
-- Next step: Configure Supabase Auth → Google OAuth provider in dashboard.
-- Then run the onboarding wizard via the application UI.
