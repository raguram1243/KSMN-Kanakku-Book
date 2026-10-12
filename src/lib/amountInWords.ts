/**
 * Indian-system amount in words (Crore / Lakh / Thousand). A pure function
 * with no imports, so the bill renderer can use it without pulling jsPDF into
 * the Add Credit page. receiptPdf.ts re-exports it for the receipt PDFs.
 */
export function amountInWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number): string => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : ''));
  const three = (x: number): string => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    return (h ? ones[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : '');
  };
  if (!n || n <= 0) return 'Zero Rupees';
  let num = Math.floor(n);
  const paise = Math.round((n - num) * 100);
  let out = '';
  const cr = Math.floor(num / 1e7); num %= 1e7;
  const lakh = Math.floor(num / 1e5); num %= 1e5;
  const thou = Math.floor(num / 1000); num %= 1000;
  if (cr) out += three(cr) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thou) out += two(thou) + ' Thousand ';
  if (num) out += three(num) + ' ';
  out += 'Rupees';
  if (paise) out += ` and ${two(paise)} Paise`;
  return out.trim();
}
