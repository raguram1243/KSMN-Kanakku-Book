export function getOverdueThreshold(
  customerType: string,
  customOverdueDays: number | null,
  settingsMap: Record<string, number>
): number {
  if (customOverdueDays != null) return customOverdueDays

  const key = `overdue_days_${customerType.replace('-', '')}`
  return settingsMap[key] ?? 30
}

export function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}