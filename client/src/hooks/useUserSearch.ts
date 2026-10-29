import { useEffect, useState } from 'react';
import { api } from '../api';
import type { UserProfile } from '../types/models';

export function useUserSearch(query: string, enabled = true) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || query.trim().length < 2) {
      setUsers([]);
      setError('');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.users.search(query.trim());
        if (active) { setUsers(result.users); setError(''); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Не вдалося виконати пошук');
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, enabled]);

  return { users, loading, error };
}
