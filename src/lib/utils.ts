export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'partial':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'unpaid':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

/** Per-customer-type grace period (days) before a balance counts as overdue. */
export const OVERDUE_DEFAULTS: Record<string, number> = {
  'walk-in': 30,
  'regular': 45,
  'contractor': 45,
  'wholesale': 30,
  'corporate': 45,
};

/** Minimal shape needed to judge whether a customer's balance is overdue. */
export interface OverdueCandidate {
  customer_type?: string;
  custom_overdue_days?: number | null;
  oldest_unpaid_date?: string | null;
}

export interface OverdueStatus {
  isOverdue: boolean;
  /** Days past due when overdue, otherwise days still remaining. */
  days: number;
  label: string;
}

/**
 * Shared overdue judgement used by the dashboard, customer list and customer
 * detail header. A custom per-customer override always wins over the
 * customer-type default.
 */
export function getOverdueStatus(customer: OverdueCandidate): OverdueStatus | null {
  if (!customer.oldest_unpaid_date) return null;

  const daysSince = Math.floor(
    (Date.now() - new Date(customer.oldest_unpaid_date).getTime()) / (1000 * 60 * 60 * 24),
  );
  const threshold =
    customer.custom_overdue_days ??
    OVERDUE_DEFAULTS[customer.customer_type ?? 'walk-in'] ??
    30;

  if (daysSince > threshold) {
    return { isOverdue: true, days: daysSince - threshold, label: `Overdue — ${daysSince} days` };
  }

  const daysRemaining = threshold - daysSince;
  if (daysRemaining <= 7) {
    return { isOverdue: false, days: daysRemaining, label: `Due in ${daysRemaining} days` };
  }

  return null;
}

/**
 * Severity ramp for outstanding balances so red is reserved for real risk:
 * neutral while inside the credit period, amber when due soon, red when
 * overdue. Pass `null` for a balance with no due date information.
 */
export function getBalanceTone(status: OverdueStatus | null, balance: number): string {
  if (balance <= 0) return 'text-emerald-600 dark:text-emerald-400';
  if (!status) return 'text-gray-900 dark:text-gray-100';
  return status.isOverdue
    ? 'text-red-600 dark:text-red-400'
    : 'text-amber-600 dark:text-amber-400';
}

export function getCustomerTypeColor(type: string): string {
  return type === 'regular'
    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
}

export const debugLog = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

export const debugError = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.error(...args);
  }
};

export function isSessionExpired(): boolean {
  const token = localStorage.getItem('ksmn_token');
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
