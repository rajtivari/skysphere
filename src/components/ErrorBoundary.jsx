import { Component } from 'react';

// If anything downstream throws — a WebGL context loss, a bad API shape we
// didn't anticipate, whatever — this catches it and shows a calm fallback
// instead of a blank white screen. This is the "no error" safety net.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // In production you'd send this to logging; here we just keep it from
    // reaching the user as a broken page.
    console.error('SkySphere caught an error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'linear-gradient(180deg,#1d5fd6,#cfe4f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 12,
            fontFamily: 'Inter, sans-serif', color: '#fff', textAlign: 'center', padding: 24,
          }}
        >
          <div style={{ fontSize: 40 }}>☁</div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, margin: 0 }}>
            The sky glitched for a second.
          </h1>
          <p style={{ opacity: 0.85, maxWidth: 360, margin: 0 }}>
            Something didn't load right. Refreshing usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: '10px 20px', borderRadius: 100, border: 'none',
              background: '#fff', color: '#1d5fd6', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
