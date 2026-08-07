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

  if (response.status === 401) {
    localStorage.removeItem('ksmn_token')
    localStorage.removeItem('ksmn_staff')
    window.location.href = '/login'
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

  // Settings
  getSettings: () =>
    apiCall('/get-settings'),

  updateSettings: (updates: { key: string; value: string }[]) =>
    apiCall('/update-settings', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    }),

  // Customers
  listCustomers: (search?: string) => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
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

  updateCustomer: (id: string, data: { custom_overdue_days: number | null }) =>
    apiCall('/update-customer', {
      method: 'POST',
      body: JSON.stringify({ id, ...data }),
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
  recordPayment: (data: {
    customer_id: string
    amount: number
    payment_date: string
    payment_method?: string
    receipt_number?: string
    notes?: string
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

  applyAdvance: (data: { customer_id: string; credit_entry_id: string; amount: number }) =>
    apiCall('/apply-advance', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

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
