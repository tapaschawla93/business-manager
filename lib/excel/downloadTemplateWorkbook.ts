import * as XLSX from 'xlsx';
import { WORKBOOK_SHEETS } from './workbookSchema';

export function downloadTemplateWorkbook(): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of WORKBOOK_SHEETS) {
    const rows = [sheet.example];
    const ws = XLSX.utils.json_to_sheet(rows, { header: sheet.headers });
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, 'Business_Template.xlsx');
}
