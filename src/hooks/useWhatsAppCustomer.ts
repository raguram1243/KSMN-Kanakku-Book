import { useToastStore } from '../store/toastStore';
import {
  buildAggregateReminderMessage,
  buildEntryReminderMessage,
  buildOverdueReminderMessage,
  openWhatsAppReminder,
  ReminderLanguage,
} from '../lib/whatsapp';

export interface WhatsAppableCustomer {
  phone: string;
  balance?: number;
  advance_balance?: number;
  oldest_unpaid_date?: string | null;
}

/**
 * Convenience hook for buttons that message a customer over WhatsApp.
 * Centralizes:
 *  - building the correct (pre-filled, URL-encoded) message for a customer / entry / overdue alert,
 *  - opening the wa.me deep link DIRECTLY (no intermediate landing page),
 *  - surfacing "Customer phone number is missing or invalid." when the phone is bad.
 *
 * The message wording itself is owned by src/lib/whatsapp.ts and is unchanged here.
 */
export function useWhatsAppCustomer() {
  const addToast = useToastStore((s) => s.addToast);

  function openCustomer(phone: string | null | undefined, message: string): boolean {
    if (!openWhatsAppReminder(phone, message)) {
      addToast({
        type: 'error',
        title: 'Phone number missing',
        description: 'Customer phone number is missing or invalid.',
      });
      return false;
    }
    return true;
  }

  function openCustomerAggregate(
    customer: WhatsAppableCustomer & { name: string },
    language: ReminderLanguage,
  ): boolean {
    const total = (customer.balance ?? 0) - (customer.advance_balance ?? 0);
    if ((total ?? 0) <= 0.01) {
      addToast({
        type: 'info',
        title: 'Nothing to collect',
        description: 'This customer has no outstanding balance to remind about.',
      });
      return false;
    }
    const message = buildAggregateReminderMessage(customer.name, total, language);
    return openCustomer(customer.phone, message);
  }

  function openCustomerEntry(
    customer: WhatsAppableCustomer & { name: string },
    amount: number,
    description: string | null,
    billDate: string,
    language: ReminderLanguage,
  ): boolean {
    // Preserves the exact per-entry message generation previously inlined in CustomerDetailPage
    // (which passed `entry.balance` as the amount, not `entry.total_amount`).
    const message = buildEntryReminderMessage(customer.name, amount, description, billDate, language);
    return openCustomer(customer.phone, message);
  }

  function openWhatsappOverdue(
    phone: string | null | undefined,
    customerName: string,
    amount: number,
    overdueSinceDate: string,
    language: ReminderLanguage,
  ): boolean {
    const message = buildOverdueReminderMessage(customerName, amount, overdueSinceDate, language);
    return openCustomer(phone, message);
  }

  return {
    openWhatsApp: openCustomer,
    openWhatsAppAggregate: openCustomerAggregate,
    openWhatsAppEntry: openCustomerEntry,
    openWhatsAppOverdue: openWhatsappOverdue,
  };
}

