export type TargetField = {
	key: string;
	label: string;
	required?: boolean;
	description?: string;
	example?: string;
};

export type ImportStat = {
	label: string;
	value: number;
	tone?: "muted" | "primary" | "emerald" | "amber" | "rose";
};

export type ImportResultRow = {
	row: number;
	primaryKey?: string | null;
	label?: string | null;
	status: string;
	category?: string;
	message?: string;
	warnings?: string[];
};

export type ImportResult = {
	totalRows: number;
	stats: ImportStat[];
	rows: ImportResultRow[];
};

export type DuplicateStrategy = "skip" | "update";

export type WizardConfig = {
	title: string;
	description: string;
	primaryKeyField: string;
	primaryKeyLabel: string;
	duplicateStrategy: DuplicateStrategy;
	targetFields: TargetField[];
	headerAliases: Record<string, string>;
	checkDuplicates: (primaryKeys: string[]) => Promise<string[]>;
	commit: (rows: Record<string, string>[]) => Promise<ImportResult>;
	backHref?: string;
	backLabel?: string;
	sampleCsv?: string;
};
