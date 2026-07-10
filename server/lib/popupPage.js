import { escapeXml } from '../../shared/escape.js'

// OAuth 팝업 결과 페이지 공통 골격 (SPEC-P3-c). lib/oauth.js(프로바이더 연결)와
// routes/googleAuth.js(로그인)에 2벌 복붙돼 있던 HTML — 제목·헤딩·postMessage
// type 만 달랐다. 인라인 script/onclick 은 /auth 전용 완화 CSP(spec-11) 하에서
// 동작하며, message 는 escapeXml 을 거친다(title/heading/type/origin 은 서버
// 상수만 온다).
export function popupResultPage({ title, successHeading, failHeading, success, message, postMessageType, origin }) {
  const heading = success ? successHeading : failHeading
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f6f1e7}
.card{background:#fff;border-radius:24px;padding:40px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.1);max-width:400px}
.icon{font-size:48px;margin-bottom:16px}
h2{margin:0 0 12px;color:#161616}
p{color:#74716a;margin:0 0 20px}
button{padding:12px 24px;border:none;border-radius:999px;background:#161616;color:#fff;font-weight:700;cursor:pointer;font-size:1rem}
</style></head><body>
<div class="card">
<div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
<h2>${heading}</h2>
<p>${escapeXml(message)}</p>
<button onclick="window.opener?.postMessage({type:'${postMessageType}',success:${success}},'${origin}');window.close()">닫기</button>
</div>
<script>window.opener?.postMessage({type:'${postMessageType}',success:${success}},'${origin}')</script>
</body></html>`
}
