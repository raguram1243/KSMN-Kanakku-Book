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

    // AI Scan is image-only: the vision provider receives documents through
    // OpenRouter's `image_url` field, which cannot read raw PDF bytes. The
    // regular credit-entry attachment upload still accepts PDFs.
    if (file.type === 'application/pdf') {
      setError(
        "PDF documents aren't supported for AI Scan yet. Please upload a photo of the document instead."
      );
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please select a photo of the document (JPG or PNG).');
      return;
    }

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
      // Real MIME type of the original File, so ai-scan can label the bytes to
      // the provider accurately instead of assuming JPEG. Falls back to the
      // local File's type if the endpoint didn't report one.
      const mimeType = result.mime_type || file.type || undefined;

      // Move to processing phase
      setPhase('processing');
      setIsScanning(true);

      // Process with AI. scanDocument resolves with the result; it does not
      // write to the store itself, so take the return value here and publish it
      // (ReviewScreen reads scanResult from the store).
      const scanResult = await aiService.scanDocument(
        { file_url: fileUrl, file_type: fileType, mime_type: mimeType },
        (state) => {
          setProcessingStep(state);
          setProcessingState(state);
        }
      );

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
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {phase === 'upload' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Upload Document</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload a photo of the invoice, bill, or receipt. Supported formats: JPG, PNG (max 4MB). PDF documents aren't supported for AI Scan yet — please take or upload a photo instead.
              </p>
            </div>

            <MultiFileUpload
              label="Select Photo"
              maxFiles={1}
              files={files}
              onFilesChange={setFiles}
              attachmentType="entry"
              accept="image/*"
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