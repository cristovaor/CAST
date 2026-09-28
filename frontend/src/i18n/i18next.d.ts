import 'i18next';
import type { ptBR } from './locales/pt-BR';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof ptBR;
    returnNull: false;
  }
}
