export type WorkbookSheetName =
  | 'Products'
  | 'Sales'
  | 'Sale Items'
  | 'Expenses'
  | 'Inventory'
  | 'Vendors'
  | 'Customers';

export const WORKBOOK_SHEETS: ReadonlyArray<{
  name: WorkbookSheetName;
  headers: string[];
  example: Record<string, string | number | null>;
}> = [
  {
    name: 'Products',
    headers: ['name', 'category', 'mrp', 'cost_price', 'variant'],
    example: { name: 'Sample Product', category: 'GENERAL', mrp: 1000, cost_price: 700, variant: '' },
  },
  {
    name: 'Sales',
    headers: [
      'id',
      'date',
      'customer_name',
      'customer_phone',
      'customer_address',
      'sale_type',
      'payment_mode',
      'notes',
      'sale_tag_id',
      'product_id',
      'product_name',
      'quantity',
      'sale_price',
    ],
    example: {
      id: 'IMPORT-001',
      date: '2026-04-01',
      customer_name: 'John',
      customer_phone: '9876543210',
      customer_address: '',
      sale_type: 'B2C',
      payment_mode: 'cash',
      notes: '',
      sale_tag_id: '<uuid-or-leave-empty-for-default>',
      product_id: '',
      product_name: 'Sample Product',
      quantity: 2,
      sale_price: 900,
    },
  },
  {
    name: 'Sale Items',
    headers: ['sale_id', 'product_id', 'quantity', 'sale_price'],
    example: { sale_id: '<uuid>', product_id: '<uuid>', quantity: 1, sale_price: 900 },
  },
  {
    name: 'Expenses',
    headers: [
      'date',
      'vendor_name',
      'item_description',
      'quantity',
      'unit_cost',
      'total_amount',
      'payment_mode',
      'expense_tag_id',
    ],
    example: {
      date: '2026-04-01',
      vendor_name: 'ABC Traders',
      item_description: 'Packaging',
      quantity: 10,
      unit_cost: 25,
      total_amount: 250,
      payment_mode: 'cash',
      expense_tag_id: '<uuid-or-empty-for-default>',
    },
  },
  {
    name: 'Inventory',
    headers: ['name', 'unit', 'current_stock', 'unit_cost', 'reorder_level'],
    example: { name: 'Grow bags', unit: 'pcs', current_stock: 120, unit_cost: 12, reorder_level: 20 },
  },
  {
    name: 'Vendors',
    headers: ['name', 'contact_person', 'phone', 'address', 'notes', 'email'],
    example: { name: 'Acme Supplies', contact_person: 'R. Kumar', phone: '9876543210', address: 'Mumbai', notes: '', email: '' },
  },
  {
    name: 'Customers',
    headers: ['name', 'phone', 'address'],
    example: { name: 'John', phone: '9876543210', address: 'Delhi' },
  },
];
