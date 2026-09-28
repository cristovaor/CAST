import { useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, AlertCircle, ArrowUpFromLine, MailCheck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert, AlertDescription } from "@/components/ui/Alert";
import type { ValidationKey } from "@/i18n/keys";
import { cn } from "@/lib/utils";
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

/** Icon + text, so an error is not signalled by colour alone. */
function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-xs font-medium text-danger dark:text-red-400">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

const invalidInput = "border-danger focus-visible:ring-danger dark:border-red-400";

export function LoginForm() {
  const { t } = useTranslation("auth");
  const { t: tv } = useTranslation("validation");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
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
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setLoginError(null);
    try {
      await loginMutation.mutateAsync({
        username: values.email, // Fastapi OAuth2 uses username for email
        password: values.password,
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      // Surface the real reason in every environment: silently redirecting to
      // /app on failure used to hide backend outages and bad credentials alike.
      const message = err instanceof Error && err.message ? err.message : t("invalidCredentials");
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
      const message = err instanceof Error && err.message ? err.message : t("google.failed");
      setLoginError(message);
    }
  };

  const googleBusy = googleMutation.isPending;
  const passwordBusy = isSubmitting || loginMutation.isPending;
  const busy = googleBusy || passwordBusy;

  const passwordField = register("password");
  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState?.("CapsLock") ?? false);
  };

  const errorText = (message?: string) => (message ? tv(message as ValidationKey) : null);
  const passwordDescribedBy = [
    errors.password && "password-error",
    capsLock && "password-capslock",
    "password-hint",
  ].filter(Boolean).join(" ");

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">{t("title")}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t("subtitle")}</p>
      </div>

      {inviteToken && !loginError && (
        <Alert className="mb-6 border-primary-border bg-primary-light text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 [&>svg]:text-primary dark:[&>svg]:text-blue-300">
          <MailCheck className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{t("invite")}</AlertDescription>
        </Alert>
      )}

      {loginError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{loginError}</AlertDescription>
        </Alert>
      )}

      {providers?.google && (
        <div className="mb-6">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full gap-2 text-base"
            onClick={onGoogleSignIn}
            disabled={busy}
            isLoading={googleBusy}
          >
            {googleBusy ? t("google.connecting") : (
              <>
                <GoogleIcon />
                {t("google.signIn")}
              </>
            )}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-surface px-2 text-text-secondary">{t("divider")}</span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" aria-busy={busy} noValidate>
        <div className="space-y-2">
          <Label htmlFor="email" className={cn(errors.email && "text-danger dark:text-red-400")}>
            {t("email.label")}
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder={t("email.placeholder")}
            {...register("email")}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={cn("h-11", errors.email && invalidInput)}
          />
          {errors.email && <FieldError id="email-error">{errorText(errors.email.message)}</FieldError>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className={cn(errors.password && "text-danger dark:text-red-400")}>
            {t("password.label")}
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder={t("password.placeholder")}
              {...passwordField}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
              onBlur={(event) => {
                setCapsLock(false);
                void passwordField.onBlur(event);
              }}
              aria-invalid={!!errors.password}
              aria-describedby={passwordDescribedBy}
              className={cn("h-11 pr-11", errors.password && invalidInput)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={t("password.show")}
              aria-pressed={showPassword}
              aria-controls="password"
              title={showPassword ? t("password.hide") : t("password.show")}
              className="absolute right-0.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-primary"
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          {errors.password && (
            <FieldError id="password-error">{errorText(errors.password.message)}</FieldError>
          )}
          <div aria-live="polite">
            {capsLock && (
              <p
                id="password-capslock"
                className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
              >
                <ArrowUpFromLine className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t("password.capsLock")}
              </p>
            )}
          </div>
          <p id="password-hint" className="text-xs text-text-secondary">
            {t("password.forgot")}
          </p>
        </div>

        <Button type="submit" className="h-11 w-full text-base" disabled={busy} isLoading={passwordBusy}>
          {passwordBusy ? t("submitting") : t("submit")}
        </Button>
      </form>

      <div className="mt-8 border-t border-border pt-6">
        <div className="flex flex-col items-center justify-center gap-2 text-xs text-text-secondary">
          <div className="flex items-center gap-1 font-medium text-text-primary">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {t("secure.title")}
          </div>
          <p className="text-center">{t("secure.note")}</p>
        </div>
      </div>
    </div>
  );
}
