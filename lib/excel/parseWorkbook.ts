import * as XLSX from 'xlsx';
import type { WorkbookSheetName } from './workbookSchema';

export type ParsedWorkbook = Record<WorkbookSheetName, Record<string, unknown>[]>;

/** Guard against huge files freezing the tab or running out of memory during `readAsArrayBuffer` / `XLSX.read`. */
export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;

export function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  if (file.size > MAX_WORKBOOK_BYTES) {
    const mb = MAX_WORKBOOK_BYTES / (1024 * 1024);
    return Promise.reject(new Error(`Workbook is too large (max ${mb} MB). Choose a smaller file or split the data.`));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read workbook.'));
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array' });
        const getRows = (name: WorkbookSheetName): Record<string, unknown>[] => {
          const ws = wb.Sheets[name];
          if (!ws) return [];
          return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        };
        resolve({
          Products: getRows('Products'),
          Sales: getRows('Sales'),
          'Sale Items': getRows('Sale Items'),
          Expenses: getRows('Expenses'),
          Inventory: getRows('Inventory'),
          Vendors: getRows('Vendors'),
          Customers: getRows('Customers'),
        });
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Invalid workbook.'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
