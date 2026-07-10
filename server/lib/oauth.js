import { createTtlStore } from './ttlStore.js'
import { popupResultPage } from './popupPage.js'

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const oauthStates = createTtlStore(OAUTH_STATE_TTL_MS)

export function rememberState(state, providerKey) {
  oauthStates.set(state, { provider: providerKey })
}

export function consumeState(state) {
  return state ? oauthStates.take(state) : null
}

export function oauthResultPage(success, message, clientOrigin) {
  return popupResultPage({
    title: 'OAuth 인증',
    successHeading: '연결 완료',
    failHeading: '연결 실패',
    success,
    message,
    postMessageType: 'oauth-result',
    origin: clientOrigin
  })
}
