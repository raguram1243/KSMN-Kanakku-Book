import { Badge } from '../ui/Badge';

interface PaymentStatusBadgeProps {
  status?: string | null;
  className?: string;
}

/**
 * Marks a staff payment that does not count yet (pending) or never will
 * (rejected). Approved and legacy payments render nothing.
 */
export function PaymentStatusBadge({ status, className = '' }: PaymentStatusBadgeProps) {
  if (status === 'pending') {
    return <Badge variant="warning" className={className}>Pending approval</Badge>;
  }
  if (status === 'rejected') {
    return <Badge variant="danger" className={className}>Rejected</Badge>;
  }
  return null;
}
