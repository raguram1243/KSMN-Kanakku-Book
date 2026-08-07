import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Users, UserCog, CreditCard, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { staff, logout, isAdmin } = useAuth();
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = isHovered || isOpen;

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
    { path: '/add-credit', label: 'Add Credit', icon: PlusCircle, adminOnly: false },
    { path: '/record-payment', label: 'Record Payment', icon: CreditCard, adminOnly: true },
    { path: '/customers', label: 'Customers', icon: Users, adminOnly: false },
    { path: '/staff', label: 'Staff', icon: UserCog, adminOnly: true },
    { path: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
  ];

  const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  const handleNavClick = () => {
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 h-screen bg-white border-r border-gray-200 dark:bg-gray-900 dark:border-gray-800 z-50
          transform transition-all duration-200 ease-in-out
          md:translate-x-0 md:z-30
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isExpanded ? 'w-60' : 'w-16'}
          lg:w-60
        `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center px-4 py-5 border-b border-gray-200 dark:border-gray-800">
            <img src="/KSMN_logo.png" alt="KSMN Logo" className="h-8 w-8 object-contain flex-shrink-0" />
            <span className={`
              ml-3 text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap
              transition-opacity duration-200
              ${isExpanded ? 'opacity-100' : 'opacity-0 invisible'}
              lg:opacity-100 lg:visible
            `}>
              KSMN Kanakku-Book
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            <div className="space-y-1 px-3">
              {filteredNavItems.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={handleNavClick}
                    className={`
                      relative flex items-center ${isExpanded ? 'justify-start' : 'justify-center'} lg:justify-start px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                      ${isActive
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                      }
                    `}
                    title={item.label}
                  >
                    {/* Left accent bar for active indicator */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-primary-600 rounded-r transition-all duration-200" />
                    )}
                    <Icon size={20} className="flex-shrink-0" />
                    <span className={`
                      ml-3 whitespace-nowrap
                      transition-opacity duration-200
                      ${isExpanded ? 'opacity-100' : 'opacity-0 invisible'}
                      lg:opacity-100 lg:visible
                    `}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* User section at bottom */}
          <div className="border-t border-gray-200 dark:border-gray-800 px-3 py-4">
            <div className={`flex items-center ${isExpanded ? 'justify-between' : 'justify-center'} lg:justify-between px-3 py-2`}>
              <div className={`
                flex-1 min-w-0
                transition-opacity duration-200
                ${isExpanded ? 'opacity-100' : 'opacity-0 invisible'}
                lg:opacity-100 lg:visible
              `}>
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {staff?.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {staff?.role}
                </div>
              </div>
              <button
                onClick={logout}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 flex-shrink-0"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}