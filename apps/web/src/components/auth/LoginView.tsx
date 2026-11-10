import { SvgFilter } from "../svg/SvgFilter";
import { AnimatedGradients } from "./AnimatedGradients";

type Props = {
  email: string;
  senha: string;
  authError: string | null;
  onEmailChange: (value: string) => void;
  onSenhaChange: (value: string) => void;
  onLogin: () => void;
};

export function LoginView({
  email,
  senha,
  authError,
  onEmailChange,
  onSenhaChange,
  onLogin,
}: Props) {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_1fr]">
        <section className="relative isolate overflow-hidden bg-diel-hero bg-hero-size animate-diel-gradient px-10 py-16 text-white sm:px-16 md:min-h-screen lg:flex lg:flex-col lg:justify-center">
          <SvgFilter />
          <AnimatedGradients />
          <div className="mx-auto w-full max-w-md relative z-10 lg:max-w-lg">
            <p className="mb-4 text-3xl font-semibold leading-tight sm:text-5xl">
              Bem-vindo ao
            </p>
            <img
              src="/brand/celsius-white.svg"
              alt="Celsius 360"
              className="h-auto w-64 sm:w-72"
            />
            <p className="mt-24 text-sm font-medium text-white/90">
              Powered by
            </p>
            <img
              src="/brand/diel-negative.svg"
              alt="diel"
              className="mt-2 h-7 w-auto"
            />
          </div>
        </section>

        <section className="flex flex-col justify-between px-6 py-10 sm:px-12 lg:px-14">
          <div className="flex justify-center lg:justify-end">
            <img
              src="/brand/diel-dark.svg"
              alt="diel"
              className="h-12 w-auto"
            />
          </div>

          <div className="mx-auto w-full max-w-xl">
            <h2 className="mb-7 text-5xl font-medium leading-none text-black">
              Entrar
            </h2>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-diel-navy">
                  E-mail
                </span>
                <input
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  className="h-14 w-full rounded-xl border border-diel-line px-4 text-lg outline-none transition focus:border-diel-cyan"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-diel-navy">
                  Senha
                </span>
                <input
                  type="password"
                  value={senha}
                  onChange={(event) => onSenhaChange(event.target.value)}
                  className="h-14 w-full rounded-xl border border-diel-line px-4 text-lg outline-none transition focus:border-diel-cyan"
                />
              </label>
            </div>
            <button
              onClick={onLogin}
              className="mt-5 h-14 w-full rounded-xl bg-diel-ink text-lg font-bold tracking-wide text-white transition hover:brightness-110"
            >
              LOGIN
            </button>
            <a
              href="#"
              className="mt-4 inline-block text-sm font-semibold text-[#2e4cff] underline"
            >
              Esqueci minha senha
            </a>
            {authError ? (
              <p className="mt-4 text-sm font-medium text-red-600">
                {authError}
              </p>
            ) : null}
          </div>

          <footer className="mt-10 text-center text-xs text-slate-500 lg:text-right">
            <a href="#" className="font-semibold text-[#2e4cff] underline">
              Politica de Privacidade
            </a>
            <p className="mt-2">
              © 2026 Celsius 360 Todos os direitos reservados.
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
}
