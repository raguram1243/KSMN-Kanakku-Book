import { useCallback, useEffect, useState } from 'react';
import { FollowUp, loadFollowUps } from '../lib/followUps';

export function useFollowUps(): { followUps: FollowUp[]; refresh: () => void } {
  const [followUps, setFollowUps] = useState<FollowUp[]>(() => loadFollowUps());
  const refresh = useCallback(() => setFollowUps(loadFollowUps()), []);
  useEffect(() => {
    window.addEventListener('ksmn:followups-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('ksmn:followups-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);
  return { followUps, refresh };
}
