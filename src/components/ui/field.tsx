'use client'

import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * Form fields. Inputs sit in the paper, ruled underneath rather than boxed —
 * the way a form printed on a sheet works. The rule darkens on focus, which is
 * the same "value means attention" rule the rest of the product runs on.
 */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
  htmlFor?: string
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-v7">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-v9" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-v5">{hint}</p>
      ) : null}
    </div>
  )
}

const inputBase =
  'w-full bg-transparent px-0 py-2 text-sm text-v9 placeholder:text-v5 ' +
  'border-0 border-b border-v4 rounded-none transition-colors ' +
  'focus:border-v9 focus:outline-none focus-visible:outline-none ' +
  'disabled:opacity-40'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputBase, className)} {...props} />
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        inputBase,
        'font-language min-h-24 resize-y border border-v4 px-3 py-2 text-base leading-relaxed focus:border-v9',
        className,
      )}
      {...props}
    />
  )
})

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(inputBase, 'appearance-none pr-6', className)}
      {...props}
    >
      {children}
    </select>
  )
})

/**
 * A choice set rendered as plates rather than radio dots. The selected option
 * is the darkest thing in the group.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  name,
  columns = 2,
}: {
  label: string
  value: T | null
  options: Array<{ value: T; label: string; note?: string }>
  onChange: (v: T) => void
  name: string
  columns?: 1 | 2 | 3
}) {
  const id = useId()
  return (
    <fieldset>
      <legend id={id} className="mb-2 block text-xs font-medium text-v7">
        {label}
      </legend>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className={cn(
          'grid gap-2',
          columns === 1 && 'grid-cols-1',
          columns === 2 && 'grid-cols-1 sm:grid-cols-2',
          columns === 3 && 'grid-cols-1 sm:grid-cols-3',
        )}
      >
        {options.map((o) => {
          const selected = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              name={name}
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={cn(
                'rounded-[2px] border px-3 py-2.5 text-left transition-colors',
                selected
                  ? 'border-v9 bg-v9 text-v0'
                  : 'border-v4 bg-v0 text-v7 hover:border-v7',
              )}
            >
              <span className="block text-sm">{o.label}</span>
              {o.note ? (
                <span
                  className={cn(
                    'mt-0.5 block text-2xs',
                    selected ? 'text-v3' : 'text-v5',
                  )}
                >
                  {o.note}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
