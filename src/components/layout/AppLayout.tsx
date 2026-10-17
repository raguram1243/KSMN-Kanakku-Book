import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Toaster } from '../ui/Toaster';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const online = useOnlineStatus();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopNav onMenuClick={() => setSidebarOpen(true)} />
      {!online && (
        <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
          <WifiOff size={16} />
          Offline: showing the last loaded data. Saving is turned off until you reconnect.
        </div>
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      {/* Main content - shifted right on desktop to accommodate collapsed sidebar */}
      <main className="md:ml-16 lg:ml-60 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        <div key={location.pathname} className="page-enter">
          {children}
        </div>
      </main>

      <BottomNav onMenuClick={() => setSidebarOpen(true)} />

      <Toaster />
    </div>
  );
}
