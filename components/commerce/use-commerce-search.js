'use client';
import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/authed-fetch';

export function useCommerceSearch(query, { group = '', page = 1, limit = 6, enabled = true, active = 'true', categoryId = '', brand = '', tracking = '', stockStatus = '', sort = 'name', refreshKey = 0 } = {}) {
  const [state, setState] = useState({ groups: [], loading: true, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    if (!enabled) return () => controller.abort();
    const timer = setTimeout(async () => {
      setState((old) => ({ ...old, loading: true, error: '' }));
      try {
        const params = new URLSearchParams({ q: query, group, page, limit, active, categoryId, brand, tracking, stockStatus, sort });
        const data = await apiJson(`/api/admin/commerce/search?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) setState({ ...data, loading: false, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setState({ groups: [], loading: false, error: error.message || 'Search unavailable' });
      }
    }, 160);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, group, page, limit, enabled, active, categoryId, brand, tracking, stockStatus, sort, refreshKey]);
  return enabled ? state : { groups: [], loading: false, error: '' };
}
