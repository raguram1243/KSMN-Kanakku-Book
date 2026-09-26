import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ExternalLink, Download } from 'lucide-react';

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Keep index in sync if the parent changes initialIndex (e.g. re-open)
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  // Handle Escape key in the CAPTURE phase so it fires before the parent
  // modal's bubble-phase Escape handler. stopImmediatePropagation prevents
  // the modal's listener from also firing � so only the lightbox closes,
  // not both layers at once.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Arrow-key navigation between images
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.stopImmediatePropagation();
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'ArrowRight') {
        e.stopImmediatePropagation();
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : prev));
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [images.length]);

  // Prevent body scroll while lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const currentImage = images[currentIndex];
  const hasMultiple = images.length > 1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  const handleOpenNewTab = () => {
    window.open(currentImage, '_blank');
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentImage;
    link.download = `attachment-${currentIndex + 1}`;
    link.click();
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors z-10 p-1 focus-ring"
        aria-label="Close"
      >
        <X size={32} />
      </button>

      {/* Action buttons: open in new tab + download */}
      <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); handleOpenNewTab(); }}
          className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg p-2 transition-colors focus-ring"
          title="Open in new tab"
        >
          <ExternalLink size={20} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
          className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg p-2 transition-colors focus-ring"
          title="Download"
        >
          <Download size={20} />
        </button>
      </div>

      {/* Image counter */}
      {hasMultiple && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm z-10">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Previous arrow */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => prev - 1); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors z-10 focus-ring"
          aria-label="Previous image"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* Next arrow */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => prev + 1); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors z-10 focus-ring"
          aria-label="Next image"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Image */}
      <img
        src={currentImage}
        alt="Full size preview"
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}