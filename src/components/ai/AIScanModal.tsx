// ============================================
// AI Scan Modal
// ============================================
// Main modal that orchestrates the AI scan flow:
// 1. Upload document
// 2. Process with AI
// 3. Review results
// 4. Confirm and fill form

import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { MultiFileUpload, FileItem } from '../ui/MultiFileUpload';
import { ProcessingDialog } from './ProcessingDialog';
import { ReviewScreen } from './ReviewScreen';
import { useAIScanStore } from '../../store/aiScanStore';
import { aiService } from '../../services/ai/AIService';
import { ProcessingStep } from '../../services/ai/types';
import { api } from '../../lib/api';

interface AIScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type ScanPhase = 'upload' | 'processing' | 'review';

export function AIScanModal({ isOpen, onClose, onComplete }: AIScanModalProps) {
  const [phase, setPhase] = useState<ScanPhase>('upload');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processingStep, setProcessingStep] = useState<ProcessingStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { setScanResult, setIsScanning, setProcessingState, setError: setStoreError, clearScan } = useAIScanStore();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase('upload');
      setFiles([]);
      setUploading(false);
      setProcessingStep(null);
      setError(null);
      clearScan();
    }
  }, [isOpen, clearScan]);

  // Handle file upload
  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select a file to scan');
      return;
    }

    const file = files[0].file;
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // Upload file using existing attachment API
      const response = await api.uploadAttachment(file, 'entry');
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const result = await response.json();
      const fileUrl = result.url;
      const fileType = result.file_type;

      // Move to processing phase
      setPhase('processing');
      setIsScanning(true);

      // Process with AI
      await aiService.scanDocument(
        { file_url: fileUrl, file_type: fileType },
        (state) => {
          setProcessingStep(state);
          setProcessingState(state);
        }
      );

      // Get the result from the store
      const scanResult = useAIScanStore.getState().scanResult;
      
      if (scanResult) {
        setScanResult(scanResult);
        setPhase('review');
      } else {
        throw new Error('No scan result received');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Scan failed';
      setError(errorMessage);
      setStoreError(errorMessage);
      setPhase('upload');
    } finally {
      setUploading(false);
      setIsScanning(false);
    }
  };

  // Handle review completion
  const handleReviewComplete = () => {
    onComplete();
  };

  const handleCloseModal = () => {
    clearScan();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCloseModal} title="AI Document Scan" size="xl">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {phase === 'upload' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Document</h3>
              <p className="text-sm text-gray-600">
                Upload an invoice, bill, payment receipt, or bank statement. Supported formats: JPG, PNG, PDF (max 4MB).
              </p>
            </div>

            <MultiFileUpload
              label="Select Document"
              maxFiles={1}
              files={files}
              onFilesChange={setFiles}
              attachmentType="entry"
            />

            <div className="flex space-x-3 pt-4">
              <Button
                onClick={handleUpload}
                disabled={uploading || files.length === 0}
                className="flex-1"
                size="lg"
              >
                {uploading ? 'Uploading...' : '🔍 Scan Document'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleCloseModal}
                disabled={uploading}
                size="lg"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {phase === 'processing' && (
          <ProcessingDialog step={processingStep} />
        )}

        {phase === 'review' && (
          <ReviewScreen onComplete={handleReviewComplete} onBack={() => setPhase('upload')} />
        )}
      </div>
    </Modal>
  );
}