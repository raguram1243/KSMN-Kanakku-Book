/**
 * Where each role lands after login and on `/`.
 *
 * Staff can only search / add customers, add credit entries and add payments
 * (which wait for admin approval), so they land on Add Credit Entry. Admin
 * keeps the dashboard.
 */
export function homePathFor(role: string | null | undefined): string {
  return role === 'admin' ? '/dashboard' : '/add-credit';
}
