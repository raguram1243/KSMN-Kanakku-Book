// ============================================
// AI Scan Store (Zustand)
// ============================================
// Global state management for AI scan feature

import { create } from 'zustand';
// AIScanResult/CustomerMatch are owned by services/ai/types and re-exported
// here. They used to be declared separately in both places with a divergent
// `confidence` field, which only stayed hidden while the modal read the result
// out of this store instead of using the value scanDocument returns.
import type { AIScanResult, CustomerMatch } from '../services/ai/types';

export type { AIScanResult, CustomerMatch };

export interface ProcessingStep {
  step: 'uploading' | 'reading' | 'analyzing' | 'matching' | 'preparing';
  message: string;
  progress: number;
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