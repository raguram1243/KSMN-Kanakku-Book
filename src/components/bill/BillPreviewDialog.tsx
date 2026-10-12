import { useEffect, useMemo, useState } from 'react'
import { Printer, Send } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Alert } from '../ui/Alert'
import { buildBillMessage, formatPhoneForWhatsApp, openWhatsAppReminder, type ReminderLanguage } from '../../lib/whatsapp'
import { canCopyImage, canShareFile, downloadBlob, looksLikePhoneOrTablet } from '../../lib/shareFile'
import { cleanupBillPrint, printBillImages } from '../../lib/printBill'
import type { BillDocument } from '../../lib/billImage'
import { useToastStore } from '../../store/toastStore'

interface BillPreviewDialogProps {
  bill: BillDocument
  customerName: string
  phone: string | null | undefined
  /** Shown when the bill was made but could not be saved with the entry. */
  saveError?: string | null
  onClose: () => void
}

/**
 * Shows a freshly made bill with Print and the two WhatsApp buttons. The
 * WhatsApp route is the same one the pending-bill reminder uses: the share
 * sheet on phones, copy-and-paste (picture) or download (PDF) on a computer.
 */
export function BillPreviewDialog({ bill, customerName, phone, saveError, onClose }: BillPreviewDialogProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [busy, setBusy] = useState<null | 'print' | ReminderLanguage>(null)

  const formattedPhone = formatPhoneForWhatsApp(phone)
  const noun = bill.kind === 'pdf' ? 'PDF' : 'picture'

  const file = useMemo(
    () => new File([bill.blob], bill.fileName, { type: bill.mimeType }),
    [bill]
  )
  const autoShare = canShareFile(file) && looksLikePhoneOrTablet()
  const autoCopy = canCopyImage(bill.kind) && !autoShare
  // The share sheet lets the user pick the contact; every other route opens
  // the customer's own chat, so it needs their number.
  const whatsAppDisabled = !!busy || (!autoShare && !formattedPhone)

  // Drop the print container if the dialog closes mid-print.
  useEffect(() => () => cleanupBillPrint(), [])

  const handlePrint = async () => {
    setBusy('print')
    try {
      await printBillImages(bill.pageImages, bill.layout)
    } catch {
      addToast({ type: 'error', title: 'Could not print', description: 'Please try again.' })
    } finally {
      setBusy(null)
    }
  }

  const handleWhatsApp = async (language: ReminderLanguage) => {
    if (busy) return
    const message = buildBillMessage(bill.billDateText, bill.total, bill.kind === 'pdf' ? 'file' : 'photo', language)
    setBusy(language)
    try {
      if (autoShare) {
        try {
          await navigator.share({ files: [file], text: message })
          return
        } catch (err) {
          // Closing the share sheet is not an error: stay on the dialog.
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (!formattedPhone) {
            addToast({ type: 'error', title: 'Could not open the share menu', description: 'Please try again.' })
            return
          }
          // Otherwise fall through to the download route below.
        }
      } else if (autoCopy) {
        let chatOpened = false
        try {
          // Start the clipboard write before opening the chat: it needs this
          // click's activation and a focused page. Awaited after, on purpose.
          const copied = navigator.clipboard.write([new ClipboardItem({ 'image/png': bill.blob })])
          openWhatsAppReminder(phone, message)
          chatOpened = true
          await copied
          addToast({
            type: 'success',
            title: 'Bill picture copied',
            description: 'In the WhatsApp chat, press Ctrl+V to attach it.',
          })
          return
        } catch {
          downloadBlob(bill.blob, bill.fileName)
          if (!chatOpened) openWhatsAppReminder(phone, message)
          addToast({
            type: 'info',
            title: `Bill ${noun} downloaded`,
            description: `The clipboard was not available, so attach the ${noun} with the paperclip.`,
          })
          return
        }
      }

      downloadBlob(bill.blob, bill.fileName)
      openWhatsAppReminder(phone, message)
      addToast({
        type: 'info',
        title: `Bill ${noun} downloaded`,
        description: `In the WhatsApp chat, tap the paperclip and attach the ${noun}.`,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Bill" size="lg">
      <div className="space-y-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {customerName} • {bill.billDateText}
        </div>

        {saveError && (
          <Alert variant="warning">
            The bill was made but could not be saved with the entry ({saveError}). You can still print or send it.
          </Alert>
        )}

        <div className="max-h-[55vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-2 space-y-2">
          {bill.pageImages.map((src, index) => (
            <img
              key={index}
              src={src}
              alt={bill.pageCount > 1 ? `Bill page ${index + 1} of ${bill.pageCount}` : 'Bill'}
              className="block mx-auto w-full max-w-full h-auto bg-white shadow-sm"
            />
          ))}
        </div>

        {bill.kind === 'pdf' && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            PDF, {bill.pageCount} {bill.pageCount === 1 ? 'page' : 'pages'} — too many items for one picture.
          </p>
        )}

        {!formattedPhone && !autoShare && (
          <Alert variant="info">
            This customer has no valid phone number, so the bill cannot be sent on WhatsApp. You can still print it.
          </Alert>
        )}

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button onClick={() => void handlePrint()} disabled={!!busy} loading={busy === 'print'}>
            {busy !== 'print' && <Printer size={16} className="mr-2" aria-hidden="true" />}
            Print
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleWhatsApp('en')}
            disabled={whatsAppDisabled}
            loading={busy === 'en'}
          >
            {busy !== 'en' && <Send size={16} className="mr-2" aria-hidden="true" />}
            WhatsApp (English)
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleWhatsApp('ta')}
            disabled={whatsAppDisabled}
            loading={busy === 'ta'}
          >
            {busy !== 'ta' && <Send size={16} className="mr-2" aria-hidden="true" />}
            WhatsApp (Tamil)
          </Button>
        </div>
      </div>
    </Modal>
  )
}
