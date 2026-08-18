import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { Toaster } from '../ui/Toaster';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopNav onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      {/* Main content - shifted right on desktop to accommodate collapsed sidebar */}
      <main className="md:ml-16 lg:ml-60 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div key={location.pathname} className="page-enter">
          {children}
        </div>
      </main>

      <Toaster />
    </div>
  );
}
