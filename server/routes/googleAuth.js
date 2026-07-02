import { Router } from 'express'
import crypto from 'crypto'
import { createSession, getSession, destroySession } from '../lib/session.js'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5188'
const OAUTH_REDIRECT_BASE = process.env.OAUTH_REDIRECT_BASE || `http://127.0.0.1:${process.env.PORT || 8788}`

// Reject obvious placeholder values (.env 에 진짜 값 없이 템플릿 문자열만 들어있는 경우)
// 진짜 Google Client ID 포맷: "<숫자>-<영숫자>.apps.googleusercontent.com"
function isPlaceholderCredential(value) {
  if (!value) return true
  const v = value.trim().toLowerCase()
  if (v.startsWith('your_') || v.startsWith('your-') || v === 'your_client_id') return true
  if (v.includes('replace') || v.includes('example') || v === 'xxxx') return true
  return false
}

const CLIENT_ID_CONFIGURED = !isPlaceholderCredential(GOOGLE_CLIENT_ID)
  && GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com')
const CLIENT_SECRET_CONFIGURED = !isPlaceholderCredential(GOOGLE_CLIENT_SECRET)

const googleStates = new Map()
const STATE_TTL_MS = 10 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [state, info] of googleStates) {
    if (now - info.createdAt > STATE_TTL_MS) {
      googleStates.delete(state)
    }
  }
}, 60 * 1000).unref()

function resultPage(success, message) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Google 로그인</title>
<style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f6f1e7}
.card{background:#fff;border-radius:24px;padding:40px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.1);max-width:400px}
.icon{font-size:48px;margin-bottom:16px}
h2{margin:0 0 12px;color:#161616}
p{color:#74716a;margin:0 0 20px}
button{padding:12px 24px;border:none;border-radius:999px;background:#161616;color:#fff;font-weight:700;cursor:pointer;font-size:1rem}
</style></head><body>
<div class="card">
<div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
<h2>${success ? '로그인 완료' : '로그인 실패'}</h2>
<p>${message}</p>
<button onclick="window.opener?.postMessage({type:'google-auth-result',success:${success}},'${CLIENT_ORIGIN}');window.close()">닫기</button>
</div>
<script>window.opener?.postMessage({type:'google-auth-result',success:${success}},'${CLIENT_ORIGIN}')</script>
</body></html>`
}

function mockLoginPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Mock 로그인</title>
<style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f6f1e7}
.card{background:#fff;border-radius:24px;padding:40px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.1);max-width:420px}
h2{margin:0 0 12px;color:#161616}
p{color:#74716a;margin:0 0 16px;font-size:0.95rem;line-height:1.5}
input{width:100%;padding:12px 14px;border-radius:14px;border:1px solid rgba(0,0,0,0.12);margin-bottom:12px;font-size:1rem;box-sizing:border-box}
button{width:100%;padding:14px 24px;border:none;border-radius:999px;background:#161616;color:#fff;font-weight:700;cursor:pointer;font-size:1rem;margin-bottom:10px}
.mock-btn{background:linear-gradient(135deg,#ffd438,#ffcb05);color:#161616}
.guide{font-size:0.82rem;color:#8f7044;margin-top:14px}
</style></head><body>
<div class="card">
<h2>Google OAuth 미설정</h2>
<p>GOOGLE_CLIENT_ID가 설정되지 않았거나 placeholder 값입니다.<br>개발/테스트를 위해 Mock 로그인을 사용하세요.</p>
<form method="GET" action="/auth/google/mock">
  <input type="email" name="email" value="developer@localhost" placeholder="이메일" />
  <input type="text" name="name" value="개발자" placeholder="이름" />
  <button type="submit" class="mock-btn">Mock 로그인</button>
</form>
<button type="button" onclick="window.opener?.postMessage({type:'google-auth-result',success:false},'${CLIENT_ORIGIN}');window.close()">닫기</button>
<p class="guide">실제 Google 로그인을 원하면 server/.env 에 실제 클라이언트 ID를 입력하세요.</p>
</div>
</body></html>`
}

const router = Router()

router.get('/auth/google', (_req, res) => {
  if (!CLIENT_ID_CONFIGURED || !CLIENT_SECRET_CONFIGURED) {
    const missing = []
    if (!CLIENT_ID_CONFIGURED) missing.push('GOOGLE_CLIENT_ID')
    if (!CLIENT_SECRET_CONFIGURED) missing.push('GOOGLE_CLIENT_SECRET')
    console.warn('[googleAuth] 설정 누락:', missing.join(', '))
    return res.status(200).send(mockLoginPage())
  }
  const state = crypto.randomBytes(16).toString('hex')
  googleStates.set(state, { createdAt: Date.now() })

  const redirectUri = `${OAUTH_REDIRECT_BASE}/auth/google/callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

router.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query
  if (error) {
    return res.send(resultPage(false, `인증 거부: ${error}`))
  }
  if (!state || !googleStates.has(state)) {
    return res.send(resultPage(false, '잘못된 인증 요청이거나 세션이 만료되었습니다.'))
  }
  googleStates.delete(state)

  const redirectUri = `${OAUTH_REDIRECT_BASE}/auth/google/callback`
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET
      })
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      return res.send(resultPage(false, tokenData.error_description || tokenData.error || '토큰 교환에 실패했습니다.'))
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    const userData = await userRes.json()
    if (!userRes.ok) {
      return res.send(resultPage(false, '사용자 정보를 가져오지 못했습니다.'))
    }

    const user = {
      email: userData.email,
      name: userData.name,
      picture: userData.picture
    }
    const sid = createSession(user)
    res.cookie('v2_session', sid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    })
    res.send(resultPage(true, `${user.name || user.email}님, 환영합니다!`))
  } catch (err) {
    res.send(resultPage(false, `로그인 오류: ${err.message}`))
  }
})

router.get('/auth/google/mock', (req, res) => {
  const email = String(req.query.email || 'developer@localhost').trim()
  const name = String(req.query.name || '개발자').trim()
  const user = { email, name, picture: '' }
  const sid = createSession(user)
  res.cookie('v2_session', sid, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  })
  res.send(resultPage(true, `${name} (${email})님, Mock 로그인 완료!`))
})

router.get('/api/me', (req, res) => {
  const sid = req.cookies?.v2_session
  const user = getSession(sid)
  res.json({ ok: true, user })
})

router.post('/api/logout', (req, res) => {
  const sid = req.cookies?.v2_session
  destroySession(sid)
  res.clearCookie('v2_session', { httpOnly: true, sameSite: 'lax' })
  res.json({ ok: true })
})

export default router
