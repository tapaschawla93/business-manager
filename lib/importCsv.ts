export type CsvRow = Record<string, string>;

export type CsvParseResult = {
  headers: string[];
  rows: CsvRow[];
};

export type ImportIssue = {
  row: number;
  field: string;
  message: string;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.map((v) => v.replace(/^"|"$/g, '').trim());
}

export function parseCsv(text: string): CsvParseResult {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const row: CsvRow = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = cols[c] ?? '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

export function getString(row: CsvRow, key: string): string {
  return (row[key] ?? '').trim();
}

export function getNullableString(row: CsvRow, key: string): string | null {
  const v = getString(row, key);
  return v === '' ? null : v;
}

export function getOptionalNumber(row: CsvRow, key: string): number | null {
  const raw = getString(row, key);
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function getRequiredNumber(row: CsvRow, key: string): number | null {
  const n = Number(getString(row, key));
  return Number.isFinite(n) ? n : null;
}

export function buildImportIssuesCsv(issues: ImportIssue[]): string {
  const header = 'row,field,message';
  const lines = issues.map((i) => `${i.row},${escapeCell(i.field)},${escapeCell(i.message)}`);
  return [header, ...lines].join('\r\n');
}

function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Accepts common CSV date formats and returns YYYY-MM-DD for Postgres date.
 * Supported:
 * - YYYY-MM-DD
 * - YYYY/MM/DD
 * - DD-MM-YYYY
 * - DD/MM/YYYY
 * - ISO datetime (uses the date portion)
 */
export function normalizeDateYmd(input: string): string | null {
  const raw = input.trim();
  if (raw === '') return null;

  // ISO datetime: take first 10 chars if they look like YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const partsDash = raw.split('-');
  const partsSlash = raw.split('/');
  const parts = partsDash.length === 3 ? partsDash : partsSlash.length === 3 ? partsSlash : null;
  if (!parts) return null;

  const [a, b, c] = parts.map((x) => x.trim());
  if (!a || !b || !c) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}$/.test(a)) {
    const y = Number(a);
    const m = Number(b);
    const d = Number(c);
    if (!isValidYmd(y, m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{4}$/.test(c)) {
    const d = Number(a);
    const m = Number(b);
    const y = Number(c);
    if (!isValidYmd(y, m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  return null;
}

/**
 * Accepts flexible date input and returns ISO string for timestamptz.
 * If only a date is provided, it is interpreted as local midnight.
 */
export function normalizeDateTimeIso(input: string): string | null {
  const raw = input.trim();
  if (raw === '') return null;
  const ymd = normalizeDateYmd(raw);
  if (ymd) {
    const d = new Date(`${ymd}T00:00:00`);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

