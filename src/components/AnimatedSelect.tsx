import type { KeyboardEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

type SelectValue = string | number

export type AnimatedSelectOption<T extends SelectValue> = {
  label: string
  value: T
  disabled?: boolean
}

type AnimatedSelectProps<T extends SelectValue> = {
  value: T
  options: AnimatedSelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}

function getNextEnabledIndex<T extends SelectValue>(
  options: AnimatedSelectOption<T>[],
  startIndex: number,
  direction: 1 | -1,
) {
  if (options.length === 0) {
    return -1
  }

  let cursor = startIndex
  for (let step = 0; step < options.length; step += 1) {
    cursor = (cursor + direction + options.length) % options.length
    if (!options[cursor]?.disabled) {
      return cursor
    }
  }

  return -1
}

export function AnimatedSelect<T extends SelectValue>({
  value,
  options,
  onChange,
  disabled = false,
  className,
}: AnimatedSelectProps<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  )
  const firstEnabledIndex = useMemo(() => options.findIndex((option) => !option.disabled), [options])
  const fallbackHighlightedIndex = useMemo(() => {
    if (selectedIndex >= 0 && !options[selectedIndex]?.disabled) {
      return selectedIndex
    }
    return firstEnabledIndex
  }, [firstEnabledIndex, options, selectedIndex])
  const resolvedHighlightedIndex =
    highlightedIndex >= 0 && !options[highlightedIndex]?.disabled
      ? highlightedIndex
      : fallbackHighlightedIndex

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setHighlightedIndex(-1)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('touchstart', handlePointerDown, { passive: true })

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('touchstart', handlePointerDown)
    }
  }, [])

  function chooseOption(option: AnimatedSelectOption<T>) {
    if (disabled || option.disabled) {
      return
    }

    onChange(option.value)
    setOpen(false)
    setHighlightedIndex(-1)
  }

  function moveHighlight(direction: 1 | -1) {
    const start = resolvedHighlightedIndex >= 0 ? resolvedHighlightedIndex : -1
    const next = getNextEnabledIndex(options, start, direction)
    if (next >= 0) {
      setHighlightedIndex(next)
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      moveHighlight(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      moveHighlight(-1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }

      if (resolvedHighlightedIndex >= 0 && options[resolvedHighlightedIndex]) {
        chooseOption(options[resolvedHighlightedIndex])
      }
      return
    }

    if (event.key === 'Escape') {
      setOpen(false)
      setHighlightedIndex(-1)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`animated-select ${open ? 'animated-select-open' : ''} ${
        disabled ? 'animated-select-disabled' : ''
      } ${className ?? ''}`.trim()}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
          setHighlightedIndex(-1)
        }
      }}
    >
      <button
        type="button"
        className="animated-select-trigger"
        onClick={() => {
          if (disabled) {
            return
          }

          setOpen((previous) => {
            const nextOpen = !previous
            if (!nextOpen) {
              setHighlightedIndex(-1)
            }
            return nextOpen
          })
        }}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="animated-select-value">{selectedOption?.label ?? options[0]?.label ?? ''}</span>
        <span className="animated-select-caret" aria-hidden="true">
          {'\u25BE'}
        </span>
      </button>

      <div className="animated-select-menu-wrap" aria-hidden={!open}>
        <ul role="listbox" className="animated-select-menu">
          {options.map((option, index) => (
            <li key={String(option.value)}>
              <button
                type="button"
                role="option"
                className={`animated-select-option ${
                  index === selectedIndex ? 'animated-select-option-selected' : ''
                } ${index === resolvedHighlightedIndex ? 'animated-select-option-highlighted' : ''}`.trim()}
                aria-selected={index === selectedIndex}
                onClick={() => chooseOption(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                disabled={option.disabled}
                tabIndex={open ? 0 : -1}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
