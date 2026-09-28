import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it.each([false, true])('preserves a single link child when loading=%s', (isLoading) => {
    const onClick = vi.fn();
    render(
      <Button asChild isLoading={isLoading} onClick={onClick} className="acquisition-link">
        <a href="/app/acquisition"><span>Abrir aquisição</span></a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Abrir aquisição' });
    expect(link).toHaveAttribute('href', '/app/acquisition');
    expect(link).toHaveClass('acquisition-link');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps the native loading button disabled with its spinner and caption', () => {
    render(<Button isLoading>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg')).not.toBeNull();
  });
});
