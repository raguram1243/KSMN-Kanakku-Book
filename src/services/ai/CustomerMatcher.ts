// ============================================
// Customer Matcher (Client-side helper)
// ============================================
// Handles customer matching logic on the frontend.
// Uses the matches returned from the edge function
// and provides UI helpers.

import type { CustomerMatch } from './types';

export class CustomerMatcher {
  /**
   * Find the best match from a list of customer matches
   */
  static getBestMatch(matches: CustomerMatch[]): CustomerMatch | null {
    if (matches.length === 0) return null;

    // Sort by match score descending
    const sorted = [...matches].sort((a, b) => b.match_score - a.match_score);
    return sorted[0];
  }

  /**
   * Get exact matches only
   */
  static getExactMatches(matches: CustomerMatch[]): CustomerMatch[] {
    return matches.filter((m) => m.match_type === 'exact');
  }

  /**
   * Get similar matches only
   */
  static getSimilarMatches(matches: CustomerMatch[]): CustomerMatch[] {
    return matches.filter((m) => m.match_type === 'similar');
  }

  /**
   * Check if there's a high-confidence exact match
   */
  static hasHighConfidenceMatch(matches: CustomerMatch[]): boolean {
    const exactMatches = this.getExactMatches(matches);
    return exactMatches.some((m) => m.match_score >= 0.9);
  }

  /**
   * Get match type label for display
   */
  static getMatchTypeLabel(matchType: 'exact' | 'similar' | 'none'): string {
    switch (matchType) {
      case 'exact':
        return 'Exact Match';
      case 'similar':
        return 'Similar Match';
      default:
        return 'No Match';
    }
  }

  /**
   * Get match type badge variant
   */
  static getMatchTypeVariant(matchType: 'exact' | 'similar' | 'none'): 'success' | 'warning' | 'danger' {
    switch (matchType) {
      case 'exact':
        return 'success';
      case 'similar':
        return 'warning';
      default:
        return 'danger';
    }
  }

  /**
   * Format match score as percentage
   */
  static formatMatchScore(score: number): string {
    return `${Math.round(score * 100)}%`;
  }
}