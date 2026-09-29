-- 20260929d_vendor_pics.sql
-- Satu vendor bisa punya beberapa PIC/sales (Partner Organizer: Nisa, Firda).
-- Daftar tetap di master vendor, diisi otomatis setiap booking disimpan
-- (ensureVendorContact). Form booking menawarkannya sebagai pilihan. Idempotent.
ALTER TABLE contacts
	ADD COLUMN IF NOT EXISTS vendor_pics jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN contacts.vendor_pics IS
	'Vendor saja: [{name, contact}] semua PIC yang pernah dipakai, diisi otomatis dari booking.';

-- Isi awal dari PIC default + riwayat event (nama unik, terbaru dulu).
UPDATE contacts c SET vendor_pics = sub.pics
FROM (
	SELECT c2.id, COALESCE(jsonb_agg(jsonb_build_object('name', p.name, 'contact', p.contact)
		ORDER BY p.last DESC), '[]'::jsonb) AS pics
	FROM contacts c2
	JOIN LATERAL (
		SELECT DISTINCT ON (lower(trim(x.name))) trim(x.name) AS name, x.contact, x.last
		FROM (
			SELECT c2.default_pic_name AS name, c2.default_pic_contact AS contact, 'infinity'::date AS last
			UNION ALL
			SELECT e.vendor_pic_name, e.vendor_contact, e.event_date
			FROM events e
			WHERE e.channel = 'vendor'
				AND (e.vendor_contact_id = c2.id OR lower(trim(e.vendor_name)) = lower(trim(c2.name)))
		) x
		WHERE x.name IS NOT NULL AND trim(x.name) <> ''
		ORDER BY lower(trim(x.name)), x.last DESC
	) p ON true
	WHERE c2.type = 'vendor'
	GROUP BY c2.id
) sub
WHERE c.id = sub.id AND c.vendor_pics = '[]'::jsonb;
