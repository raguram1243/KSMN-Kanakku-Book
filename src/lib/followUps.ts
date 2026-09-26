export type FollowUpStatus = 'open' | 'done' | 'dismissed';

export interface FollowUp {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  customer_phone: string | null;
  /** Outstanding balance snapshot when the follow-up was created. */
  amount: number;
  promised_date: string | null; // YYYY-MM-DD
  note: string;
  status: FollowUpStatus;
  created_by: string | null;
  created_at: string; // ISO
  updated_at: string; // ISO
}

const KEY = 'ksmn_followups_v1';

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function loadFollowUps(): FollowUp[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAll(list: FollowUp[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('ksmn:followups-changed'));
}

export function addFollowUp(input: Omit<FollowUp, 'id' | 'created_at' | 'updated_at' | 'status'> & { status?: FollowUpStatus }): FollowUp {
  const now = new Date().toISOString();
  const item: FollowUp = {
    id: uid(),
    status: 'open',
    created_at: now,
    updated_at: now,
    ...input,
  } as FollowUp;
  const list = loadFollowUps();
  list.unshift(item);
  saveAll(list);
  return item;
}

export function updateFollowUp(id: string, patch: Partial<FollowUp>): FollowUp | null {
  const list = loadFollowUps();
  const i = list.findIndex((f) => f.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, updated_at: new Date().toISOString() };
  saveAll(list);
  return list[i];
}

export function deleteFollowUp(id: string): void {
  saveAll(loadFollowUps().filter((f) => f.id !== id));
}

export function openFollowUpsCount(list: FollowUp[]): number {
  return list.filter((f) => f.status === 'open').length;
}

/** Open follow-ups with a promise date today or earlier, sorted oldest promise first. */
export function dueFollowUps(list: FollowUp[], today = new Date()): FollowUp[] {
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return list
    .filter((f) => f.status === 'open' && f.promised_date && f.promised_date <= key)
    .sort((a, b) => (a.promised_date || '').localeCompare(b.promised_date || ''));
}
