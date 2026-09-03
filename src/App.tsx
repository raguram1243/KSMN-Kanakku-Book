import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ApiProvider } from './hooks/useApi';
import { useDailyBackup } from './hooks/useDailyBackup';
import { Suspense, lazy } from 'react';
import { Skeleton, SkeletonCard } from './components/ui/Skeleton';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { SettingsPage } from './pages/SettingsPage';
import { debugLog } from './lib/utils';

const QuickAddPage = lazy(() => import('./pages/QuickAddPage'));
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'));
const PaymentReceivedPage = lazy(() => import('./pages/PaymentReceivedPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ReportLayout = lazy(() => import('./components/reports/ReportLayout'));
const ReportEntriesPage = lazy(() => import('./pages/ReportEntriesPage'));
const ReportPaymentsPage = lazy(() => import('./pages/ReportPaymentsPage'));

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonCard>
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </SkeletonCard>
      <SkeletonCard>
        <Skeleton className="h-6 w-32 mb-4" />
        <Skeleton className="h-4 w-full" />
      </SkeletonCard>
    </div>
  );
}

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { staff, loading, isAdmin } = useAuth();

  if (loading) {
    debugLog('[Route] Loading...');
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!staff) {
    debugLog('[Route] No staff in context, checking localStorage fallback');
    const storedStaff = localStorage.getItem('ksmn_staff');
    const storedToken = localStorage.getItem('ksmn_token');
    debugLog('[Route] localStorage fallback - staff:', !!storedStaff, 'token:', !!storedToken);
    
    if (storedStaff && storedToken) {
      try {
        const payload = JSON.parse(atob(storedToken.split('.')[1]));
        const now = Date.now();
        const exp = payload.exp * 1000;
        debugLog('[Route] localStorage token valid:', exp > now);
        if (exp > now) {
          debugLog('[Route] localStorage has valid session but context is stale - this is a bug');
        }
      } catch (e) {
        debugLog('[Route] localStorage token parse error:', e);
      }
    }
    
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    debugLog('[Route] Access denied - adminOnly route but staff role is:', staff.role);
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-600 dark:text-gray-400">Access denied. Admin only.</div>
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { staff, loading } = useAuth();

  // Admin-only: pulls one Summary-report CSV per calendar day, per device.
  useDailyBackup();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={staff ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute adminOnly>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/add-credit"
        element={
          <ProtectedRoute>
            <Suspense fallback={<PageSkeleton />}>
              <QuickAddPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedRoute>
            <CustomersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers/:id"
        element={
          <ProtectedRoute>
            <Suspense fallback={<PageSkeleton />}>
              <CustomerDetailPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute adminOnly>
            <Suspense fallback={<PageSkeleton />}>
              <ReportLayout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        <Route index element={<ReportsPage />} />
        <Route path="entries" element={<ReportEntriesPage />} />
        <Route path="payments" element={<ReportPaymentsPage />} />
      </Route>
      <Route
        path="/payment-received"
        element={
          <ProtectedRoute adminOnly>
            <Suspense fallback={<PageSkeleton />}>
              <PaymentReceivedPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payment-received/:customerId"
        element={
          <ProtectedRoute adminOnly>
            <Suspense fallback={<PageSkeleton />}>
              <PaymentReceivedPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payment-received/:customerId/edit/:paymentId"
        element={
          <ProtectedRoute adminOnly>
            <Suspense fallback={<PageSkeleton />}>
              <PaymentReceivedPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff"
        element={
          <ProtectedRoute adminOnly>
            <StaffManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute adminOnly>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ApiProvider>
          <Router>
            <AppRoutes />
          </Router>
        </ApiProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
