export type Customer = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerListRow = {
  id: string;
  customerId: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string | null;
  /** When present, order history loads via these sale IDs (accurate after phone-normalized merge). */
  aggregatedSaleIds?: string[];
};

export type CustomerOrderHistoryRow = {
  saleId: string;
  date: string;
  amount: number;
  paymentMode: 'cash' | 'online';
  customerName: string | null;
  notes: string | null;
};
