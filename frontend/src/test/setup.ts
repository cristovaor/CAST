import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import i18n from '@/i18n';

// jsdom reports an English browser; the suite asserts on the pt-BR copy, so
// pin the language unless a test switches it on purpose.
beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});
