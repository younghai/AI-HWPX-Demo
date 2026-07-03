import { useEffect } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Trap keyboard focus within `ref` while `active`, move focus in on open, and
// restore it to the previously-focused element on close (review UX-09).
export function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active || !ref.current) return undefined
    const container = ref.current
    const previouslyFocused = document.activeElement

    const focusables = () => Array.from(container.querySelectorAll(FOCUSABLE))
      .filter((el) => el.offsetParent !== null)

    // Move focus into the dialog.
    const first = focusables()[0]
    if (first) first.focus()

    function onKeyDown(e) {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      // Restore focus to whatever opened the dialog.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [ref, active])
}
