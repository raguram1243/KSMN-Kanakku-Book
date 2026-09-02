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
    return `அன்புள்ள ${customerName} அவர்களுக்கு, ${date} அன்று ${desc} பொருள் வாங்கியதற்கான ₹${amt} தொகை நிலுவையில் உள்ளது என்பதை அறியத் தருகிறோம். தயவுசெய்து விரைவில் தொகையைச் செலுத்தும்படி பணிவுடன் கேட்டுக்கொள்கிறோம். நன்றி.\n- KSM Nataraja Nadar Firm`
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
    return `அன்புள்ள ${customerName} அவர்களுக்கு, தங்களது மொத்த நிலுவைத் தொகை ₹${amt} ஆகும். தயவுசெய்து விரைவில் தொகையைச் செலுத்தும்படி பணிவுடன் கேட்டுக்கொள்கிறோம். தங்களது தொடர்ந்த ஆதரவுக்கு நன்றி.\n- KSM Nataraja Nadar Firm`
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
    return `அன்புள்ள ${customerName} அவர்களுக்கு, தங்களது ₹${amt} நிலுவைத் தொகை ${date} முதல் செலுத்தப்படாமல் உள்ளது என்பதைப் பணிவுடன் நினைவூட்டுகிறோம். தயவுசெய்து விரைவில் தொகையைச் செலுத்தும்படி கேட்டுக்கொள்கிறோம். நன்றி.\n- KSM Nataraja Nadar Firm`
  }
  return `Dear ${customerName}, this is a gentle reminder that your outstanding balance of ₹${amt} has been overdue since ${date}. We kindly request you to clear the payment at the earliest. Thank you for your continued business.\n- KSM Nataraja Nadar Firm`
}

/**
 * Normalize a phone number for the WhatsApp `wa.me` deep link.
 *
 * Rules:
 * - Non-digit characters (spaces, dashes, +, etc.) are stripped.
 * - Indian numbers: 10 digits -> prepend country code 91 (e.g. 6383083399 -> 916383083399).
 *   If the caller already stored a leading 0 national prefix (06383083399), drop the 0
 *   before prepending 91 so we never produce +91+91 / 9191.
 * - International numbers that already include a country code are preserved as-is
 *   (e.g. +44 7911 123456 -> 447911123456). We do not assume every number is Indian;
 *   the existing KSMN customer base is Indian, but the normalization degrades safely
 *   for other country codes by keeping leading digits untouched when the length is
 *   > 12 or the first group does not look like an Indian MSISDN.
 * - Returns null for empty / clearly invalid input, so callers can surface a toast
 *   instead of generating a broken `wa.me/?text=...` URL.
 */
export function formatPhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;

  const digits = phone.replace(/\D/g, '');
  if (!digits) return null; // no digits at all

  // Indian mobile handling: 10-digit, or 11-digit starting with national prefix 0.
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    // e.g. 06383083399 -> 916383083399
    return `91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && digits[2] !== '0') {
    // Already has 91 + 10-digit mobile (no double 91, no leading 0 after country code).
    return digits;
  }

  // International numbers (or anything else): preserve leading digits unchanged.
  // This deliberately does NOT double-prefix and does NOT strip an existing country code,
  // so a +44 number stays 44 and an already-91 number (above) is passed through cleanly.
  if (digits.length >= 11) {
    return digits;
  }

  // 1..9 digit strings (without country code) are not valid E.164 — treat as missing.
  return null;
}

/** Builds a direct WhatsApp `wa.me` chat URL with a pre-filled, URL-encoded message. */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = formatPhoneForWhatsApp(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * Opens the customer's WhatsApp conversation directly via the `wa.me` deep link.
 * Returns:
 *  - true  when a valid URL was opened (chat window/tab created; WhatsApp may still
 *          show its own "Open app / Continue to Web" interstitial if no Web session
 *          is detected, but we do NOT add any extra landing page).
 *  - false when the phone number is missing/invalid (caller should show a toast).
 *
 * NOTE: The pre-filled message is never auto-sent. The recipient must press Send in WhatsApp.
 */
export function openWhatsAppReminder(phone: string | null | undefined, message: string): boolean {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
