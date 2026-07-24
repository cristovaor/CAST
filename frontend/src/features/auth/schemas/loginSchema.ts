import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, { message: "O e-mail é obrigatório." }).email({
    message: "Formato de e-mail inválido.",
  }),
  password: z.string().min(1, { message: "A senha é obrigatória." }).min(6, {
    message: "A senha deve ter no mínimo 6 caracteres.",
  }),
  remember: z.boolean().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
