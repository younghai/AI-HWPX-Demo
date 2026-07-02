import { useEffect, useState } from 'react'

const ENV_KEY_BY_PROVIDER = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  kimi: 'KIMI_API_KEY',
  xai: 'XAI_API_KEY'
}

export function ProviderSettings({ open, providers, aiProvider, setAiProvider, refreshProviders, onClose }) {
  const [aiApiKey, setAiApiKey] = useState('')
  const [testResult, setTestResult] = useState('')
  const [authMode, setAuthMode] = useState('apikey')
  const [oauthStep, setOauthStep] = useState(0)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  function envKeyFor(providerKey) {
    return ENV_KEY_BY_PROVIDER[providerKey]
  }

  async function handleApiKeyConnect(provider) {
    const envKey = envKeyFor(provider.key)
    if (!aiApiKey) { setTestResult('API 키를 입력해 주세요.'); return }
    setTestResult('연결 확인 중...')
    const testRes = await fetch('/api/test-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: provider.key, apiKey: aiApiKey })
    })
    const testData = await testRes.json()
    if (!testData.ok) { setTestResult(`연결 실패: ${testData.error}`); return }
    const saveRes = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [envKey]: aiApiKey })
    })
    const saveData = await saveRes.json()
    if (saveData.ok) {
      setTestResult(`${provider.label} 연결 완료!`)
      setAiApiKey('')
      refreshProviders()
    } else {
      setTestResult(saveData.error)
    }
  }

  async function handleDisconnect(provider) {
    const envKey = envKeyFor(provider.key)
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [envKey]: '' })
    })
    if (res.ok) {
      setTestResult('')
      refreshProviders()
    }
  }

  function handleOauthConnect(provider) {
    setTestResult('로그인 페이지로 이동 중...')
    setOauthStep(1)
    const popup = window.open(
      `/auth/${provider.key}`,
      `oauth-${provider.key}`,
      'width=600,height=700,left=200,top=100'
    )
    let popupHandled = false
    const handler = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'oauth-result') {
        window.removeEventListener('message', handler)
        clearInterval(checkClosed)
        popupHandled = true
        setOauthStep(0)
        if (event.data.success) {
          setTestResult(`${provider.label} OAuth 연결 완료!`)
          refreshProviders()
        } else {
          setTestResult('OAuth 인증에 실패했습니다.')
        }
      }
    }
    window.addEventListener('message', handler)
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed)
        window.removeEventListener('message', handler)
        if (!popupHandled) {
          setTestResult('로그인 창이 닫혔습니다.')
          setOauthStep(0)
        }
      }
    }, 500)
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="provider-settings-title">AI 연결 관리</h2>
          <button className="modal-close" type="button" aria-label="닫기" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="modal-desc">사용할 AI 프로바이더를 연결하세요. API 키 직접 입력 또는 OAuth 인증을 선택할 수 있습니다.</p>
          <div className="oauth-provider-list">
            {providers.map((p) => {
              const isActive = aiProvider === p.key
              return (
                <div key={p.key} className={`oauth-card ${p.configured ? 'is-connected' : ''} ${isActive ? 'is-active' : ''}`}>
                  <div className="oauth-card-top">
                    <div>
                      <strong className="oauth-card-name">{p.label}</strong>
                      <span className="oauth-card-model">{p.defaultModel}</span>
                    </div>
                    {p.configured ? (
                      <div className="oauth-card-actions">
                        <span className="oauth-badge connected">연결됨</span>
                        <button className="oauth-use-btn" type="button" onClick={() => setAiProvider(p.key)}>
                          {isActive ? '사용 중' : '사용'}
                        </button>
                        <button className="oauth-reset-btn" type="button" onClick={() => handleDisconnect(p)}>
                          연결 해제
                        </button>
                      </div>
                    ) : (
                      <button className="oauth-connect-btn" type="button" onClick={() => {
                        setAiProvider(p.key); setAiApiKey(''); setTestResult(''); setAuthMode('apikey'); setOauthStep(0)
                      }}>연결하기</button>
                    )}
                  </div>
                  {isActive && !p.configured && (
                    <div className="oauth-card-form">
                      <div className="auth-mode-tabs">
                        <button
                          className={`auth-tab ${authMode === 'apikey' ? 'is-active' : ''}`}
                          type="button"
                          onClick={() => { setAuthMode('apikey'); setOauthStep(0); setTestResult('') }}
                        >API 키 입력</button>
                        <button
                          className={`auth-tab ${authMode === 'oauth' ? 'is-active' : ''}`}
                          type="button"
                          onClick={() => { setAuthMode('oauth'); setOauthStep(1); setTestResult('') }}
                        >OAuth 인증</button>
                      </div>

                      {authMode === 'apikey' && (
                        <>
                          <input
                            type="password"
                            value={aiApiKey}
                            onChange={(e) => setAiApiKey(e.target.value)}
                            placeholder={`${p.label} API 키를 입력하세요`}
                          />
                          <div className="button-row">
                            <button className="primary-button" type="button" onClick={() => handleApiKeyConnect(p)}>
                              인증 및 연결
                            </button>
                          </div>
                        </>
                      )}

                      {authMode === 'oauth' && (
                        <div className="oauth-login-section">
                          {p.oauthSupported ? (
                            <>
                              <p className="oauth-login-desc">{p.label} 계정으로 로그인하여 자동으로 연결합니다. 별도의 API 키 입력이 필요하지 않습니다.</p>
                              <button className="oauth-login-btn" type="button" onClick={() => handleOauthConnect(p)}>
                                {oauthStep === 1 ? '로그인 진행 중...' : `${p.label} 계정으로 로그인`}
                              </button>
                            </>
                          ) : (
                            <div className="oauth-not-available">
                              <p>OAuth 연결을 사용하려면 서버에 OAuth 자격증명을 설정해야 합니다.</p>
                              <div className="oauth-setup-guide">
                                <p><strong>설정 방법:</strong></p>
                                <code>.env</code> 파일에 아래 값을 추가하세요:
                                <pre className="oauth-env-example">
{p.key === 'openai' ? `OPENAI_CLIENT_ID=your-client-id\nOPENAI_CLIENT_SECRET=your-secret` :
 p.key === 'kimi' ? `KIMI_CLIENT_ID=your-client-id\nKIMI_CLIENT_SECRET=your-secret` :
 `# ${p.label}은 현재 OAuth를 지원하지 않습니다.\n# API 키 입력 방식을 사용해 주세요.`}
                                </pre>
                              </div>
                              <p className="oauth-fallback-hint">또는 "API 키 입력" 탭에서 직접 키를 입력할 수 있습니다.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {isActive && testResult && <p className="oauth-card-status">{testResult}</p>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
