import { z } from "zod";
import type { ValidationKey } from "@/i18n/keys";

// Messages are `validation` namespace keys; the form translates them so they
// follow the active language.
const message = (key: ValidationKey) => ({ message: key });

export const loginSchema = z.object({
  email: z.string().min(1, message("emailRequired")).email(message("emailInvalid")),
  password: z.string().min(1, message("passwordRequired")).min(6, message("passwordMin")),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
