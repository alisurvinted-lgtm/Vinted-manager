import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { VaultGate } from "./components/VaultGate";
import "./styles.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal-error">
          <h1>Votre espace n’a pas pu s’ouvrir.</h1>
          <p>
            Vérifiez que ce navigateur autorise le stockage local et que votre
            appareil dispose d’espace libre. Utilisez une fenêtre de navigation
            normale.
          </p>
          <p>
            N’effacez pas les données du site si vous souhaitez conserver vos
            articles.
          </p>
          <button className="button primary" onClick={() => location.reload()}>
            Réessayer
          </button>
        </main>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <VaultGate>
        <App />
      </VaultGate>
    </ErrorBoundary>
  </StrictMode>,
);
