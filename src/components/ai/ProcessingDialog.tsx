// ============================================
// Processing Dialog
// ============================================
// Shows progress during AI document processing.

import { Spinner } from '../ui/Spinner';
import { ProcessingStep } from '../../services/ai/types';
import { AI_CONFIG } from '../../services/ai/config';

interface ProcessingDialogProps {
  step: ProcessingStep | null;
}

export function ProcessingDialog({ step }: ProcessingDialogProps) {
  const steps: Array<{ key: ProcessingStep['step']; label: string }> = [
    { key: 'uploading', label: 'Uploading' },
    { key: 'reading', label: 'Reading' },
    { key: 'classifying', label: 'Classifying' },
    { key: 'extracting', label: 'Extracting' },
    { key: 'matching', label: 'Matching' },
    { key: 'preparing', label: 'Preparing' },
  ];

  const currentIndex = step ? steps.findIndex((s) => s.key === step.step) : -1;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {step ? AI_CONFIG.processingMessages[step.step] || 'Processing...' : 'Processing...'}
        </h3>
        <p className="text-sm text-gray-600">Please wait while we analyze your document</p>
      </div>

      {/* Progress Steps */}
      <div className="space-y-3">
        {steps.map((s, index) => {
          const isActive = index === currentIndex;
          const isComplete = index < currentIndex;

          return (
            <div key={s.key} className="flex items-center space-x-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isComplete
                    ? 'bg-green-100 text-green-700'
                    : isActive
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {isComplete ? '✓' : index + 1}
              </div>
              <span
                className={`text-sm ${
                  isActive ? 'font-semibold text-gray-900' : 'text-gray-600'
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}