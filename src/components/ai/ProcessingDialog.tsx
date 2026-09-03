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
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {step ? AI_CONFIG.processingMessages[step.step] || 'Processing...' : 'Processing...'}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">Please wait while we analyze your document</p>
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
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                    : isActive
                    ? 'bg-primary-100 text-primary-700 dark:text-primary-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                }`}
              >
                {isComplete ? '✓' : index + 1}
              </div>
              <span
                className={`text-sm ${
                  isActive ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'
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