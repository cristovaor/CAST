import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/app/stores/useThemeStore';

export function ThemeToggle() {
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const toggle = useThemeStore((state) => state.toggle);
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
    >
      {isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}
