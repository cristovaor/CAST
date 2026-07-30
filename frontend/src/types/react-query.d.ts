import '@tanstack/react-query';

// Types the `meta` bag used by the global mutation error handler in
// app/providers.tsx, so opting out is checked at compile time.
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Suppresses the global error toast for this mutation. */
      skipGlobalErrorToast?: boolean;
    };
  }
}
