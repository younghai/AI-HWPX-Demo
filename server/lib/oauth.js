const oauthStates = new Map()
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [state, info] of oauthStates) {
    if (now - info.createdAt > OAUTH_STATE_TTL_MS) {
      oauthStates.delete(state)
    }
  }
}, 60 * 1000).unref()

export function rememberState(state, providerKey) {
  oauthStates.set(state, { provider: providerKey, createdAt: Date.now() })
}

export function consumeState(state) {
  if (!state || !oauthStates.has(state)) return null
  const info = oauthStates.get(state)
  oauthStates.delete(state)
  if (Date.now() - info.createdAt > OAUTH_STATE_TTL_MS) return null
  return info
}

export function oauthResultPage(success, message, clientOrigin) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OAuth 인증</title>
<style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f6f1e7}
.card{background:#fff;border-radius:24px;padding:40px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.1);max-width:400px}
.icon{font-size:48px;margin-bottom:16px}
h2{margin:0 0 12px;color:#161616}
p{color:#74716a;margin:0 0 20px}
button{padding:12px 24px;border:none;border-radius:999px;background:#161616;color:#fff;font-weight:700;cursor:pointer;font-size:1rem}
</style></head><body>
<div class="card">
<div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
<h2>${success ? '연결 완료' : '연결 실패'}</h2>
<p>${message}</p>
<button onclick="window.opener?.postMessage({type:'oauth-result',success:${success}},'${clientOrigin}');window.close()">닫기</button>
</div>
<script>window.opener?.postMessage({type:'oauth-result',success:${success}},'${clientOrigin}')</script>
</body></html>`
}
