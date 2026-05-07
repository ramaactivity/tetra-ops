"use client";

import { FileUpIcon, XIcon } from "lucide-react";
import {
	type ChangeEvent,
	type DragEvent,
	useCallback,
	useId,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * <FileDrop /> — drag-drop file input. Replaces raw <input type="file">.
 *
 * Single-file mode by default. Pass `multiple` to accept multiple files
 * (returns File[] in onChange).
 *
 * Usage:
 *   <FileDrop
 *     accept=".csv"
 *     onFileChange={(file) => parseCsv(file)}
 *     hint="CSV up to 10 MB"
 *   />
 *
 * The component is uncontrolled by default (caller receives the File via
 * onFileChange). Pass `value` + clear via your own state if you need
 * controlled clearing from outside.
 */

interface FileDropBaseProps {
	accept?: string;
	disabled?: boolean;
	hint?: string;
	className?: string;
	id?: string;
	name?: string;
	maxSizeBytes?: number;
	required?: boolean;
}

interface SingleFileDropProps extends FileDropBaseProps {
	multiple?: false;
	onFileChange?: (file: File | null) => void;
}

interface MultiFileDropProps extends FileDropBaseProps {
	multiple: true;
	onFileChange?: (files: File[]) => void;
}

export type FileDropProps = SingleFileDropProps | MultiFileDropProps;

export function FileDrop(props: FileDropProps) {
	const {
		accept,
		disabled,
		hint,
		className,
		id: idProp,
		name,
		maxSizeBytes,
		required,
	} = props;
	const generatedId = useId();
	const id = idProp ?? generatedId;
	const inputRef = useRef<HTMLInputElement>(null);
	const [files, setFiles] = useState<File[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleFiles = useCallback(
		(incoming: FileList | null) => {
			setError(null);
			if (!incoming || incoming.length === 0) {
				setFiles([]);
				if (props.multiple) {
					props.onFileChange?.([]);
				} else {
					props.onFileChange?.(null);
				}
				return;
			}

			const list = Array.from(incoming);

			// Size cap
			if (maxSizeBytes) {
				const tooBig = list.find((f) => f.size > maxSizeBytes);
				if (tooBig) {
					setError(
						`File "${tooBig.name}" melebihi batas ${formatBytes(maxSizeBytes)}.`,
					);
					return;
				}
			}

			// Accept filter (extension match)
			if (accept) {
				const allowed = accept
					.split(",")
					.map((s) => s.trim().toLowerCase())
					.filter(Boolean);
				const reject = list.find((f) => !matchesAccept(f, allowed));
				if (reject) {
					setError(`Format "${reject.name}" tidak didukung.`);
					return;
				}
			}

			setFiles(list);
			if (props.multiple) {
				props.onFileChange?.(list);
			} else {
				props.onFileChange?.(list[0] ?? null);
			}
		},
		[accept, maxSizeBytes, props],
	);

	function onChange(e: ChangeEvent<HTMLInputElement>) {
		handleFiles(e.target.files);
	}

	function onDrop(e: DragEvent<HTMLLabelElement>) {
		e.preventDefault();
		setIsDragging(false);
		if (disabled) return;
		handleFiles(e.dataTransfer.files);
	}

	function onDragOver(e: DragEvent<HTMLLabelElement>) {
		e.preventDefault();
		if (disabled) return;
		setIsDragging(true);
	}

	function onDragLeave() {
		setIsDragging(false);
	}

	function clearFiles(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (inputRef.current) inputRef.current.value = "";
		setFiles([]);
		setError(null);
		if (props.multiple) {
			props.onFileChange?.([]);
		} else {
			props.onFileChange?.(null);
		}
	}

	const hasFiles = files.length > 0;

	return (
		<div className={cn("flex w-full flex-col gap-2", className)}>
			<label
				htmlFor={id}
				onDrop={onDrop}
				onDragOver={onDragOver}
				onDragLeave={onDragLeave}
				className={cn(
					"relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-surface-2 px-4 py-6 text-center transition-colors",
					"hover:bg-surface-3 focus-visible:bg-surface-3",
					isDragging
						? "border-primary bg-primary/5"
						: "border-border-default",
					disabled && "pointer-events-none opacity-60",
					hasFiles && "border-solid border-border-strong",
				)}
			>
				<input
					ref={inputRef}
					id={id}
					name={name}
					type="file"
					accept={accept}
					multiple={props.multiple}
					required={required}
					disabled={disabled}
					onChange={onChange}
					className="sr-only"
				/>

				{hasFiles ? (
					<div className="flex w-full flex-col items-center gap-2">
						<div className="flex items-center gap-2 text-sm font-medium text-foreground">
							<FileUpIcon className="size-4" aria-hidden />
							{files.length === 1
								? files[0].name
								: `${files.length} file dipilih`}
						</div>
						<div className="text-xs text-muted-foreground">
							{files
								.slice(0, 3)
								.map((f) => `${f.name} (${formatBytes(f.size)})`)
								.join(", ")}
							{files.length > 3 ? `, +${files.length - 3} lagi` : ""}
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={clearFiles}
							className="mt-1"
						>
							<XIcon /> Ganti file
						</Button>
					</div>
				) : (
					<>
						<div className="grid size-10 place-items-center rounded-full bg-surface-3 text-muted-foreground">
							<FileUpIcon className="size-5" aria-hidden />
						</div>
						<div className="flex flex-col gap-0.5">
							<p className="text-sm font-medium text-foreground">
								{isDragging
									? "Lepaskan untuk upload"
									: "Drag-drop file ke sini, atau klik untuk pilih"}
							</p>
							{hint ? (
								<p className="text-xs text-muted-foreground">{hint}</p>
							) : null}
						</div>
					</>
				)}
			</label>
			{error ? (
				<p className="text-xs text-destructive" role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function matchesAccept(file: File, allowed: string[]): boolean {
	const name = file.name.toLowerCase();
	const type = file.type.toLowerCase();
	for (const pattern of allowed) {
		if (pattern.startsWith(".")) {
			if (name.endsWith(pattern)) return true;
		} else if (pattern.endsWith("/*")) {
			const prefix = pattern.slice(0, -1);
			if (type.startsWith(prefix)) return true;
		} else if (type === pattern) {
			return true;
		}
	}
	return false;
}
