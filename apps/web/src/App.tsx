import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoginView } from "./components/auth/LoginView";
import { NetworkProvider, useNetworkContext } from "./contexts/NetworkContext";
import { loginUser } from "./services/auth.service";
import { NetworkView } from "./pages/NetworkView";
import { EnvironmentView } from "./pages/EnvironmentView";
import type { LoginResponse } from "./types/domain";

function EnvironmentPanel({ token }: { token: string }) {
  const { selectedEnvironmentId, environmentOptions } = useNetworkContext();

  return (
    <EnvironmentView
      environmentId={selectedEnvironmentId}
      environmentOptions={environmentOptions}
      token={token}
    />
  );
}

export function App() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("ana.ribeiro@diel.example");
  const [senha, setSenha] = useState("dev-only-change-me");
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<
    LoginResponse["data"]["user"] | null
  >(null);
  const [authError, setAuthError] = useState<string | null>(null);

  async function handleLogin() {
    try {
      setAuthError(null);
      const response = await loginUser(email, senha);
      setToken(response.data.accessToken);
      setCurrentUser(response.data.user);
    } catch {
      setAuthError("Nao foi possivel autenticar.");
    }
  }

  function handleLogout() {
    setToken(null);
    setCurrentUser(null);
    queryClient.clear();
  }

  if (!token) {
    return (
      <LoginView
        email={email}
        senha={senha}
        authError={authError}
        onEmailChange={setEmail}
        onSenhaChange={setSenha}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <header className="rounded-2xl bg-diel-hero px-6 py-5 text-white shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Celsius 360</h1>
            <p className="mt-1 text-sm text-white/90 sm:text-base">
              Gestao inteligente de temperatura em tempo real
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-right">
              <p className="text-xs text-white/80">Usuario logado</p>
              <p className="text-sm font-semibold">
                {currentUser?.nome ?? "-"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="h-10 rounded-xl border border-white/40 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <NetworkProvider token={token}>
        <main className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
          <section className="min-h-[420px]">
            <NetworkView />
          </section>
          <section className="xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:self-start">
            <EnvironmentPanel token={token} />
          </section>
        </main>
      </NetworkProvider>
    </div>
  );
}
