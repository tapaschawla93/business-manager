import { describe, expect, it } from 'vitest';
import { MAX_WORKBOOK_BYTES, parseWorkbook } from '@/lib/excel/parseWorkbook';

describe('parseWorkbook', () => {
  it('rejects files larger than MAX_WORKBOOK_BYTES before reading', async () => {
    const file = new File([new Uint8Array(1)], 'huge.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    Object.defineProperty(file, 'size', { value: MAX_WORKBOOK_BYTES + 1 });

    await expect(parseWorkbook(file)).rejects.toThrow(/too large/i);
  });
});
