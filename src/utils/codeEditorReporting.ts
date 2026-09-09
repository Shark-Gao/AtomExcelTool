export function reportCodeEditorEvent(eventType: string, params: Record<string, unknown>): void {
  const payload = { event_params: { source: 'atom_playground', language: 'typescript', ...params } }
  try {
    const pending = eventType === 'open_code_editor'
      ? window.usageBridge?.reportOpenCodeEditor(payload)
      : window.usageBridge?.reportEvent(eventType, payload)
    pending?.catch(() => {})
  } catch {
    // Optional reporting must not interfere with editing, saving, or parsing.
  }
}

export function collectAtomClassNames(value: unknown): string[] {
  const names = new Set<string>()
  const pending: unknown[] = [value]
  while (pending.length) {
    const item = pending.pop()
    if (!item || typeof item !== 'object') continue
    if (!Array.isArray(item)) {
      const name = (item as Record<string, unknown>)._ClassName
      if (typeof name === 'string' && name.trim()) names.add(name)
    }
    for (const child of Object.values(item).reverse()) pending.push(child)
  }
  return [...names]
}
