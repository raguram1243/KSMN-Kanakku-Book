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
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    case 'partial':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
    case 'unpaid':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
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
