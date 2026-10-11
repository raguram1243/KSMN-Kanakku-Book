import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Alert } from '../ui/Alert'
import { formatPhoneForWhatsApp, openWhatsAppReminder } from '../../lib/whatsapp'
import {
  buildLedgerImage,
  type LedgerImageInput,
  type LedgerImageResult,
  type LedgerImageRow,
} from '../../lib/ledgerImage'
import { useToastStore } from '../../store/toastStore'

interface WhatsAppReminderDialogProps {
  isOpen: boolean
  onClose: () => void
  customerName: string
  customerCode?: string | null
  phone: string | null | undefined
  message: string
  language: 'en' | 'ta'
  rows: LedgerImageRow[]
  totalDue: number
  advanceAdjusted?: number
}

type SendRoute = 'auto' | 'share' | 'download'

/** True when the browser says it can share this file through the native share sheet. */
function canShareFile(file: File | null): boolean {
  if (!file || typeof navigator === 'undefined') return false
  try {
    return !!navigator.canShare?.({ files: [file] })
  } catch {
    return false
  }
}

/** Phones and tablets: touch input plus a mobile-ish user agent (iPadOS reports as a Mac). */
function looksLikePhoneOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!(navigator.maxTouchPoints > 0)) return false
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua) || /Macintosh/i.test(ua)
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke after the browser has had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const subtleLinkClass =
  'text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline underline-offset-2 disabled:opacity-60 disabled:cursor-not-allowed focus-ring rounded'

export function WhatsAppReminderDialog({
  isOpen,
  onClose,
  customerName,
  customerCode,
  phone,
  message,
  language,
  rows,
  totalDue,
  advanceAdjusted,
}: WhatsAppReminderDialogProps) {
  const addToast = useToastStore((s) => s.addToast)

  const [attach, setAttach] = useState(false)
  const [building, setBuilding] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [built, setBuilt] = useState<{ key: string; result: LedgerImageResult } | null>(null)

  // Mirrors `built` so the build effect can check the cache without depending on it.
  const builtRef = useRef<{ key: string; result: LedgerImageResult } | null>(null)
  const latestInput = useRef<LedgerImageInput | null>(null)

  const formattedPhone = formatPhoneForWhatsApp(phone)

  // Cache key: anything that changes the picture (language included) invalidates it.
  const key = useMemo(
    () =>
      JSON.stringify([
        language,
        customerName,
        customerCode ?? null,
        phone ?? null,
        totalDue,
        advanceAdjusted ?? 0,
        rows,
      ]),
    [language, customerName, customerCode, phone, totalDue, advanceAdjusted, rows]
  )

  useEffect(() => {
    latestInput.current = {
      customerName,
      customerCode,
      phone,
      rows,
      totalDue,
      advanceAdjusted,
      language,
    }
  })

  // Fresh state every time the dialog opens; drop the cached image when it closes.
  useEffect(() => {
    if (isOpen) {
      setAttach(false)
      setBuilding(false)
      setImageError(null)
      setSending(false)
    } else {
      builtRef.current = null
      setBuilt(null)
    }
  }, [isOpen])

  // Build the image once when the box is ticked; reuse the cache until the inputs change.
  useEffect(() => {
    if (!isOpen || !attach) {
      setBuilding(false)
      return
    }
    if (builtRef.current?.key === key) {
      setBuilding(false)
      return
    }
    const input = latestInput.current
    if (!input) return

    let cancelled = false
    setBuilding(true)
    setImageError(null)
    buildLedgerImage(input)
      .then((result) => {
        if (cancelled) return
        const entry = { key, result }
        builtRef.current = entry
        setBuilt(entry)
        setBuilding(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const detail = err instanceof Error && err.message ? ` (${err.message})` : ''
        setImageError(`Could not create the ledger image${detail}. The message can still be sent without it.`)
        setAttach(false)
        setBuilding(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, attach, key])

  const image = built && built.key === key ? built.result : null

  const file = useMemo(
    () => (image ? new File([image.blob], image.fileName, { type: 'image/png' }) : null),
    [image]
  )

  const shareSupported = canShareFile(file)
  const autoShare = shareSupported && looksLikePhoneOrTablet()

  const imageReady = attach && !!image && !building
  const busy = building || sending
  const sendDisabled = !formattedPhone || busy || (attach && !imageReady)

  const handleSend = async (route: SendRoute = 'auto') => {
    if (!formattedPhone || busy) return

    if (!attach) {
      openWhatsAppReminder(phone, message)
      onClose()
      return
    }

    if (!image || !file) return

    const useShare = route === 'share' || (route === 'auto' && autoShare)
    if (useShare) {
      setSending(true)
      try {
        await navigator.share({ files: [file], text: message })
        onClose()
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User dismissed the share sheet: stay on the dialog.
          return
        }
        // Any other failure falls through to the download route.
      } finally {
        setSending(false)
      }
    }

    downloadBlob(image.blob, image.fileName)
    openWhatsAppReminder(phone, message)
    addToast({
      type: 'info',
      title: 'Ledger image downloaded',
      description: 'In the WhatsApp chat, tap the paperclip and attach the image.',
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send WhatsApp Reminder" size="lg">
      <div className="space-y-4">
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Customer</div>
          <div className="font-medium text-gray-900 dark:text-white">{customerName}</div>
        </div>

        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Sending to</div>
          {formattedPhone ? (
            <div className="font-medium text-gray-900 dark:text-white tabular-nums">+{formattedPhone}</div>
          ) : (
            <Alert variant="error" className="mt-1">
              This customer has no valid phone number, so the reminder cannot be sent. Add a number to the customer
              first.
            </Alert>
          )}
        </div>

        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Message</div>
          <div className="whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-48 overflow-y-auto">
            {message}
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={attach}
              onChange={(e) => setAttach(e.target.checked)}
              disabled={sending}
              className="mt-0.5 h-4 w-4 text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900 dark:text-white">Attach ledger image</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Sends a picture of the unpaid bills along with the message.
              </span>
            </span>
          </label>

          {imageError && (
            <Alert variant="error" className="mt-3" onClose={() => setImageError(null)}>
              {imageError}
            </Alert>
          )}

          {attach && building && (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Preparing ledger image...
            </div>
          )}

          {attach && image && !building && (
            <div className="mt-3 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50">
              <img
                src={image.dataUrl}
                alt={`Ledger image preview for ${customerName}`}
                className="block mx-auto max-h-60 w-auto max-w-full object-contain"
              />
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={sending} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={() => void handleSend('auto')}
              disabled={sendDisabled}
              loading={busy}
              className="flex-1"
            >
              {sending ? 'Sending...' : building ? 'Preparing...' : 'Send on WhatsApp'}
            </Button>
          </div>

          {imageReady && formattedPhone && autoShare && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => void handleSend('download')}
                disabled={busy}
                className={subtleLinkClass}
              >
                Download image instead
              </button>
            </div>
          )}

          {imageReady && formattedPhone && !autoShare && shareSupported && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => void handleSend('share')}
                disabled={busy}
                className={subtleLinkClass}
              >
                Use share sheet
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
