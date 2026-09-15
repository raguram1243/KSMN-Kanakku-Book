import { Link } from 'react-router-dom';
import { Menu, LogOut, RefreshCw, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface TopNavProps {
  onMenuClick: () => void;
}

export function TopNav({ onMenuClick }: TopNavProps) {
  const { staff, logout } = useAuth();

  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-800 md:ml-16 lg:ml-60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-4">
            {/* Hamburger menu button - mobile only */}
            <button
              onClick={onMenuClick}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
              title="Open menu"
            >
              <Menu size={24} />
            </button>

            {/* Logo + Title */}
                        <Link to="/dashboard" className="flex items-center space-x-2">
              <img src="/KSMN_logo.png" alt="KSMN Logo" className="h-7 sm:h-8 w-8 object-contain flex-shrink-0" />
              <span className="hidden sm:inline text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">KSMN Kanakku-Book</span>
              <span className="sm:hidden text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">KSMN</span>
            </Link>

            {/* SiteFlow link */}
            <a
              href="https://ksmn-siteflow.web.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors"
            >
              Switch to SiteFlow
            </a>
          </div>

          {/* User info + actions */}
          <div className="flex items-center space-x-3">
                        <span className="hidden md:inline text-sm text-gray-700 dark:text-gray-300">
              {staff?.name} <span className="text-gray-500 dark:text-gray-400">({staff?.role})</span>
            </span>
            <button
              onClick={() => window.location.reload()}
                            className="inline-flex p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
            <button
              onClick={toggleTheme}
                            className="inline-flex p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={logout}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
