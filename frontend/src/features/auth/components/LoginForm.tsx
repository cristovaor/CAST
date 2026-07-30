import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, AlertCircle, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert, AlertDescription } from "@/components/ui/Alert";
import { loginSchema, type LoginFormValues } from "../schemas/loginSchema";
import { useAuthProviders, useGoogleLogin, useLogin } from "../useAuth";
import { SignInCancelled } from "../firebase";

/** Google's mark, inlined so the button needs no external asset. */
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.57Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.540-2.02-6.45-4.74H1.71v2.98A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.18a6.9 6.9 0 0 1 0-4.36V6.84H1.71a11.51 11.51 0 0 0 0 10.32l3.84-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.26 15.1.5 12 .5A11.5 11.5 0 0 0 1.71 6.84l3.84 2.98C6.46 7.1 9 4.75 12 4.75Z"
      />
    </svg>
  );
}

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginMutation = useLogin();
  const googleMutation = useGoogleLogin();
  const { data: providers } = useAuthProviders();

  // Present when the user followed an invitation link. Passing it through lets
  // the backend match the invite even if the address was re-assigned.
  const inviteToken = searchParams.get("token") ?? undefined;

  // Set by the API client when a 401 interrupts a session: return the user to
  // the page they were on. Only same-origin paths are honoured.
  const rawFrom = searchParams.get("from");
  const redirectTo = rawFrom && rawFrom.startsWith("/") && !rawFrom.startsWith("//")
    ? rawFrom
    : "/app";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setLoginError(null);
    try {
      // Trying API login
      await loginMutation.mutateAsync({
        username: values.email, // Fastapi OAuth2 uses username for email
        password: values.password,
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      // Surface the real reason in every environment: silently redirecting to
      // /app on failure used to hide backend outages and bad credentials alike.
      const message = err instanceof Error && err.message
        ? err.message
        : "E-mail ou senha inválidos. Verifique suas credenciais e tente novamente.";
      setLoginError(message);
    }
  };

  const onGoogleSignIn = async () => {
    setLoginError(null);
    try {
      await googleMutation.mutateAsync(inviteToken);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      // Closing the popup is a deliberate user action, not a failure.
      if (err instanceof SignInCancelled) return;
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível entrar com o Google. Tente novamente.";
      setLoginError(message);
    }
  };

  const googleBusy = googleMutation.isPending;
  const passwordBusy = isSubmitting || loginMutation.isPending;

  return (
    <div className="w-full max-w-[420px] mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-text-primary">Acesse sua conta</h2>
        <p className="text-sm text-text-muted mt-2">
          Entre para gerenciar estudos, vídeos e processamentos.
        </p>
      </div>

      {loginError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loginError}</AlertDescription>
        </Alert>
      )}

      {providers?.google && (
        <div className="mb-6">
          <Button
            type="button"
            variant="outline"
            className="w-full text-base py-5 gap-2"
            onClick={onGoogleSignIn}
            disabled={googleBusy || passwordBusy}
          >
            {googleBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <GoogleIcon />
                Entrar com Google
              </>
            )}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-surface px-2 text-text-muted">ou continue com e-mail</span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className={errors.email ? "text-red-500" : ""}>E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            {...register("email")}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={errors.email ? "border-red-500 focus-visible:ring-red-500" : ""}
          />
          {errors.email && (
            <p id="email-error" className="text-xs text-red-500 font-medium">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className={errors.password ? "text-red-500" : ""}>Senha</Label>
            <span className="text-xs text-text-muted">Recuperação disponível pelo administrador</span>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••"
              {...register("password")}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              className={errors.password ? "border-red-500 focus-visible:ring-red-500 pr-10" : "pr-10"}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary focus:outline-none"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-xs text-red-500 font-medium">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="remember"
            {...register("remember")}
            className="h-4 w-4 rounded border-border-strong text-blue-600 focus:ring-blue-600"
          />
          <Label htmlFor="remember" className="text-sm font-normal text-text-secondary cursor-pointer">
            Manter conectado
          </Label>
        </div>

        <Button
          type="submit"
          className="w-full text-base py-5"
          disabled={passwordBusy || googleBusy}
        >
          {passwordBusy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            "Entrar no CAST Pro"
          )}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-border">
        <div className="flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
          <div className="flex items-center gap-1 font-medium text-text-secondary">
            <Lock className="h-3 w-3" />
            Ambiente seguro
          </div>
          <p className="text-center">
            Acesso restrito a pesquisadores, administradores e equipes autorizadas.
          </p>
          <p className="mt-1">Política de Privacidade · Termos de Uso</p>
        </div>
      </div>
    </div>
  );
}
