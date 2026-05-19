# RLS_DIAGNOSTIC.md — Pre-fix Diagnostic

**Tanggal**: 2026-05-19
**Bug**: `new row violates row-level security policy for table "crew_rekap"`
**Trigger**: Owner login → buka event `PRJ-20260509-41226` (awaiting_settlement, crew belum submit) → klik input rekap retroaktif → klik Submit
**Source**: User report + screenshot dari production https://tetra-ops.vercel.app/operations/PRJ-20260509-41226/rekap

## §1. Current RLS policies di `crew_rekap`

Found di [docs/05_DATABASE_SCHEMA.sql lines 1382-1397](docs/05_DATABASE_SCHEMA.sql#L1382-L1397):

```sql
-- ✅ SELECT — owner OK
CREATE POLICY "crew_rekap_read" ON crew_rekap FOR SELECT
  USING (
    is_owner_level() OR
    submitted_by = auth.uid() OR
    auth.uid() IN (
      SELECT user_id FROM crew_assignments WHERE event_id = crew_rekap.event_id
    )
  );

-- ❌ INSERT — owner BLOCKED (this is the bug)
CREATE POLICY "crew_rekap_write_crew" ON crew_rekap FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM crew_assignments WHERE event_id = crew_rekap.event_id
    )
  );

-- ✅ UPDATE — owner OK (but no lock check)
CREATE POLICY "crew_rekap_update_owner" ON crew_rekap FOR UPDATE
  USING (is_owner_level() OR submitted_by = auth.uid());

-- ⚠️ DELETE — no explicit policy
```

## §2. Identification of blocking policy

**Blocking policy**: `crew_rekap_write_crew` (FOR INSERT)

```sql
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM crew_assignments WHERE event_id = crew_rekap.event_id
  )
);
```

**Analisis**:
- Policy ini hanya allow user yang ada di `crew_assignments` untuk event tersebut
- `is_owner_level()` (returns true untuk role IN ('super_admin', 'owner')) **tidak di-check** sama sekali di INSERT
- Owner adalah role manajemen, **tidak** di-assign sebagai crew di `crew_assignments` untuk event spesifik
- Saat owner submit rekap retroaktif → `auth.uid()` (owner UUID) tidak match `crew_assignments.user_id` → INSERT denied → PostgreSQL throws `new row violates row-level security policy`

Inkonsistensi yang jelas: SELECT & UPDATE policy keduanya include `is_owner_level()` OR clause, tapi INSERT tidak. Itulah celah-nya.

## §3. Related tables — sudah benar dari pass 1 migration

`event_recap_proofs` ([migration 20260520_rls_new_tables.sql lines 31-41](supabase/migrations/20260520_rls_new_tables.sql#L31-L41)):

```sql
CREATE POLICY "event_recap_proofs_write_crew" ON event_recap_proofs
  FOR INSERT
  WITH CHECK (
    is_owner_level()   -- ✅ includes owner
    OR EXISTS (
      SELECT 1 FROM crew_assignments ca
      JOIN crew_rekap cr ON cr.id = event_recap_proofs.recap_id
      WHERE ca.event_id = cr.event_id AND ca.user_id = auth.uid()
    )
  );
```

`event_recap_misc_expenses` (lines 72-81 same pattern): ✅ already OK.

`frame_size_mapping`, `package_items_mapping`: config tables, owner-level write. ✅ OK.

**Conclusion**: hanya `crew_rekap_write_crew` di base schema yang perlu di-fix. Tabel baru dari pass 1 migration sudah benar dari awal.

## §4. User role mechanism (verified)

From base schema docs/05_DATABASE_SCHEMA.sql lines 167-193:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'pending_approval',
  is_active BOOLEAN NOT NULL DEFAULT true,
  ...
);
```

User role enum (lines 33-39):
```sql
CREATE TYPE user_role AS ENUM (
  'super_admin',
  'owner',
  'crew',
  'pending_approval'
);
```

Helper RLS function (lines 1273-1290):
```sql
CREATE OR REPLACE FUNCTION current_user_role() RETURNS user_role AS $$
DECLARE v_role user_role;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_owner_level() RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_user_role() IN ('super_admin', 'owner');
END;
$$ LANGUAGE plpgsql STABLE;
```

**Note minor**: `current_user_role()` tidak check `is_active=true`. Deactivated user dengan session masih bisa pass `is_owner_level()`. Edge case low priority — di luar scope fix ini.

## §5. Recommended fix

### Approach: Drop + recreate INSERT policy dengan owner support + add UPDATE lock guard + add DELETE policy

```sql
DROP POLICY IF EXISTS "crew_rekap_write_crew" ON crew_rekap;
DROP POLICY IF EXISTS "crew_rekap_update_owner" ON crew_rekap;

-- New INSERT: owner-level OR assigned crew
CREATE POLICY "crew_rekap_insert" ON crew_rekap FOR INSERT
  WITH CHECK (
    is_owner_level()
    OR auth.uid() IN (
      SELECT user_id FROM crew_assignments WHERE event_id = crew_rekap.event_id
    )
  );

-- New UPDATE: owner OR submitter, PLUS lock guard
CREATE POLICY "crew_rekap_update" ON crew_rekap FOR UPDATE
  USING (
    (is_owner_level() OR submitted_by = auth.uid())
    AND COALESCE(locked, false) = false  -- prevent edit when settled+locked
  );

-- New DELETE: owner only
CREATE POLICY "crew_rekap_delete" ON crew_rekap FOR DELETE
  USING (
    is_owner_level()
    AND COALESCE(locked, false) = false
  );
```

### Why lock guard di UPDATE?

User edge case spec:
> 3. **Settled event**: NO ONE can edit (even owner), kecuali via reopen_settlement first

Saat event di-settle, `crew_rekap.locked = true` (di-set oleh `settle_event` RPC). Setelah ini:
- App code di [crew-fees.ts:118-122](src/lib/actions/crew-fees.ts#L118-L122) sudah check & block — ✅
- Tapi RLS-level tidak enforce — bisa di-bypass via direct DB write

Lock guard di RLS = defense-in-depth.

### Why doesn't this break `settle_event` / `reopen_settlement` RPC?

Function dengan `SECURITY DEFINER` (semua RPC kita) **bypass RLS** karena run sebagai postgres role. UPDATE locked column dari false→true atau true→false via RPC tetap jalan.

## §6. Authorization matrix expectations (post-fix)

| Actor | Action | Event Status | Crew Assigned? | Expected |
|---|---|---|---|---|
| Owner | INSERT crew_rekap | awaiting_settlement | No | ✅ ALLOWED (was BLOCKED ❌) |
| Owner | UPDATE crew_rekap (locked=false) | any | any | ✅ ALLOWED |
| Owner | UPDATE crew_rekap (locked=true) | completed | any | ❌ BLOCKED (was ALLOWED ⚠️) |
| Super_admin | INSERT crew_rekap | awaiting_settlement | No | ✅ ALLOWED |
| Crew | INSERT crew_rekap | awaiting_settlement | Yes | ✅ ALLOWED (preserved) |
| Crew | INSERT crew_rekap | awaiting_settlement | No | ❌ BLOCKED (preserved) |
| Crew | UPDATE crew_rekap (own, locked=false) | awaiting_settlement | Yes | ✅ ALLOWED |
| Crew | UPDATE crew_rekap (locked=true) | completed | any | ❌ BLOCKED (was ALLOWED ⚠️) |
| settle_event RPC | UPDATE locked=true | settling | any | ✅ ALLOWED (SECURITY DEFINER bypasses RLS) |
| reopen_settlement RPC | UPDATE locked=false | settled | any | ✅ ALLOWED (SECURITY DEFINER) |

## §7. Backward compatibility

✅ **Backward compatible** — kami menambah path (`is_owner_level()`) ke INSERT, tidak menghapus path crew yang sudah ada. Existing crew users tetap bisa submit rekap untuk event yang mereka assigned, persis seperti sebelum-nya.

⚠️ **Behavior change pada UPDATE**: setelah event settled (`locked=true`), bahkan owner tidak bisa direct-update lagi. Harus via `reopen_settlement` RPC dulu. Ini sesuai spec edge case #3 user.

## §8. Migration file plan

File: `supabase/migrations/20260521_fix_crew_rekap_rls.sql`

Idempotent (DROP IF EXISTS + CREATE) → re-runnable kalau perlu.

Atomic: 1 file, semua DROP+CREATE dalam 1 apply.
