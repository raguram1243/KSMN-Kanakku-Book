import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from './Button';

interface ExportMenuProps {
  onExportCsv: () => void;
  onExportPdf: () => void;
  disabled?: boolean;
  label?: string;
}

const MENU_WIDTH = 192; // w-48
const MENU_HEIGHT = 82; // two ~41px items
const VIEWPORT_GUTTER = 8;

/**
 * Export dropdown rendered in a portal on document.body with fixed positioning.
 *
 * The menu used to be an `absolute right-0 ... z-10` child of the page content,
 * which put it below the sidebar (z-30/z-50) and let it spill left underneath
 * the sidebar. Portalling it out of the content stacking context and clamping
 * it to the viewport keeps it fully visible at any scroll position.
 */
export function ExportMenu({ onExportCsv, onExportPdf, disabled, label = 'Export' }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current?.firstElementChild ?? triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();

    // If the button itself scrolls out of view, close rather than leave the
    // menu hanging half off-screen.
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setOpen(false);
      return;
    }

    // Right-align to the button; if that would spill off the left edge (the old
    // bug: the menu slid under the sidebar), flip to left-aligned, then clamp.
    let left = rect.right - MENU_WIDTH;
    if (left < VIEWPORT_GUTTER) left = rect.left;
    left = Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER);
    left = Math.max(left, VIEWPORT_GUTTER);

    // Open upwards when there isn't room below.
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < MENU_HEIGHT + VIEWPORT_GUTTER && rect.top > MENU_HEIGHT + VIEWPORT_GUTTER
      ? rect.top - MENU_HEIGHT - 6
      : rect.bottom + 6;

    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    // `true` so nested scroll containers reposition the menu too.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  const runAndClose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  const itemClass =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800';

  return (
    <div ref={triggerRef} className="inline-block">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <Download size={16} className="mr-2" />
        {label}
        <ChevronDown size={14} className="ml-1.5" />
      </Button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            data-testid="export-menu"
            className="fixed z-[100] w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
            style={{ top: position.top, left: position.left }}
          >
            <button role="menuitem" className={itemClass} onClick={runAndClose(onExportCsv)}>
              <FileSpreadsheet size={15} className="text-green-600 dark:text-green-400" />
              Export as CSV
            </button>
            <button
              role="menuitem"
              className={`${itemClass} border-t border-gray-100 dark:border-gray-800`}
              onClick={runAndClose(onExportPdf)}
            >
              <FileText size={15} className="text-red-600 dark:text-red-400" />
              Export as PDF
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
