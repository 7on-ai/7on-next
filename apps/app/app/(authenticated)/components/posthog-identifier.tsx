'use client';

import { useAnalytics } from '@repo/analytics/posthog/client';
import { createClient } from '@repo/auth/client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';

export const PostHogIdentifier = () => {
  const [user, setUser] = useState<User | null>(null);
  const identified = useRef(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const analytics = useAnalytics();
  const supabase = createClient();

  // Get user data
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Track pageviews
  useEffect(() => {
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

  // Identify user
  useEffect(() => {
    if (!user || identified.current) {
      return;
    }

    analytics.identify(user.id, {
      email: user.email,
      name: user.user_metadata?.name || user.user_metadata?.full_name,
      createdAt: user.created_at,
      avatar: user.user_metadata?.avatar_url,
      phoneNumber: user.phone,
    });

    identified.current = true;
  }, [user, analytics]);

  return null;
};