import { useRef, useState, useEffect } from 'react';
import { Button } from './Button';
import { api } from '../../lib/api';
import { debugError } from '../../lib/utils';

interface FileItem {
  file: File;
  preview: string | null;
  uploadedUrl: string | null;
  uploading: boolean;
  error: string | null;
}

interface MultiFileUploadProps {
  maxFiles: number;
  onFilesChange: (files: FileItem[]) => void;
  files: FileItem[];
  label?: string;
  attachmentType: 'entry' | 'payment';
  relatedId?: string;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

export function MultiFileUpload({ maxFiles, onFilesChange, files, label, attachmentType, relatedId }: MultiFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const startCamera = async () => {
    try {
      setCameraError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setShowCamera(true)
    } catch (err) {
      setCameraError('Camera not available or permission denied. Please use "Upload File" instead.')
      debugError('Camera error:', err)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setShowCamera(false)
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
      addFile(file)
      stopCamera()
    }, 'image/jpeg', 0.9)
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      addFile(file)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const addFile = (file: File) => {
    if (files.length >= maxFiles) {
      onFilesChange([...files, { file, preview: null, uploadedUrl: null, uploading: false, error: 'Max files reached' }])
      return
    }

    // Client-side size check
    if (file.size > MAX_FILE_SIZE) {
      const errorMsg = `File too large — max 4MB per file (got ${(file.size / 1024 / 1024).toFixed(2)}MB)`
      onFilesChange([...files, { file, preview: null, uploadedUrl: null, uploading: false, error: errorMsg }])
      return
    }

    const isImage = file.type.startsWith('image/')
    const preview = isImage ? URL.createObjectURL(file) : null

    const newItem: FileItem = {
      file,
      preview,
      uploadedUrl: null,
      uploading: false,
      error: null,
    }

    onFilesChange([...files, newItem])
  }

  const removeFile = (index: number) => {
    const item = files[index]
    if (item.preview) URL.revokeObjectURL(item.preview)
    onFilesChange(files.filter((_, i) => i !== index))
  }

  const uploadFile = async (index: number) => {
    const item = files[index]
    if (!item || item.uploading || item.uploadedUrl) return

    // Update state to uploading
    const updatedFiles = [...files]
    updatedFiles[index] = { ...item, uploading: true, error: null }
    onFilesChange(updatedFiles)

    try {
      const response = await api.uploadAttachment(item.file, attachmentType, relatedId)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      const result = await response.json()

      // Update with success
      const successFiles = [...files]
      successFiles[index] = {
        ...item,
        uploading: false,
        uploadedUrl: result.url,
        error: null,
      }
      onFilesChange(successFiles)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed'
      const errorFiles = [...files]
      errorFiles[index] = {
        ...item,
        uploading: false,
        error: errorMsg,
      }
      onFilesChange(errorFiles)
    }
  }

  const uploadAllPending = async () => {
    const pendingIndices = files
      .map((item, index) => (!item.uploadedUrl && !item.uploading && !item.error ? index : -1))
      .filter(index => index !== -1)

    for (const index of pendingIndices) {
      await uploadFile(index)
    }
  }

  // Expose upload function to parent
  useEffect(() => {
    if (typeof (window as any).__uploadAllAttachments === 'undefined') {
      ;(window as any).__uploadAllAttachments = uploadAllPending
    }
  }, [files])

  const remaining = maxFiles - files.length

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {files.map((item, index) => (
            <div key={index} className="relative group border border-gray-200 rounded-lg overflow-hidden bg-white">
              {item.preview ? (
                <img src={item.preview} alt={`Attachment ${index + 1}`} className="w-full h-24 object-cover" />
              ) : (
                <div className="w-full h-24 flex items-center justify-center bg-gray-50">
                  <div className="text-center">
                    <span className="text-2xl">📄</span>
                    <div className="text-xs text-gray-500 mt-1 truncate px-1 max-w-full">
                      {item.file.name}
                    </div>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
              {item.uploading && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="text-white text-sm font-medium">Uploading...</div>
                </div>
              )}
              {item.error && (
                <div className="absolute bottom-0 left-0 right-0 bg-red-500 text-white text-[10px] px-1 py-0.5 truncate">
                  {item.error}
                </div>
              )}
              {item.uploadedUrl && !item.error && (
                <div className="absolute bottom-0 left-0 right-0 bg-green-500 text-white text-[10px] px-1 py-0.5 text-center">
                  ✓ Uploaded
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload buttons */}
      {remaining > 0 && (
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={startCamera}
            className="flex-1 px-3 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
          >
            📷 Camera ({remaining} left)
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            📁 Upload File ({remaining} left)
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleFilePick}
        className="hidden"
      />

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Take Photo</h3>
              <button
                type="button"
                onClick={stopCamera}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {cameraError ? (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {cameraError}
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full rounded-lg bg-black"
                />
                <canvas ref={canvasRef} className="hidden" />

                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    onClick={capturePhoto}
                    size="lg"
                    className="px-8"
                  >
                    📸 Capture Photo
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export type { FileItem };
