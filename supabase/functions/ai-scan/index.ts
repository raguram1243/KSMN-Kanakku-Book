// ============================================
// AI Scan Edge Function
// ============================================
// Receives a file URL (uploaded to Supabase Storage),
// downloads it, sends it to the AI provider for
// classification and extraction, matches customers,
// and returns structured JSON to the frontend.
//
// Flow:
//   1. Verify the caller (staff or admin)
//   2. Download file from Supabase Storage
//   3. One Gemini call: classify the document AND extract its fields
//   4. Match customers from database
//   5. Return clean JSON with confidence scores
//
// There is no OCR step - the vision model reads the document directly.
//
// Staff may scan bills and payment receipts, but customer matches only ever
// carry identity fields (id, name, code, phone, type) - never balances.
//
// Environment variables (set as Edge Function secrets):
//   GEMINI_API_KEY - Google AI Studio key. REQUIRED. Set with:
//                      supabase secrets set GEMINI_API_KEY=your_key_here
//   GEMINI_MODEL   - optional model override (default: gemini-2.5-flash)
//   SUPABASE_URL              - (auto-provided by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY - (auto-provided by Supabase)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts';
import { serviceClient, requireStaff } from '../_shared/auth.ts';
import { parseStorageUrl, canonicalStorageUrl } from '../_shared/storage.ts';
import { AIProviderError, getProvider, checkAIProviderHealth } from './ai-provider.ts';
import { DOCUMENT_ANALYSIS_PROMPT } from './prompts.ts';
import {
  extractJsonFromText,
  validateClassification,
  validateCreditExtraction,
  validatePaymentExtraction,
  generateFieldConfidence,
} from './parser.ts';
import { matchCustomers } from './customer-matcher.ts';
import {
  PDF_UNSUPPORTED_MESSAGE,
  isPdfMimeType,
  resolveImageMimeType,
} from './mime.ts';

// Rate limiting: simple in-memory counter per staff member.
// It lives in one function instance, so it is a speed bump against a runaway
// client rather than a hard limit.
const scanCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10; // max scans per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);

  try {
    // 1. Verify the caller
    const supabase = serviceClient();
    const caller = await requireStaff(req, supabase);

    // Health check endpoint: admin only. Matches the path only, never the query string.
    const pathname = new URL(req.url).pathname;
    if (pathname.endsWith('/health') || pathname.endsWith('/test')) {
      if (caller.role !== 'admin') throw new HttpError(403, 'Admin access required');
      const health = await checkAIProviderHealth();
      return json(req, health);
    }

    // Rate limiting check
    const now = Date.now();
    const staffRate = scanCounts.get(caller.staff_id);
    if (staffRate) {
      if (now < staffRate.resetTime) {
        if (staffRate.count >= RATE_LIMIT_MAX) {
          throw new HttpError(429, 'Rate limit exceeded. Maximum 10 scans per minute. Please wait and try again.');
        }
        staffRate.count++;
      } else {
        scanCounts.set(caller.staff_id, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      }
    } else {
      scanCounts.set(caller.staff_id, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    }

    // 2. Parse request body
    const { file_url, file_type, mime_type } = await readJson(req);

    if (!file_url || typeof file_url !== 'string') {
      throw new HttpError(400, 'file_url is required');
    }

    // Validate file type
    if (!file_type || !['image', 'pdf'].includes(file_type as string)) {
      throw new HttpError(400, 'Invalid file_type. Must be "image" or "pdf".');
    }

    // Reject PDFs up front - before downloading or spending an AI call on bytes
    // the vision provider cannot read. AI Scan is image-only; the regular
    // credit-entry attachment upload still accepts PDFs.
    if (file_type === 'pdf') {
      throw new HttpError(400, PDF_UNSUPPORTED_MESSAGE);
    }

    // 3. Only files in our own attachment buckets may be scanned
    const { bucket, path: filePath } = parseStorageUrl(file_url);
    if (!bucket || !filePath) {
      throw new HttpError(400, 'Invalid file URL. Please upload the photo through the app first.');
    }

    // 4. Download the file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('ai-scan download failed:', downloadError);
      throw new HttpError(404, 'Could not read the uploaded file. Please upload it again.');
    }

    // Convert to bytes
    const fileBytes = new Uint8Array(await fileData.arrayBuffer());

    // Use the file's real MIME type. This used to be hardcoded to 'image/jpeg'
    // for every image, which mislabels PNG/WebP/GIF bytes to the provider.
    const mimeType = resolveImageMimeType(mime_type, fileData.type);

    if (!mimeType) {
      const detected = (typeof mime_type === 'string' && mime_type) || fileData.type || 'unknown';
      if (isPdfMimeType(detected)) {
        throw new HttpError(400, PDF_UNSUPPORTED_MESSAGE);
      }
      throw new HttpError(400, 'Unsupported image format. Please upload a JPG or PNG photo.');
    }

    // 5. One AI call: classify the document and extract its fields together.
    const provider = getProvider();

    let analysis: any;
    try {
      const raw = await provider.analyzeDocument(fileBytes, mimeType, DOCUMENT_ANALYSIS_PROMPT);
      analysis = extractJsonFromText(raw);
    } catch (analyzeError: any) {
      // Report what actually went wrong. Gemini shedding load is a 503, not a
      // fault in this function, and a caller that sees 500 for everything
      // cannot tell a retryable blip from a broken request.
      console.error('ai-scan analysis failed:', analyzeError);
      const isProviderError = analyzeError instanceof AIProviderError;
      const status = isProviderError ? analyzeError.status : 500;
      const retryable = isProviderError ? analyzeError.retryable : false;

      let message = 'Document analysis failed. Please try again with a clearer image.';
      if (isProviderError) {
        message = String(analyzeError.message || message);
        // Never show setup details (secret names) to users
        if (message.includes('GEMINI_API_KEY')) {
          message = 'AI service is not properly configured. Please contact administrator.';
        }
      } else if (String(analyzeError?.message || '').includes('timed out')) {
        message = 'The AI service took too long to respond. Please try again with a clearer image.';
      }

      return json(req, {
        error: message,
        retryable,
        documentType: 'unknown',
        documentTypeConfidence: 0,
        extractedData: null,
        customerMatches: [],
        confidence: {},
      }, status);
    }

    // The classification half of the response.
    const classificationResult = validateClassification({
      document_type: analysis?.document_type,
      confidence: analysis?.confidence,
      reason: analysis?.reason,
    });

    // 6. Unknown or low-confidence: hand back to the user to classify.
    if (
      classificationResult.document_type === 'unknown' ||
      classificationResult.confidence < 0.7
    ) {
      return json(req, {
        documentType: classificationResult.document_type,
        documentTypeConfidence: classificationResult.confidence,
        classificationReason: classificationResult.reason,
        extractedData: null,
        customerMatches: [],
        confidence: {},
        needsManualClassification: true,
      });
    }

    // 7. Validate the extracted half against the shape for that document type.
    // Staff may scan payment receipts too (they record pending payments).
    let extractedData: any = null;
    let confidence: Record<string, number> = {};

    try {
      if (classificationResult.document_type === 'credit_invoice') {
        extractedData = validateCreditExtraction(analysis?.data);
        confidence = generateFieldConfidence('credit_invoice', extractedData);
      } else {
        // payment_receipt | bank_receipt
        extractedData = validatePaymentExtraction(analysis?.data);
        confidence = generateFieldConfidence(classificationResult.document_type, extractedData);
      }
    } catch (extractError: any) {
      console.error('ai-scan extraction failed:', extractError);
      return json(req, {
        error: 'Could not read the details from this document. Please try a clearer photo or enter them manually.',
        documentType: classificationResult.document_type,
        documentTypeConfidence: classificationResult.confidence,
        extractedData: null,
        customerMatches: [],
        confidence: {},
      }, 500);
    }

    // 8. Match customers (identity fields only - see customer-matcher.ts)
    let customerMatches: any[] = [];
    if (extractedData) {
      try {
        customerMatches = await matchCustomers(
          supabase,
          extractedData.customer_name || '',
          extractedData.phone_number || ''
        );
      } catch (matchError: any) {
        // Customer matching failure is non-fatal
        console.error('Customer matching failed:', matchError.message);
      }
    }

    // 9. Return structured JSON
    return json(req, {
      documentType: classificationResult.document_type,
      documentTypeConfidence: classificationResult.confidence,
      classificationReason: classificationResult.reason,
      extractedData,
      customerMatches,
      confidence,
      // Canonical form of the file link (what gets stored if the user saves the entry)
      fileUrl: canonicalStorageUrl(bucket, filePath),
      fileType: file_type,
      mimeType,
    });
  } catch (error: any) {
    return errorResponse(req, error, 'ai-scan');
  }
});
