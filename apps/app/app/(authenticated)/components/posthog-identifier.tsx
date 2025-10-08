'use client';

import { useAnalytics } from '@repo/analytics/posthog/client';
import { createClient } from '@repo/auth/client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export const PostHogIdentifier = () => {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const identified = useRef(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const analytics = useAnalytics();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    // Track pageviews
    if (pathname && analytics) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = `${url}?${searchParams.toString()}`;
      }
      analytics.capture('$pageview', {
        $current_url: url,
      });
    }
  }, [pathname, searchParams, analytics]);

  useEffect(() => {
    if (!user || identified.current) {
      return;
    }

    analytics.identify(user.id, {
      email: user.email,
      firstName: user.user_metadata?.first_name,
      lastName: user.user_metadata?.last_name,
      createdAt: user.created_at,
      avatar: user.user_metadata?.avatar_url,
      phoneNumber: user.phone,
    });

    identified.current = true;
  }, [user, analytics]);

  return null;
};