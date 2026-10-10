import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { IconButton } from './IconButton'

type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'md' | 'lg'
  className?: string
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  className,
}: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9000] bg-dark/80 backdrop-blur-md flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-base border-2 border-dark shadow-[var(--shadow-brutal-lg)] outline-none',
          size === 'md' ? 'max-w-2xl' : 'max-w-5xl',
          className,
        )}
      >
        <IconButton
          label="Close dialog"
          onClick={onClose}
          className="absolute top-4 right-4 z-10"
        >
          ✕
        </IconButton>
        {title ? (
          <h2
            id={titleId}
            className="font-display font-black text-2xl uppercase tracking-tight text-dark px-8 pt-8 pr-16"
          >
            {title}
          </h2>
        ) : null}
        <div className={cn(title ? 'p-8 pt-4' : 'p-8')}>{children}</div>
      </div>
    </div>
  )
}
