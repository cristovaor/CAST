import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useApplyTheme } from '@/app/hooks/useApplyTheme';
import { Toaster } from '@/components/feedback/Toaster';
import { toast, toErrorMessage } from '@/app/stores/useToastStore';

export function Providers({ children }: { children: ReactNode }) {
  useApplyTheme();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Safety net: a mutation that defines no onError of its own surfaces a
        // toast instead of failing silently. Opt out per-mutation with
        // `meta: { skipGlobalErrorToast: true }`.
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.options.meta?.skipGlobalErrorToast) return;
            if (mutation.options.onError) return;
            toast.error('Não foi possível concluir a ação', toErrorMessage(error));
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
