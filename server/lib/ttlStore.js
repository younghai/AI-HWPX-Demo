// in-memory TTL 저장소 (SPEC-P3-c). session.js / oauth.js / googleAuth.js 가
// 각각 손으로 굴리던 Map + setInterval 만료 스윕 3벌의 단일 구현.
// get 이 만료를 검사하므로 스윕은 메모리 회수용이다.
export function createTtlStore(ttlMs, { sweepMs = 60 * 1000 } = {}) {
  const store = new Map()
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now - entry.createdAt > ttlMs) store.delete(key)
    }
  }, sweepMs).unref()

  function get(key) {
    const entry = store.get(key)
    if (!entry) return null
    if (Date.now() - entry.createdAt > ttlMs) {
      store.delete(key)
      return null
    }
    return entry.value
  }

  return {
    set(key, value) { store.set(key, { value, createdAt: Date.now() }) },
    get,
    // 1회용 토큰(OAuth state)용: 읽으면서 소모한다.
    take(key) {
      const value = get(key)
      store.delete(key)
      return value
    },
    delete(key) { store.delete(key) }
  }
}
