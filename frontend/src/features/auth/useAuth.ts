import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, AUTH_TOKEN_KEY } from '@/lib/api';
import type { LoginResponse, User } from '@/types/api';
import { isFirebaseConfigured, obtainGoogleIdToken } from './firebase';

/** Login methods this deployment offers, as reported by the backend. */
export interface AuthProviders {
  password: boolean;
  google: boolean;
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: Record<string, string>) => {
      const data = await apiClient.post<LoginResponse>('/auth/login', credentials, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        // A 401 here means "wrong credentials", not "session expired" — the
        // form shows the error instead of bouncing through the redirect.
        skipAuthRedirect: true,
      });
      localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

/**
 * Signs in with Google and exchanges the Firebase ID token for a CAST token.
 *
 * The backend decides whether the account is allowed in (invite-only); this
 * hook only carries the proof of identity across.
 */
export function useGoogleLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteToken?: string) => {
      const idToken = await obtainGoogleIdToken();
      const data = await apiClient.post<LoginResponse>(
        '/auth/google',
        { id_token: idToken, invite_token: inviteToken ?? null },
        // A 401/403 here means "not authorised", not "session expired" — the
        // form shows the reason instead of bouncing through the redirect.
        { skipAuthRedirect: true },
      );
      localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

/**
 * Which login methods to show. The backend is authoritative (it knows whether
 * a Firebase project is configured server-side), but the button is only useful
 * when this build also carries a Firebase web config.
 */
export function useAuthProviders() {
  return useQuery<AuthProviders>({
    queryKey: ['auth', 'providers'],
    queryFn: () =>
      apiClient.get<AuthProviders>('/auth/providers', { skipAuthRedirect: true }),
    retry: false,
    staleTime: 5 * 60 * 1000,
    // Password login always exists; assume no Google until told otherwise.
    placeholderData: { password: true, google: false },
    select: (data) => ({ ...data, google: data.google && isFirebaseConfigured }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    queryClient.clear();
  };
}

export function useMe() {
  return useQuery<User>({
    queryKey: ['auth', 'me'],
    // ProtectedRoute already redirects when this fails, so the global 401
    // handler would only duplicate that (and fight it during logout).
    queryFn: () => apiClient.get<User>('/auth/me', { skipAuthRedirect: true }),
    retry: false,
  });
}
