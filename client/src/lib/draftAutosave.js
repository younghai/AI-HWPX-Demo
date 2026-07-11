const AUTOSAVE_KEY = 'ai-hwp-draft-autosave'

export function loadSavedDraft() {
  try {
    const raw = window.localStorage?.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.draft && Array.isArray(parsed.draft.sections) && parsed.draft.sections.length) return parsed
  } catch { /* disabled / corrupt */ }
  return null
}

export function saveDraft(draft) {
  try {
    const clean = { ...draft, sections: (draft.sections || []).map(({ regenerating: _regenerating, ...s }) => s) }
    window.localStorage?.setItem(AUTOSAVE_KEY, JSON.stringify({ draft: clean, savedAt: Date.now() }))
  } catch { /* quota exceeded / disabled — autosave is best-effort */ }
}

export function clearSavedDraft() {
  try { window.localStorage?.removeItem(AUTOSAVE_KEY) } catch { /* ignore */ }
}
