// ============================================
// Confidence Badge
// ============================================
// Small badge showing confidence percentage for a field.

import { Badge } from '../ui/Badge';

interface ConfidenceBadgeProps {
  confidence: number;
  showLabel?: boolean;
}

export function ConfidenceBadge({ confidence, showLabel = false }: ConfidenceBadgeProps) {
  const percentage = Math.round(confidence * 100);
  
  let variant: 'success' | 'warning' | 'danger' = 'success';
  if (confidence < 0.5) variant = 'danger';
  else if (confidence < 0.8) variant = 'warning';

  return (
    <Badge variant={variant} className="text-xs">
      {percentage}%{showLabel ? ' confidence' : ''}
    </Badge>
  );
}