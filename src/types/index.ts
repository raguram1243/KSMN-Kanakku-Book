export interface Staff {
  id: string;
  name: string;
  role: 'admin' | 'staff';
  active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  address?: string;
  customer_type: 'walk-in' | 'regular' | 'contractor' | 'wholesale' | 'corporate';
  notes?: string;
  last_entry_seq: number;
  created_by: string;
  created_at: string;
  balance?: number;
  advance_balance?: number;
  custom_overdue_days?: number | null;
  oldest_unpaid_date?: string | null;
}

export interface CreditEntry {
  id: string;
  entry_code: string;
  customer_id: string;
  entry_mode: 'detailed' | 'quick';
  description?: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: 'unpaid' | 'partial' | 'paid';
  photo_url?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  staff_name?: string;
  staff_role?: string;
}

export interface CreditEntryItem {
  id: string;
  credit_entry_id: string;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface Payment {
  id: string;
  customer_id: string;
  amount: number;
  payment_date: string;
  payment_method?: 'cash' | 'upi' | 'bank_transfer' | 'card' | 'others';
  receipt_number?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  staff_name?: string;
  attachments?: any[];
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  credit_entry_id: string;
  allocated_amount: number;
}

export interface AppSettings {
  key: string;
  value: string;
}

export interface JWTPayload {
  staff_id: string;
  role: 'admin' | 'staff';
  exp: number;
}