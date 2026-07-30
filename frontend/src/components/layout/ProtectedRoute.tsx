import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '@/features/auth/useAuth';

export function ProtectedRoute({ children }: { children?: React.ReactNode }) {
  const token = localStorage.getItem('cast_token');
  const { isLoading, isError } = useMe();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg">
        <div className="w-8 h-8 rounded-full border-4 border-border border-t-blue-600 animate-spin" />
      </div>
    );
  }

  if (isError) {
    // Se o token for inválido, a API retornará 401 e o useMe falhará
    localStorage.removeItem('cast_token');
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
