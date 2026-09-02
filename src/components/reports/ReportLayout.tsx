import { useLocation, NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/reports', label: 'Summary' },
  { to: '/reports/entries', label: 'Credit Entries' },
  { to: '/reports/payments', label: 'Payments Received' },
];

export function ReportLayout() {
  const { pathname } = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Per-customer summary and global transaction ledgers.
        </p>
      </div>

      <nav className="flex gap-1 border-b border-gray-200 dark:border-gray-800" aria-label="Report sections">
        {tabs.map(tab => {
          const isActive =
            tab.to === '/reports'
              ? pathname === '/reports' || pathname === '/reports/'
              : pathname.startsWith(tab.to);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                  : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </NavLink>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}

export default ReportLayout;