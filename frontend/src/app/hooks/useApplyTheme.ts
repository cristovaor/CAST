import { useEffect } from 'react';
import {
  type ResolvedTheme,
  useThemeStore,
} from '@/app/stores/useThemeStore';

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

export function useApplyTheme() {
  const mode = useThemeStore((state) => state.mode);
  const setResolvedTheme = useThemeStore((state) => state.setResolvedTheme);

  useEffect(() => {
    const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);

    const applyTheme = () => {
      const resolvedTheme: ResolvedTheme =
        mode === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : mode;

      document.documentElement.setAttribute('data-theme', resolvedTheme);
      document.documentElement.style.colorScheme = resolvedTheme;
      setResolvedTheme(resolvedTheme);
    };

    applyTheme();

    if (mode !== 'system') return;

    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [mode, setResolvedTheme]);
}
