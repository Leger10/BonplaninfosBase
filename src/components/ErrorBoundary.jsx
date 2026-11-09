import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorId: null,
      copied: false,
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const errorId = Math.random().toString(36).slice(2, 10);
    this.setState({ errorId });
    try {
      console.error('[ErrorBoundary]', errorId, error, errorInfo);
    } catch (_) {}
  }

  handleRetry = () => {
    try {
      sessionStorage.removeItem('error_boundary_autoreloads');
    } catch (_) {}
    window.location.reload();
  };

  handleHome = () => {
    try {
      sessionStorage.removeItem('error_boundary_autoreloads');
    } catch (_) {}
    window.location.assign('/');
  };

  handleCopyId = async () => {
    const { errorId } = this.state;
    if (!errorId) return;
    try {
      await navigator.clipboard?.writeText(errorId);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 1800);
    } catch (_) {}
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { errorId, copied } = this.state;
    return (
      <div style={styles.page}>
        <style>{css}</style>
        <div style={styles.ambient} aria-hidden="true" />
        <div style={styles.card} role="alert" aria-live="polite">
          <div style={styles.iconWrap} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 3.5l8.66 15H3.34L12 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M12 10v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="12" cy="16.9" r="1" fill="currentColor" />
            </svg>
          </div>

          <h1 style={styles.title}>Un imprévu est survenu</h1>
          <p style={styles.text}>
            Cette page n’a pas pu s’afficher correctement. Vous pouvez réessayer ou revenir à l’accueil en toute sécurité.
          </p>

          <div style={styles.actions}>
            <button type="button" className="eb-btn eb-btn-primary" onClick={this.handleRetry}>
              Réessayer
            </button>
            <button type="button" className="eb-btn eb-btn-ghost" onClick={this.handleHome}>
              Retour à l’accueil
            </button>
          </div>

          {errorId && (
            <div style={styles.meta}>
              <span style={styles.metaLabel}>Référence</span>
              <button type="button" className="eb-id" onClick={this.handleCopyId} title="Copier la référence">
                {errorId}
              </button>
              <span style={styles.copied}>{copied ? 'Copié' : ''}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },
  ambient: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(600px 300px at 20% 10%, rgba(99,102,241,0.10), transparent 60%), radial-gradient(500px 260px at 85% 90%, rgba(14,165,233,0.10), transparent 60%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    width: '100%',
    maxWidth: '440px',
    background: 'rgba(255,255,255,0.82)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(255,255,255,0.9)',
    boxShadow: '0 20px 50px -20px rgba(15,23,42,0.18), 0 2px 8px -2px rgba(15,23,42,0.06)',
    borderRadius: '20px',
    padding: '32px 28px 24px',
    textAlign: 'center',
  },
  iconWrap: {
    width: '56px',
    height: '56px',
    margin: '0 auto 16px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#4f46e5',
    background: 'linear-gradient(180deg, rgba(99,102,241,0.12), rgba(99,102,241,0.06))',
    border: '1px solid rgba(99,102,241,0.12)',
  },
  title: {
    margin: 0,
    fontSize: '1.375rem',
    lineHeight: 1.25,
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: '#0f172a',
  },
  text: {
    margin: '10px auto 0',
    maxWidth: '340px',
    fontSize: '0.9375rem',
    lineHeight: 1.55,
    color: '#475569',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    marginTop: '22px',
    flexWrap: 'wrap',
  },
  meta: {
    marginTop: '18px',
    paddingTop: '14px',
    borderTop: '1px solid rgba(15,23,42,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  metaLabel: { color: '#94a3b8' },
  copied: { minWidth: '36px', color: '#10b981', fontWeight: 500 },
};

const css = `
  .eb-btn{
    appearance:none; border:1px solid transparent; border-radius:12px;
    padding:10px 16px; font-size:0.875rem; font-weight:600; cursor:pointer;
    transition:transform .12s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease;
    font-family:inherit;
  }
  .eb-btn:active{ transform:translateY(1px); }
  .eb-btn-primary{
    color:#fff; background:#4f46e5;
    box-shadow:0 8px 18px -8px rgba(79,70,229,.55);
  }
  .eb-btn-primary:hover{ background:#4338ca; }
  .eb-btn-ghost{
    color:#334155; background:rgba(255,255,255,.7);
    border-color:rgba(15,23,42,.10);
  }
  .eb-btn-ghost:hover{ background:#fff; border-color:rgba(15,23,42,.16); }
  .eb-id{
    appearance:none; background:rgba(15,23,42,.04); border:1px solid rgba(15,23,42,.06);
    color:#64748b; border-radius:8px; padding:3px 8px; font:500 0.75rem ui-monospace, SFMono-Regular, Menlo, monospace;
    cursor:pointer; transition:background .12s ease, color .12s ease;
  }
  .eb-id:hover{ background:rgba(15,23,42,.07); color:#334155; }
  @media (prefers-color-scheme: dark){
    .eb-btn-ghost{ color:#e2e8f0; background:rgba(15,23,42,.35); border-color:rgba(148,163,184,.18); }
  }
`;
export default ErrorBoundary;
