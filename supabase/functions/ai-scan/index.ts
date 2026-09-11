// ============================================
// AI Scan Edge Function
// ============================================
// Receives a file URL (uploaded to Supabase Storage),
// downloads it, sends it to the AI provider for
// classification and extraction, matches customers,
// and returns structured JSON to the frontend.
//
// Flow:
//   1. Verify JWT
//   2. Download file from Supabase Storage
//   3. One Gemini call: classify the document AND extract its fields
//   4. Match customers from database
//   5. Return clean JSON with confidence scores
//
// There is no OCR step - the vision model reads the document directly.
//
// Environment variables (set as Edge Function secrets):
//   GEMINI_API_KEY - Google AI Studio key. REQUIRED. Set with:
//                      supabase secrets set GEMINI_API_KEY=your_key_here
//   GEMINI_MODEL   - optional model override (default: gemini-2.5-flash)
//   SUPABASE_URL              - (auto-provided by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY - (auto-provided by Supabase)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyToken } from '../_shared/jwt-utils.ts';
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

// Rate limiting: simple in-memory counter per staff member
const scanCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10; // max scans per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Health check endpoint (no auth required)
  if (req.url.includes('/health') || req.url.includes('/test')) {
    const health = await checkAIProviderHealth();
    return new Response(
      JSON.stringify(health),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Verify JWT
    const authHeader = req.headers.get('Authorization');
    const token = await verifyToken(authHeader);

    // Rate limiting check
    const now = Date.now();
    const staffRate = scanCounts.get(token.staff_id);
    if (staffRate) {
      if (now < staffRate.resetTime) {
        if (staffRate.count >= RATE_LIMIT_MAX) {
          return new Response(
            JSON.stringify({
              error: 'Rate limit exceeded. Maximum 10 scans per minute. Please wait and try again.',
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        staffRate.count++;
      } else {
        scanCounts.set(token.staff_id, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      }
    } else {
      scanCounts.set(token.staff_id, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    }

    // 2. Parse request body
    const { file_url, file_type, mime_type } = await req.json();

    if (!file_url) {
      return new Response(
        JSON.stringify({ error: 'file_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file type
    if (!file_type || !['image', 'pdf'].includes(file_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid file_type. Must be "image" or "pdf".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Reject PDFs up front - before downloading or spending an AI call on bytes
    // the vision provider cannot read. AI Scan is image-only; the regular
    // credit-entry attachment upload still accepts PDFs.
    if (file_type === 'pdf') {
      return new Response(
        JSON.stringify({ error: PDF_UNSUPPORTED_MESSAGE }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Initialize Supabase client (service role)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. Download file from Supabase Storage
    // Parse the file URL to extract bucket and path
    const urlObj = new URL(file_url);
    const pathSegments = urlObj.pathname.split('/object/public/');
    if (pathSegments.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Invalid file URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bucketAndPath = pathSegments[1];
    const firstSlash = bucketAndPath.indexOf('/');
    const bucket = bucketAndPath.substring(0, firstSlash);
    const filePath = bucketAndPath.substring(firstSlash + 1);

    // Download the file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(filePath);

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ error: `Failed to download file: ${downloadError?.message || 'Unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert to bytes
    const fileBytes = new Uint8Array(await fileData.arrayBuffer());

    // Use the file's real MIME type. This used to be hardcoded to 'image/jpeg'
    // for every image, which mislabels PNG/WebP/GIF bytes to the provider.
    const mimeType = resolveImageMimeType(mime_type, fileData.type);

    if (!mimeType) {
      const detected = (typeof mime_type === 'string' && mime_type) || fileData.type || 'unknown';
      if (isPdfMimeType(detected)) {
        return new Response(
          JSON.stringify({ error: PDF_UNSUPPORTED_MESSAGE }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          error: `Unsupported image format (${detected}). Please upload a JPG or PNG photo.`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      const status = analyzeError instanceof AIProviderError ? analyzeError.status : 500;
      const retryable = analyzeError instanceof AIProviderError ? analyzeError.retryable : false;
      return new Response(
        JSON.stringify({
          error: `Document analysis failed: ${analyzeError.message}`,
          retryable,
          documentType: 'unknown',
          documentTypeConfidence: 0,
          extractedData: null,
          customerMatches: [],
          confidence: {},
        }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({
          documentType: classificationResult.document_type,
          documentTypeConfidence: classificationResult.confidence,
          classificationReason: classificationResult.reason,
          extractedData: null,
          customerMatches: [],
          confidence: {},
          needsManualClassification: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Validate the extracted half against the shape for that document type.
    let extractedData: any = null;
    let confidence: Record<string, number> = {};

    try {
      if (classificationResult.document_type === 'credit_invoice') {
        extractedData = validateCreditExtraction(analysis?.data);
        confidence = generateFieldConfidence('credit_invoice', extractedData);
      } else {
        // payment_receipt | bank_receipt - admin only, matching record-payment.
        if (token.role !== 'admin') {
          return new Response(
            JSON.stringify({
              error: 'Admin access required to scan payment receipts',
              documentType: classificationResult.document_type,
              documentTypeConfidence: classificationResult.confidence,
              extractedData: null,
              customerMatches: [],
              confidence: {},
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        extractedData = validatePaymentExtraction(analysis?.data);
        confidence = generateFieldConfidence(classificationResult.document_type, extractedData);
      }
    } catch (extractError: any) {
      return new Response(
        JSON.stringify({
          error: `Data extraction failed: ${extractError.message}`,
          documentType: classificationResult.document_type,
          documentTypeConfidence: classificationResult.confidence,
          extractedData: null,
          customerMatches: [],
          confidence: {},
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Match customers
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
    return new Response(
      JSON.stringify({
        documentType: classificationResult.document_type,
        documentTypeConfidence: classificationResult.confidence,
        classificationReason: classificationResult.reason,
        extractedData,
        customerMatches,
        confidence,
        fileUrl: file_url,
        fileType: file_type,
        mimeType,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    // Handle specific error types with meaningful messages
    let errorMessage = error?.message || 'Unknown error occurred';

    if (errorMessage.includes('timed out')) {
      errorMessage = 'The AI service took too long to respond. Please try again with a clearer image.';
    } else if (errorMessage.includes('GEMINI_API_KEY')) {
      errorMessage = 'AI service is not properly configured. Please contact administrator.';
    } else if (errorMessage.includes('Invalid or expired token')) {
      errorMessage = 'Your session has expired. Please log in again.';
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});