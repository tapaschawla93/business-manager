import * as XLSX from 'xlsx';
import type { WorkbookSheetName } from './workbookSchema';

export type ParsedWorkbook = Record<WorkbookSheetName, Record<string, unknown>[]>;

export function parseWorkbook(file: File): Promise<ParsedWorkbook> {
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
