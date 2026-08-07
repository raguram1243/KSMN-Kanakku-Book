import { useState } from 'react';
import { Button } from '../ui/Button';
import { AIScanModal } from './AIScanModal';
import { useAIScanStore } from '../../store/aiScanStore';

interface AIScanButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onScanComplete?: () => void;
}

export function AIScanButton({
  variant = 'primary',
  size = 'md',
  className = '',
  onScanComplete,
}: AIScanButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const { clearScan } = useAIScanStore();

  const handleClose = () => {
    setShowModal(false);
    clearScan();
  };

  const handleComplete = () => {
    setShowModal(false);
    onScanComplete?.();
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setShowModal(true)}
        className={className}
      >
        ✨ AI Scan
      </Button>

      {showModal && (
        <AIScanModal
          isOpen={showModal}
          onClose={handleClose}
          onComplete={handleComplete}
        />
      )}
    </>
  );
}