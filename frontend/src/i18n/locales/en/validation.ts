import type ptValidation from '../pt-BR/validation';
import type { Translation } from '../../types';

const validation = {
  required: 'This field is required.',
  emailRequired: 'Email is required.',
  emailInvalid: 'Enter a valid email address.',
  passwordRequired: 'Password is required.',
  passwordMin: 'Password must be at least 6 characters.',
} satisfies Translation<typeof ptValidation>;

export default validation;
