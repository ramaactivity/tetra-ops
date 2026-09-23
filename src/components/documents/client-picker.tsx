"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { type ClientSuggestion, searchClients } from "@/lib/actions/documents";

/**
 * Cari klien dari kontak, kontak bot WA, dan klien dokumen sebelumnya —
 * memilih satu mengisi nama/instansi/WA/email/alamat sekaligus. Tetap bisa
 * mengetik nama baru: nilai bebas jadi nama klien.
 */
export function ClientPicker({
	name,
	onPick,
	onNameChange,
}: {
	name: string;
	onPick: (c: ClientSuggestion) => void;
	onNameChange: (name: string) => void;
}) {
	const [results, setResults] = useState<ClientSuggestion[]>([]);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastQuery = useRef("");

	useEffect(() => {
		const q = name.trim();
		if (q.length < 2 || q === lastQuery.current) return;
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(async () => {
			lastQuery.current = q;
			try {
				setResults(await searchClients(q));
			} catch {
				setResults([]);
			}
		}, 250);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [name]);

	const options: ComboboxOption[] = results.map((r, i) => ({
		value: `__pick_${i}`,
		label: r.org ? `${r.name} · ${r.org}` : r.name,
		sublabel: [r.phone, r.source].filter(Boolean).join(" · "),
	}));

	return (
		<div className="relative">
			<Combobox
				value={name}
				onValueChange={(v) => {
					const m = /^__pick_(\d+)$/.exec(v);
					if (m) {
						const picked = results[Number(m[1])];
						if (picked) onPick(picked);
						return;
					}
					onNameChange(v);
				}}
				options={options}
				placeholder="Ketik nama klien / instansi…"
				emptyMessage="Belum ada yang cocok — nama baru tetap bisa dipakai"
				aria-label="Nama klien"
			/>
			<Search className="pointer-events-none absolute right-9 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
		</div>
	);
}
