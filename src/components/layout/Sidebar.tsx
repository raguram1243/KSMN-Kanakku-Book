import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Users, UserCog, CreditCard, Settings, BarChart3, Clock, BookOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';
import { AppLogo } from '../common/AppLogo';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { staff, isAdmin } = useAuth();
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = isHovered || isOpen;

  const navGroups = [
    {
      label: '',
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
      ],
    },
    {
      label: 'Daily',
      items: [
        { path: '/add-credit', label: 'Add Credit Entry', icon: PlusCircle, adminOnly: false },
        { path: '/payment-received', label: 'Payment Received', icon: CreditCard, adminOnly: true },
        { path: '/day-book', label: 'Day-book', icon: BookOpen, adminOnly: true },
        { path: '/follow-ups', label: 'Follow-ups', icon: Clock, adminOnly: true },
      ],
    },
    {
      label: 'Manage',
      items: [
        { path: '/customers', label: 'Customers', icon: Users, adminOnly: false },
        { path: '/reports', label: 'Reports', icon: BarChart3, adminOnly: true },
        { path: '/staff', label: 'Staff', icon: UserCog, adminOnly: true },
        { path: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
      ],
    },
  ];

  const filteredNavGroups = navGroups
    .map(group => ({ ...group, items: group.items.filter(item => !item.adminOnly || isAdmin) }))
    .filter(group => group.items.length > 0);

  // Position of each visible item across all groups, used to stagger the phone drawer entrance.
  const itemOrder = new Map<string, number>();
  filteredNavGroups.forEach(group => group.items.forEach(item => itemOrder.set(item.path, itemOrder.size)));

  const handleNavClick = () => {
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop. Always mounted so it can fade; it ignores taps while closed. */}
      <div
        aria-hidden="true"
        className={`
          fixed inset-0 bg-black/50 z-40 md:hidden
          transition-opacity duration-300 ease-out motion-reduce:transition-none
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 h-screen bg-white border-r border-gray-200 dark:bg-gray-900 dark:border-gray-800 z-50
          transform transition-all duration-300 ease-out md:duration-200 md:ease-in-out max-md:motion-reduce:transition-none
          max-md:rounded-r-3xl max-md:overflow-hidden
          md:translate-x-0 md:z-30
          ${isOpen ? 'translate-x-0 max-md:shadow-2xl' : '-translate-x-full'}
          ${isExpanded ? 'w-60' : 'w-16'}
          lg:w-60
        `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center px-4 py-5 border-b border-gray-200 dark:border-gray-800">
            <AppLogo size="md" />
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
              {filteredNavGroups.map(group => (
                <div key={group.label || 'main'} className={group.label ? 'mt-4 first:mt-0' : ''}>
                  {group.label && (
                    <div
                      className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 ${
                        isExpanded ? 'block' : 'hidden'
                      } lg:block`}
                    >
                      {group.label}
                    </div>
                  )}
                  <div className="space-y-1">
                {group.items.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                // Phones only: fade and slide in after the drawer starts opening, 25ms apart, 200ms at most.
                const staggerDelay = Math.min(50 + (itemOrder.get(item.path) ?? 0) * 25, 200);

                return (
                  <div
                    key={item.path}
                    className={`
                      transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none
                      ${isOpen ? '' : 'max-md:opacity-0 max-md:-translate-x-2'}
                    `}
                    style={isOpen ? { transitionDelay: `${staggerDelay}ms` } : undefined}
                  >
                  <Link
                    to={item.path}
                    onClick={handleNavClick}
                    className={`
                      relative flex items-center ${isExpanded ? 'justify-start' : 'justify-center'} lg:justify-start px-3 py-2.5 max-md:min-h-[44px] rounded-lg max-md:rounded-full text-sm font-medium transition-all duration-200
                      ${isActive
                        ? 'text-primary-700 dark:text-primary-300 max-md:bg-primary-50 max-md:dark:bg-primary-900/40 md:bg-primary-100 md:dark:bg-primary-900'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                      }
                    `}
                    title={item.label}
                  >
                    {/* Left accent bar for active indicator. Hidden on phones, where the filled pill marks it. */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 max-md:hidden bg-primary-600 rounded-r transition-all duration-200" />
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
                  </div>
                );
                })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          {/* Signed-in user. Refresh, theme and logout live only in the top nav. */}
          <div
            className={`border-t border-gray-200 dark:border-gray-800 px-6 py-4 ${isExpanded ? 'block' : 'hidden'} lg:block`}
          >
            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{staff?.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{staff?.role}</div>
          </div>
        </div>
      </aside>
    </>
  );
}