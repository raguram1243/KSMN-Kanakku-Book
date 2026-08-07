export type ReminderLanguage = 'en' | 'ta'

function formatAmount(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// 1. Per-bill reminder (any entry, not just overdue)
export function buildEntryReminderMessage(
  customerName: string,
  amount: number,
  description: string | null,
  billDate: string,
  language: ReminderLanguage
): string {
  const amt = formatAmount(amount)
  const date = formatDate(billDate)
  const desc = description || 'your purchase'
  if (language === 'ta') {
    return `அன்புள்ள ${customerName} அவர்களுக்கு, ${date} அன்று ${desc} பொருள் வாங்கியதற்கான ₹${amt} தொகை நிலுவையில் உள்ளது என்பதை அறியத்தருகிறோம். தயவுசெய்து விரைவில் தொகையை செலுத்தும்படி பணிவுடன் கேட்டுக்கொள்கிறோம். நன்றி.\n- KSM Nataraja Nadar Firm`
  }
  return `Dear ${customerName}, this is to inform you that an amount of ₹${amt} is pending for the purchase of ${desc} made on ${date}. We would appreciate your prompt payment at your earliest convenience. Thank you.\n- KSM Nataraja Nadar Firm`
}

// 2. Aggregate reminder (customer-level, total balance across all bills)
export function buildAggregateReminderMessage(
  customerName: string,
  totalAmount: number,
  language: ReminderLanguage
): string {
  const amt = formatAmount(totalAmount)
  if (language === 'ta') {
    return `அன்புள்ள ${customerName} அவர்களுக்கு, தங்களது மொத்த நிலுவைத் தொகை ₹${amt} ஆகும். தயவுசெய்து விரைவில் தொகையை செலுத்தும்படி பணிவுடன் கேட்டுக்கொள்கிறோம். தங்களது தொடர்ந்த ஆதரவுக்கு நன்றி.\n- KSM Nataraja Nadar Firm`
  }
  return `Dear ${customerName}, your total outstanding balance with us stands at ₹${amt}. We kindly request you to settle this amount at the earliest. Thank you for your valued association.\n- KSM Nataraja Nadar Firm`
}

// 3. Overdue-specific reminder (Dashboard Alerts section)
export function buildOverdueReminderMessage(
  customerName: string,
  amount: number,
  overdueSinceDate: string,
  language: ReminderLanguage
): string {
  const amt = formatAmount(amount)
  const date = formatDate(overdueSinceDate)
  if (language === 'ta') {
    return `அன்புள்ள ${customerName} அவர்களுக்கு, தங்களது ₹${amt} நிலுவைத் தொகை ${date} முதல் செலுத்தப்படாமல் உள்ளது என்பதை பணிவுடன் நினைவூட்டுகிறோம். தயவுசெய்து விரைவில் தொகையை செலுத்தும்படி கேட்டுக்கொள்கிறோம். நன்றி.\n- KSM Nataraja Nadar Firm`
  }
  return `Dear ${customerName}, this is a gentle reminder that your outstanding balance of ₹${amt} has been overdue since ${date}. We kindly request you to clear the payment at the earliest. Thank you for your continued business.\n- KSM Nataraja Nadar Firm`
}

export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}

export function openWhatsAppReminder(phone: string, message: string): void {
  const formatted = formatPhoneForWhatsApp(phone)
  window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(message)}`, '_blank')
}