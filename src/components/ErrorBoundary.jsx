import React from 'react';

const REPORT_KEY = 'bonplan_error_reports';
const LAST_ERROR_KEY = 'bonplan_last_error';
const RETRY_KEY = 'bonplan_error_autoretry';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorId: null,
      copied: false,
      report: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const errorId = Math.random().toString(36).slice(2, 10);
    const report = {
      id: errorId,
      at: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      message: error?.message || String(error),
      stack: error?.stack || '',
      componentStack: errorInfo?.componentStack || '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    };

    // La configuration de prod supprime les console.* (terser drop_console) :
    // on persiste donc le rapport dans localStorage pour pouvoir le recuperer.
    try {
      const previous = JSON.parse(localStorage.getItem(REPORT_KEY) || '[]');
      const list = Array.isArray(previous) ? previous : [];
      localStorage.setItem(REPORT_KEY, JSON.stringify([report, ...list].slice(0, 5)));
      localStorage.setItem(LAST_ERROR_KEY, JSON.stringify(report));
    } catch (_) {}
    try {
      console.error('[ErrorBoundary]', errorId, error, errorInfo);
    } catch (_) {}

    this.setState({ errorId, report });

    // La plupart de ces erreurs sont des courses au chargement : un seul
    // rechargement silencieux suffit. Au-dela, on laisse la page d'erreur
    // (anti-boucle : une seule tentative par fenetre de 10 minutes).
    if (typeof window !== 'undefined') {
      window.setTimeout(() => this.maybeAutoRetry(), 400);
    }
  }

  maybeAutoRetry = () => {
    const now = Date.now();
    let count = 0;
    try {
      const raw = sessionStorage.getItem(RETRY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && now - Number(parsed.at || 0) < 10 * 60 * 1000) {
          count = Number(parsed.count) || 0;
        }
      }
    } catch (_) {}
    if (count >= 1) return false;
    try {
      sessionStorage.setItem(RETRY_KEY, JSON.stringify({ count: count + 1, at: now }));
    } catch (_) {}
    window.location.reload();
    return true;
  };

  handleRetry = () => {
    try {
      sessionStorage.removeItem(RETRY_KEY);
    } catch (_) {}
    window.location.reload();
  };

  handleHome = () => {
    try {
      sessionStorage.removeItem(RETRY_KEY);
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

  handleCopyReport = async () => {
    const { report } = this.state;
    if (!report) return;
    const text = [
      `Référence: ${report.id}`,
      `Date: ${report.at}`,
      `URL: ${report.url}`,
      `Message: ${report.message}`,
      `Stack: ${report.stack}`,
      `Composant: ${report.componentStack}`,
      `Navigateur: ${report.userAgent}`,
    ].join('\n');
    try {
      await navigator.clipboard?.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 1800);
    } catch (_) {}
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { errorId, copied, report, showDetails } = this.state;
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

          {report && (
            <div style={styles.details}>
              <button type="button" className="eb-details-toggle" onClick={() => this.setState({ showDetails: !showDetails })}>
                {showDetails ? 'Masquer les détails techniques' : 'Voir les détails techniques'}
              </button>
              {showDetails && (
                <pre style={styles.pre}>{`${report.message}\n\n${report.componentStack}\n${report.stack}`}</pre>
              )}
              <button type="button" className="eb-details-toggle" onClick={this.handleCopyReport}>
                Copier le rapport d’erreur
              </button>
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
  details: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  pre: {
    width: '100%',
    maxHeight: '180px',
    overflow: 'auto',
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '0.6875rem',
    lineHeight: 1.45,
    color: '#475569',
    background: 'rgba(15,23,42,0.04)',
    border: '1px solid rgba(15,23,42,0.06)',
    borderRadius: '8px',
    padding: '8px',
    margin: 0,
  },
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
  .eb-details-toggle{
    appearance:none; background:none; border:0; padding:2px 4px;
    color:#64748b; font:500 0.75rem inherit; text-decoration:underline;
    text-underline-offset:2px; cursor:pointer;
  }
  .eb-details-toggle:hover{ color:#334155; }
  @media (prefers-color-scheme: dark){
    .eb-btn-ghost{ color:#e2e8f0; background:rgba(15,23,42,.35); border-color:rgba(148,163,184,.18); }
  }
`;
export default ErrorBoundary;
