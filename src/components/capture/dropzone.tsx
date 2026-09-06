'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ACCEPTED_IMAGE_TYPES } from '@/lib/utils/compress'
import { cn } from '@/lib/utils/cn'
import { IconUpload } from '@/components/ui/icons'

/**
 * The drop target is a sheet of paper with a guideline drawn on it.
 *
 * On drag-over the guideline goes solid and the sheet lifts one step in value —
 * the same "nearer is lighter" rule the rest of the product runs on. It is a
 * real button, so the keyboard reaches it, and it takes a paste as well as a
 * drop because photographing a drawing and pasting it is a real workflow.
 */
export function Dropzone({
  onFile,
  disabled,
  compact = false,
}: {
  onFile: (file: File) => void
  disabled?: boolean
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const depth = useRef(0)

  const take = useCallback(
    (files: FileList | null | undefined) => {
      const file = files?.[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  // Paste anywhere on the page while the capture screen is open.
  useEffect(() => {
    if (disabled) return
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (file) onFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onFile, disabled])

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current -= 1
        if (depth.current <= 0) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setOver(false)
        if (!disabled) take(e.dataTransfer?.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }}
        disabled={disabled}
      />

      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative flex w-full flex-col items-center justify-center gap-3 border transition-colors',
          compact ? 'p-6' : 'p-10 sm:p-14',
          over
            ? 'border-blue-ink bg-v0'
            : 'border-dashed border-v4 bg-v1 hover:border-v7 hover:bg-v0',
          disabled && 'pointer-events-none opacity-40',
        )}
      >
        <svg
          width="58"
          height="68"
          viewBox="0 0 58 68"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="0.5"
            y="0.5"
            width="57"
            height="67"
            fill="var(--color-v0)"
            stroke={over ? 'var(--color-blue-ink)' : 'var(--color-v4)'}
          />
          <line
            x1="8"
            y1="45"
            x2="50"
            y2="45"
            stroke="var(--color-blue)"
            strokeWidth="1.6"
            strokeDasharray={over ? '0' : '4 3'}
          />
          <line
            x1="19"
            y1="10"
            x2="19"
            y2="58"
            stroke="var(--color-blue)"
            strokeWidth="1.6"
            strokeDasharray={over ? '0' : '4 3'}
            opacity="0.75"
          />
        </svg>

        <span className="flex items-center gap-2 text-sm text-v9">
          <IconUpload size={15} />
          {over ? 'Let go' : 'Choose a photo of the work'}
        </span>
        <span className="max-w-[38ch] text-center text-2xs text-v5">
          Drop it here, paste it, or pick a file. JPEG, PNG or WebP. It is
          compressed on this device before anything is uploaded.
        </span>
      </button>
    </div>
  )
}
