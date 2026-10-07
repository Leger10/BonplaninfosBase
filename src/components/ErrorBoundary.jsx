import React from 'react';

const spinnerStyles = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  flexDirection: 'column',
  backgroundColor: '#f9fafb',
};

const messages = [
  "Chargement en cours, patientez...",
  "Nous récupérons vos informations...",
  "Préparation de votre espace...",
  "Plus que quelques secondes...",
  "Finalisation en cours...",
  "Vous allez être redirigé...",
];

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      messageIndex: 0,
      errorId: null,
      countdown: 10,  // Compteur de secondes avant rechargement
      autoStopped: false
    };
    this.interval = null;
    this.countdownInterval = null;
    this.reloadTimer = null;
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error("ErrorBoundary caught an error:", error);
      console.error("ErrorInfo:", errorInfo);
    }
    
    const errorId = Math.random().toString(36).substring(2, 10);
    this.setState({ errorId });
  }

  componentDidUpdate(prevProps, prevState) {
    if (!prevState.hasError && this.state.hasError) {
      // Rotation des messages toutes les 2 secondes
      if (!this.interval) {
        this.interval = setInterval(() => {
          this.setState(prev => ({
            messageIndex: (prev.messageIndex + 1) % messages.length
          }));
        }, 2000);
      }
      
      // Compteur dégressif
      if (!this.countdownInterval) {
        this.countdownInterval = setInterval(() => {
          this.setState(prev => ({
            countdown: prev.countdown - 1
          }));
        }, 1000);
      }
      
      // Rechargement automatique après 10 secondes (limité : anti-boucle)
      if (!this.reloadTimer) {
        this.reloadTimer = setTimeout(() => {
          const KEY = "error_boundary_autoreloads";
          let n = 0;
          try { n = Number(sessionStorage.getItem(KEY) || 0) || 0; } catch (e) { n = 0; }
          if (n < 3) {
            try { sessionStorage.setItem(KEY, String(n + 1)); } catch (e) {}
            window.location.reload();
          } else {
            this.setState({ autoStopped: true, countdown: 0 });
          }
        }, 10000);
      }
    }
  }

  componentWillUnmount() {
    if (this.interval) clearInterval(this.interval);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
  }

  handleManualReload = () => {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    // Un rechargement manuel relance les tentatives automatiques.
    try { sessionStorage.removeItem("error_boundary_autoreloads"); } catch (e) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={spinnerStyles}>
          <style>{`
            .error-spinner {
              width: 80px;
              height: 80px;
              border-radius: 50%;
              border: 4px solid #e5e7eb;
              border-top-color: #3b82f6;
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            .error-title {
              margin-top: 24px;
              font-size: 1.25rem;
              font-weight: 600;
              color: #1f2937;
              font-family: sans-serif;
            }
            .error-message {
              margin-top: 12px;
              color: #6b7280;
              font-family: sans-serif;
              font-size: 0.875rem;
              text-align: center;
              max-width: 300px;
              min-height: 60px;
              transition: opacity 0.3s ease;
            }
            .countdown {
              margin-top: 16px;
              font-size: 0.875rem;
              color: #9ca3af;
              font-family: monospace;
            }
            .error-id {
              margin-top: 8px;
              color: #9ca3af;
              font-size: 0.75rem;
              font-family: monospace;
            }
            .reload-button {
              margin-top: 24px;
              padding: 10px 20px;
              background-color: #3b82f6;
              color: white;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              font-size: 0.875rem;
              font-weight: 500;
              transition: background-color 0.2s;
            }
            .reload-button:hover {
              background-color: #2563eb;
            }
            .progress-bar {
              margin-top: 20px;
              width: 200px;
              height: 4px;
              background-color: #e5e7eb;
              border-radius: 2px;
              overflow: hidden;
            }
            .progress-fill {
              height: 100%;
              background-color: #3b82f6;
              width: 0%;
              animation: progress 10s linear forwards;
            }
            @keyframes progress {
              from { width: 0%; }
              to { width: 100%; }
            }
          `}</style>
          <div className="error-spinner"></div>
          <h1 className="error-title">Récupération en cours</h1>
          <p className="error-message">{messages[this.state.messageIndex]}</p>
          <div className="countdown">
            {this.state.autoStopped
              ? "Rechargement automatique suspendu (trop de tentatives)."
              : `Rechargement automatique dans ${this.state.countdown} secondes`}
          </div>
          <div className="progress-bar">
            <div className="progress-fill"></div>
          </div>
          {this.state.errorId && (
            <p className="error-id">ID d'erreur : {this.state.errorId}</p>
          )}
          <button className="reload-button" onClick={this.handleManualReload}>
            Recharger maintenant
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;