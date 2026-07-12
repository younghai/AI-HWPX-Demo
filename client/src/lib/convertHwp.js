export async function requestHwpConversion(fileName) {
  try {
    const res = await fetch('/api/convert-hwp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fileName })
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
