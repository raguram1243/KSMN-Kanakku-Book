// ============================================
// AI Scan Store (Zustand)
// ============================================
// Global state management for AI scan feature

import { create } from 'zustand';
import { ConfidenceScores } from '../services/ai/types';

export interface ProcessingStep {
  step: 'uploading' | 'reading' | 'classifying' | 'extracting' | 'matching' | 'preparing';
  message: string;
  progress: number;
}

export interface CustomerMatch {
  id: string;
  name: string;
  customer_code: string;
  phone: string;
  customer_type: string;
  match_type: 'exact' | 'similar' | 'none';
  match_score: number;
}

export interface AIScanResult {
  documentType: 'credit_invoice' | 'payment_receipt' | 'bank_receipt' | 'unknown';
  documentTypeConfidence: number;
  classificationReason?: string;
  extractedData: any;
  customerMatches: CustomerMatch[];
  confidence: ConfidenceScores;
  fileUrl?: string;
  fileType?: 'image' | 'pdf';
  needsManualClassification?: boolean;
}

interface AIScanState {
  // Scan state
  isScanning: boolean;
  scanResult: AIScanResult | null;
  processingState: ProcessingStep | null;
  error: string | null;
  
  // Actions
  setIsScanning: (isScanning: boolean) => void;
  setScanResult: (result: AIScanResult | null) => void;
  setProcessingState: (state: ProcessingStep | null) => void;
  setError: (error: string | null) => void;
  clearScan: () => void;
}

export const useAIScanStore = create<AIScanState>((set) => ({
  // Initial state
  isScanning: false,
  scanResult: null,
  processingState: null,
  error: null,
  
  // Actions
  setIsScanning: (isScanning) => set({ isScanning }),
  setScanResult: (scanResult) => set({ scanResult }),
  setProcessingState: (processingState) => set({ processingState }),
  setError: (error) => set({ error }),
  clearScan: () => set({
    isScanning: false,
    scanResult: null,
    processingState: null,
    error: null,
  }),
}));