// ============================================
// Prompt templates for AI document scanning
// ============================================
// These prompts are sent to the OpenRouter vision model
// to classify and extract data from documents.

export interface ClassificationResult {
  document_type: 'credit_invoice' | 'payment_receipt' | 'bank_receipt' | 'unknown';
  confidence: number;
  reason: string;
}

export interface CreditExtraction {
  customer_name: string;
  phone_number: string;
  invoice_number: string;
  invoice_date: string;
  items: Array<{
    item_name: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  grand_total: number;
  notes: string;
}

export interface PaymentExtraction {
  customer_name: string;
  payment_amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string;
  upi_id: string;
  bank_name: string;
  notes: string;
}

// ============================================
// Classification Prompt
// ============================================
export const CLASSIFICATION_PROMPT = `You are a document classification expert. Analyze the provided document image/PDF and classify it into one of these categories:

1. "credit_invoice" - An invoice, bill, or receipt showing items purchased with quantities, rates, and a total amount. This includes shop bills, supplier invoices, material bills, etc.

2. "payment_receipt" - A payment confirmation showing money transferred/paid. This includes UPI screenshots, payment app confirmations, bank transfer receipts, cash payment receipts, etc.

3. "bank_receipt" - A bank statement, deposit slip, or bank transaction receipt.

4. "unknown" - If the document doesn't clearly fit any of the above categories.

Respond with ONLY a JSON object in this exact format (no markdown, no explanation):
{
  "document_type": "credit_invoice" | "payment_receipt" | "bank_receipt" | "unknown",
  "confidence": <number between 0 and 1>,
  "reason": "<brief explanation>"
}`;

// ============================================
// Credit Invoice Extraction Prompt
// ============================================
export const CREDIT_EXTRACTION_PROMPT = `You are a data extraction expert. Extract the following information from this invoice/bill document.

Extract these fields:
- document_type: "credit_invoice"
- customer_name: The name of the customer/buyer (the person being billed)
- phone: Phone number if visible (empty string if not found)
- invoice_number: Invoice or bill number (empty string if not found)
- invoice_date: Date on the invoice in YYYY-MM-DD format (empty string if not found)
- items: Array of line items, each with:
  - item: Name/description of the item
  - quantity: Quantity (number)
  - unit: Unit of measurement (e.g., "nos", "kg", "bag", "box", "ft", "pcs")
  - rate: Unit price (number)
  - amount: Total amount for this item (number)
- subtotal: Subtotal before tax/discount (number, 0 if not found)
- discount: Discount amount (number, 0 if not found)
- tax: Tax amount (number, 0 if not found)
- grand_total: Final total amount (number)
- notes: Any additional notes (empty string if not found)
- confidence: Object with confidence scores (0-1) for key fields:
  - customer_name: <confidence>
  - invoice_number: <confidence>
  - invoice_date: <confidence>
  - grand_total: <confidence>

IMPORTANT:
- Respond with ONLY a JSON object (no markdown, no explanation, no code blocks)
- Use 0 for any numeric field that cannot be determined
- Use empty string "" for any text field that cannot be determined
- If items are not clearly listed, return an empty array
- All amounts should be numbers (not strings)
- Confidence scores should be between 0 and 1 (e.g., 0.95 for 95% confident)

JSON Schema:
{
  "document_type": "credit_invoice",
  "customer_name": "string",
  "phone": "string",
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "items": [{"item": "string", "quantity": 0, "unit": "string", "rate": 0, "amount": 0}],
  "subtotal": 0,
  "discount": 0,
  "tax": 0,
  "grand_total": 0,
  "notes": "string",
  "confidence": {"customer_name": 0, "invoice_number": 0, "invoice_date": 0, "grand_total": 0}
}`;

// ============================================
// Payment Receipt Extraction Prompt
// ============================================
export const PAYMENT_EXTRACTION_PROMPT = `You are a data extraction expert. Extract the following information from this payment receipt/UPI screenshot/bank receipt.

Extract these fields:
- customer_name: The name of the person who made or received the payment (empty string if not found)
- payment_amount: The payment amount as a number (0 if not found)
- payment_date: Payment date in YYYY-MM-DD format (empty string if not found)
- payment_method: One of "cash", "upi", "bank_transfer", "card", "others" (empty string if not found)
- reference_number: Transaction/reference number (empty string if not found)
- upi_id: UPI ID if visible (empty string if not found)
- bank_name: Bank name if visible (empty string if not found)
- notes: Any additional notes (empty string if not found)

IMPORTANT:
- Respond with ONLY a JSON object (no markdown, no explanation)
- Use 0 for any numeric field that cannot be determined
- Use empty string "" for any text field that cannot be determined
- For payment_method, use the closest match from: cash, upi, bank_transfer, card, others
- The amount should be a number (not a string)

Format:
{
  "customer_name": "string",
  "payment_amount": 0,
  "payment_date": "YYYY-MM-DD",
  "payment_method": "cash" | "upi" | "bank_transfer" | "card" | "others" | "",
  "reference_number": "string",
  "upi_id": "string",
  "bank_name": "string",
  "notes": "string"
}`;