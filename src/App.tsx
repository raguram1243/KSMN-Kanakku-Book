import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { QuickAddPage } from './pages/QuickAddPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { RecordPaymentPage } from './pages/RecordPaymentPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { SettingsPage } from './pages/SettingsPage';
import { debugLog } from './lib/utils';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { staff, loading, isAdmin } = useAuth();

  if (loading) {
    debugLog('[Route] Loading...');
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
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
        <div className="text-gray-600">Access denied. Admin only.</div>
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { staff, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
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
            <QuickAddPage />
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
            <CustomerDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/record-payment"
        element={
          <ProtectedRoute adminOnly>
            <RecordPaymentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/record-payment/:customerId"
        element={
          <ProtectedRoute adminOnly>
            <RecordPaymentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/record-payment/:customerId/edit/:paymentId"
        element={
          <ProtectedRoute adminOnly>
            <RecordPaymentPage />
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
        <Router>
          <AppRoutes />
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}
