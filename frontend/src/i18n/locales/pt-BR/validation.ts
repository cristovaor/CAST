/**
 * Zod schemas store these keys as their messages; forms render them with
 * `t(message)` so a validation error follows the active language.
 */
const validation = {
  required: 'Campo obrigatório.',
  emailRequired: 'O e-mail é obrigatório.',
  emailInvalid: 'Formato de e-mail inválido.',
  passwordRequired: 'A senha é obrigatória.',
  passwordMin: 'A senha deve ter no mínimo 6 caracteres.',
};

export default validation;
