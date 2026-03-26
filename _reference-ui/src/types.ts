export interface Vendor {
  id: number;
  name: string;
  contact: string;
  category: string;
}

export interface Product {
  id: number;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  variant: string;
  base_price: number;
  mrp: number;
  is_bundle: boolean;
}

export interface Purchase {
  id: number;
  purchase_number: string;
  date: string;
  vendor_id: number;
  vendor_name?: string;
  product_id: number;
  product_name?: string;
  category: string;
  subcategory: string;
  details: string;
  cost: number;
  net_price: number;
  payment_method: 'Cash' | 'Online';
}

export interface Sale {
  id: number;
  order_number: string;
  date: string;
  product_id: number;
  product_name?: string;
  category?: string;
  quantity: number;
  actual_price: number;
  selling_price: number;
  discount: number;
  customer_name: string;
  customer_contact?: string;
  customer_address?: string;
  channel: 'B2C' | 'B2B' | 'B2B2C';
  payment_method: 'Cash' | 'Online';
  event_name?: string;
  serial_number?: string;
}

export interface EventSale {
  id: number;
  event_name: string;
  date: string;
  product_id: number;
  product_name?: string;
  quantity: number;
  selling_price: number;
  payment_method: 'Cash' | 'Online';
  customer_name: string;
  customer_contact?: string;
  customer_address?: string;
  pushed_to_main: boolean;
}

export interface InventoryItem {
  product_id: number;
  name: string;
  category: string;
  subcategory: string;
  quantity: number;
  unit_cost: number;
}

export interface Event {
  id: number;
  name: string;
  created_at: string;
}

export interface DashboardData {
  revenue: number;
  cost: number;
  totalUniqueSales: number;
  inventoryValue: number;
  salesByCategory: { category: string; value: number }[];
  purchasesByCategory: { category: string; value: number }[];
  topProducts: { name: string; sales_count: number }[];
  cashFlow: { payment_method: string; total: number }[];
  monthlyData: { month: number; revenue: number; cost: number; profit: number }[];
}
