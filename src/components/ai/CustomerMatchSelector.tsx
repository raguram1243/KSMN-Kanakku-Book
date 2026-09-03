// ============================================
// Customer Match Selector
// ============================================
// Component for selecting a customer from AI matches
// or creating a new one.

import { CustomerMatch } from '../../services/ai/types';
import { CustomerMatcher } from '../../services/ai/CustomerMatcher';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface CustomerMatchSelectorProps {
  matches: CustomerMatch[];
  selectedId: string | null;
  onSelect: (match: CustomerMatch) => void;
  onCreateNew: () => void;
  showCreateOption: boolean;
}

export function CustomerMatchSelector({
  matches,
  selectedId,
  onSelect,
  onCreateNew,
  showCreateOption,
}: CustomerMatchSelectorProps) {
  const exactMatches = CustomerMatcher.getExactMatches(matches);
  const similarMatches = CustomerMatcher.getSimilarMatches(matches);

  return (
    <div className="space-y-4">
      {/* Exact Matches */}
      {exactMatches.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Exact Matches</h4>
          <div className="space-y-2">
            {exactMatches.map((match) => (
              <div
                key={match.id}
                onClick={() => onSelect(match)}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedId === match.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{match.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {match.customer_code} • {match.phone}
                    </div>
                  </div>
                  <Badge variant={CustomerMatcher.getMatchTypeVariant(match.match_type)}>
                    {CustomerMatcher.formatMatchScore(match.match_score)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Similar Matches */}
      {similarMatches.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Similar Matches</h4>
          <div className="space-y-2">
            {similarMatches.map((match) => (
              <div
                key={match.id}
                onClick={() => onSelect(match)}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedId === match.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{match.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {match.customer_code} • {match.phone}
                    </div>
                  </div>
                  <Badge variant={CustomerMatcher.getMatchTypeVariant(match.match_type)}>
                    {CustomerMatcher.formatMatchScore(match.match_score)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Matches - Create New */}
      {matches.length === 0 && showCreateOption && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">No matching customer found</p>
          <Button variant="secondary" size="sm" onClick={onCreateNew}>
            + Create New Customer
          </Button>
        </div>
      )}
    </div>
  );
}