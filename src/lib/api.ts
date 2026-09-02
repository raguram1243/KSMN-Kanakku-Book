import { isSessionExpired } from './utils';

const API_BASE = import.meta.env.VITE_SUPABASE_URL as string

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('ksmn_token')
  if (!token) return {}
  return {
    Authorization: `Bearer ${token}`,
  }
}

async function apiCall(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = getAuthHeaders()
  
  // Only set Content-Type: application/json for non-FormData requests
  // FormData requests need the browser to set the multipart boundary automatically
  const isFormData = options.body instanceof FormData
  const finalHeaders = {
    ...headers,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers,
  }

  const response = await fetch(`${API_BASE}/functions/v1${path}`, {
    ...options,
    headers: finalHeaders,
  })

  if (response.status === 401 && isSessionExpired()) {
    localStorage.removeItem('ksmn_token')
    localStorage.removeItem('ksmn_staff')
    window.location.href = '/login'
  }

  // For non-401 error responses, throw so callers' catch blocks can
  // surface a user-facing error message instead of silently returning
  // a non-ok Response that pages may ignore.
  // 401 is deliberately excluded: it is handled above via logout+redirect.
  // 409 is also excluded: it is a meaningful conflict response (e.g. delete-staff
  // "staff has associated records") that callers check and handle explicitly.
  if (!response.ok && response.status !== 401 && response.status !== 409) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return response
}

export const api = {
  // Auth
  verifyPin: (name: string, pin: string) =>
    apiCall('/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ name, pin }),
    }),

  // Dashboard
  getDashboardStats: () =>
    apiCall('/get-dashboard-stats'),

  getLedgerReport: (fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)
    const qs = params.toString()
    return apiCall(`/get-ledger-report${qs ? `?${qs}` : ''}`)
  },

    getEntriesReport: (fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)
    const qs = params.toString()
    return apiCall(`/get-entries-report${qs ? `?${qs}` : ''}`)
  },

    getPaymentsReport: (fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)
    const qs = params.toString()
    return apiCall(`/get-payments-report${qs ? `?${qs}` : ''}`)
  },

  // Settings
  getSettings: () =>
    apiCall('/get-settings'),

  updateSettings: (updates: { key: string; value: string }[]) =>
    apiCall('/update-settings', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    }),

  // Customers
  listCustomers: (search?: string, page?: number, pageSize?: number, filter?: string) => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (page && page > 1) params.set('page', String(page))
    if (pageSize) params.set('pageSize', String(pageSize))
    if (filter && filter !== 'all') params.set('filter', filter)
    return apiCall(`/list-customers?${params.toString()}`)
  },

  listRecentCustomers: (limit: number = 5) =>
    apiCall(`/list-customers?recent=true&limit=${limit}`),

  getTodayStats: () =>
    apiCall('/get-today-stats'),

  getRecentPayments: () =>
    apiCall('/get-recent-payments'),

    getCustomer: (id: string) =>
    apiCall(`/get-customer?id=${id}`),

  getCustomerBalance: (id: string) =>
    apiCall(`/get-customer-balance?id=${id}`),

    updateCustomer: (id: string, data: {
    custom_overdue_days?: number | null
    name?: string
    phone?: string
    address?: string | null
    notes?: string | null
    customer_type?: 'walk-in' | 'regular' | 'contractor' | 'wholesale' | 'corporate'
  }) =>
    apiCall('/update-customer', {
      method: 'POST',
      body: JSON.stringify({ id, ...data }),
    }),

    deleteCustomer: (id: string) =>
    apiCall('/delete-customer', {
      method: 'POST',
      body: JSON.stringify({ customer_id: id }),
    }),

    getEntry: (id: string) =>
    apiCall(`/get-entry?id=${id}`),

  createCustomer: (data: {
    name: string
    phone: string
    address?: string
    customer_type?: 'walk-in' | 'regular' | 'contractor' | 'wholesale' | 'corporate'
    notes?: string
  }) =>
    apiCall('/create-customer', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Entries
  createEntry: (data: {
    customer_id: string
    entry_mode: 'detailed' | 'quick'
    description?: string
    total_amount: number
    items?: any[]
    photo_url?: string
    notes?: string
    attachments?: any[]
  }) =>
    apiCall('/create-entry', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Payments
  paymentReceived: (data: {
    customer_id: string
    amount: number
    payment_date: string
    payment_method?: string
    receipt_number?: string
    notes?: string
    idempotency_key?: string
    allocations: any[]
    attachments?: any[]
  }) =>
    apiCall('/record-payment', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateEntry: (data: {
    entry_id: string
    description?: string
    total_amount: number
    items?: any[]
    notes?: string
  }) =>
    apiCall('/update-entry', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteEntry: (entry_id: string) =>
    apiCall('/delete-entry', {
      method: 'POST',
      body: JSON.stringify({ entry_id }),
    }),

  updatePayment: (data: {
    payment_id: string
    amount: number
    payment_date: string
    payment_method?: string
    receipt_number?: string
    notes?: string
    allocations: any[]
  }) =>
    apiCall('/update-payment', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deletePayment: (payment_id: string) =>
    apiCall('/delete-payment', {
      method: 'POST',
      body: JSON.stringify({ payment_id }),
    }),

  applyAdvance: (data: { customer_id: string }) => {
    // Diagnostic: confirm exact payload vs what apply-advance validates (requires customer_id)
    console.log('[apply-advance] payload:', data);
    return apiCall('/apply-advance', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getStatement: (customerId: string, fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams()
    params.set('customer_id', customerId)
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)
    return apiCall(`/generate-statement?${params.toString()}`)
  },

  exportData: (format: 'xlsx' | 'csv', dataset?: string) => {
    const params = new URLSearchParams()
    params.set('format', format)
    if (dataset) params.set('dataset', dataset)
    return apiCall(`/export-data?${params.toString()}`)
  },

  // Attachments
  uploadAttachment: (file: File, attachmentType: 'entry' | 'payment', relatedId?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('attachment_type', attachmentType)
    if (relatedId) {
      formData.append('related_id', relatedId)
    }

    return apiCall('/upload-attachment', {
      method: 'POST',
      body: formData,
      headers: {
        // Don't set Content-Type - let the browser set it with the correct boundary for multipart/form-data
      },
    })
  },

  // Staff
  listStaff: () =>
    apiCall('/list-staff'),

  // AI Scan
  aiScan: (file_url: string, file_type: 'image' | 'pdf') =>
    apiCall('/ai-scan', {
      method: 'POST',
      body: JSON.stringify({ file_url, file_type }),
    }),

  createStaff: (data: { name: string; pin: string; role: 'admin' | 'staff' }) =>
    apiCall('/create-staff', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStaff: (id: string, data: { active?: boolean; pin?: string }) =>
    apiCall(`/update-staff?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteStaff: (id: string, force: boolean = false) =>
    apiCall(`/delete-staff?id=${id}${force ? '&force=true' : ''}`, {
      method: 'DELETE',
    }),
}
