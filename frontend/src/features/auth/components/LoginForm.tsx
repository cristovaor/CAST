import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, AlertCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert, AlertDescription } from "@/components/ui/Alert";
import { loginSchema, type LoginFormValues } from "../schemas/loginSchema";
import { useLogin } from "../useAuth";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const navigate = useNavigate();
  const loginMutation = useLogin();

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
      navigate("/app");
    } catch (err) {
      console.error(err);
      // Fallback redirect se a API estiver mockada e falhar (para não travar a tela)
      // O prompt diz "Não quebrar a autenticação existente", se já mocka, manter fallback ou exibir erro real.
      // O comportamento antigo da LoginPage simplesmente redirecionava: window.location.href = '/app';
      if (import.meta.env.DEV) {
         navigate("/app"); // Fallback for dev if API is down
      } else {
         setLoginError("E-mail ou senha inválidos. Verifique suas credenciais e tente novamente.");
      }
    }
  };

  return (
    <div className="w-full max-w-[420px] mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Acesse sua conta</h2>
        <p className="text-sm text-slate-500 mt-2">
          Entre para gerenciar estudos, vídeos e processamentos.
        </p>
      </div>

      {loginError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loginError}</AlertDescription>
        </Alert>
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
            <span className="text-xs text-slate-500">Recuperação disponível pelo administrador</span>
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
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
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          <Label htmlFor="remember" className="text-sm font-normal text-slate-600 cursor-pointer">
            Manter conectado
          </Label>
        </div>

        <Button
          type="submit"
          className="w-full text-base py-5"
          disabled={isSubmitting || loginMutation.isPending}
        >
          {isSubmitting || loginMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            "Entrar no CAST Pro"
          )}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-100">
        <div className="flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-1 font-medium text-slate-600">
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
