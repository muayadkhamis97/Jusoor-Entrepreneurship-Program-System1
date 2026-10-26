import { useQuery } from '@tanstack/react-query';

type PublicBranding = {
  brandName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
};

export function usePublicBranding() {
  return useQuery<PublicBranding>({
    queryKey: ['/api/branding'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/branding', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) throw new Error(`Program branding request failed (${response.status}).`);
      return await response.json() as PublicBranding;
    },
  });
}
