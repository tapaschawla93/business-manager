import * as XLSX from 'xlsx';
import { WORKBOOK_SHEETS } from './workbookSchema';

const IMPORT_HELP_AOA: string[][] = [
  ['Bulk import — how IDs work'],
  [''],
  ['First-time import (no backup):'],
  ['Put Products above Sales in the same file. For each sale line, set product_name to match Products.name. If the same name has multiple variants, also set Sales.variant to match Products.variant. UUID product_id is optional — use it when restoring from a backup export.'],
  [''],
  ['Sales sheet — column id:'],
  ['Use any unique label you choose per row (e.g. IMPORT-001). It is only for deduping this upload, not the database primary key.'],
  ['The real sale UUID is created when the sale is saved. You can leave id empty if date + product_id or product_name + phone/line are filled; the app builds a one-time key.'],
  [''],
  ['Sale Items sheet — column sale_id:'],
  ['Must be the existing sale UUID from the database (e.g. from a backup export), not ORD-… or IMPORT-… labels. Sale Items are not imported by bulk upload.'],
];

export function downloadTemplateWorkbook(): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of WORKBOOK_SHEETS) {
    const rows = [sheet.example];
    const ws = XLSX.utils.json_to_sheet(rows, { header: sheet.headers });
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  const helpWs = XLSX.utils.aoa_to_sheet(IMPORT_HELP_AOA);
  XLSX.utils.book_append_sheet(wb, helpWs, 'Import_help');
  XLSX.writeFile(wb, 'Business_Template.xlsx');
}
