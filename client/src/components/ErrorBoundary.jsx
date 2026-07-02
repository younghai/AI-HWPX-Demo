import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: '2rem', fontFamily: 'system-ui, sans-serif', color: '#1e293b'
        }}>
          <div style={{
            maxWidth: '480px', textAlign: 'center',
            padding: '2rem', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca'
          }}>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', color: '#dc2626' }}>
              예상치 못한 오류가 발생했습니다
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#64748b' }}>
              {this.state.error?.message || '알 수 없는 오류'}
            </p>
            <button
              type="button"
              onClick={() => { this.setState({ hasError: false, error: null }) }}
              style={{
                padding: '0.5rem 1.5rem', borderRadius: '8px', border: 'none',
                background: '#2563eb', color: '#fff', fontSize: '0.875rem', cursor: 'pointer'
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
