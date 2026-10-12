import { Link, useLocation } from 'react-router-dom';
import { PlusCircle, CreditCard, Users, BookOpen, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePendingPaymentsCount } from '../../hooks/useApi';

/**
 * Bottom tab bar for phones, in the spirit of the Rive sample's animated bar:
 * a highlight pill that glides between tabs and an icon that lifts when it
 * becomes active. The motion is plain CSS on the icons the app already uses —
 * the sample's own icons are Rive artwork, which is not ours to copy.
 *
 * Hidden from `md` up, where the sidebar takes over. The counter screens live
 * here; everything else is behind More, which opens the same drawer the
 * hamburger does.
 *
 * Roles are respected the same way the sidebar does it, so a staff member
 * sees only the tabs they can actually open: Add, Payment (the lean form that
 * goes to admin for approval) and Customers.
 */

interface BottomNavProps {
  /** Opens the side menu; the More tab is not a route. */
  onMenuClick: () => void;
}

const TABS = [
  { path: '/add-credit', label: 'Add', icon: PlusCircle, adminOnly: false, staffOnly: false },
  { path: '/payment-received', label: 'Payment', icon: CreditCard, adminOnly: true, staffOnly: false },
  { path: '/add-payment', label: 'Payment', icon: CreditCard, adminOnly: false, staffOnly: true },
  { path: '/customers', label: 'Customers', icon: Users, adminOnly: false, staffOnly: false },
  { path: '/day-book', label: 'Day-book', icon: BookOpen, adminOnly: true, staffOnly: false },
]

export function BottomNav({ onMenuClick }: BottomNavProps) {
  const location = useLocation()
  const { isAdmin } = useAuth()
  // Approvals has no tab of its own; the More button carries the count instead.
  const pendingCount = usePendingPaymentsCount(isAdmin).data ?? 0

  const tabs = TABS.filter(tab => (!tab.adminOnly || isAdmin) && (!tab.staffOnly || !isAdmin))
  // More is always last and always present: it is the way to everything else.
  const count = tabs.length + 1
  const activeIndex = tabs.findIndex(tab => location.pathname.startsWith(tab.path))

  return (
    <nav
      aria-label="Primary"
      className="
        md:hidden fixed bottom-0 inset-x-0 z-40
        border-t border-gray-200 dark:border-gray-800
        bg-white/95 dark:bg-gray-900/95 backdrop-blur
        pb-[env(safe-area-inset-bottom)]
      "
    >
      <div className="relative flex">
        {/* The gliding highlight. Positioned by percentage rather than by
            measuring the DOM, so it cannot drift when a tab is hidden by role. */}
        {activeIndex >= 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 bottom-1 rounded-xl bg-primary-50 dark:bg-primary-900/40 transition-all duration-300 ease-out"
            style={{ left: `${(activeIndex * 100) / count}%`, width: `${100 / count}%` }}
          />
        )}

        {tabs.map(tab => {
          const active = location.pathname.startsWith(tab.path)
          const Icon = tab.icon
          return (
            <Link
              key={tab.path}
              to={tab.path}
              aria-current={active ? 'page' : undefined}
              className="relative z-10 flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] focus-ring rounded-xl"
            >
              <Icon
                size={22}
                className={`transition-transform duration-300 ease-out ${
                  active
                    ? '-translate-y-0.5 scale-110 text-primary-600 dark:text-primary-300'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              />
              <span
                className={`text-[11px] leading-none font-medium transition-colors ${
                  active ? 'text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}

        <button
          type="button"
          onClick={onMenuClick}
          aria-label={pendingCount > 0 ? `Open menu, ${pendingCount} payments waiting for approval` : 'Open menu'}
          className="relative z-10 flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] focus-ring rounded-xl"
        >
          <span className="relative">
            <Menu size={22} className="text-gray-500 dark:text-gray-400 transition-transform duration-300 ease-out active:scale-110" />
            {pendingCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -right-2.5 min-w-[1.1rem] px-1 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none text-center tabular-nums ring-2 ring-white dark:ring-gray-900"
              >
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </span>
          <span className="text-[11px] leading-none font-medium text-gray-500 dark:text-gray-400">More</span>
        </button>
      </div>
    </nav>
  )
}
