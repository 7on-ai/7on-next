'use client';

import { useSubscription } from '@repo/auth/hooks/use-subscription';
import { OverviewStats } from './overview-stats';
import { IntegrationsSection } from './integrations-section';
import { RecentActivity } from './recent-activity';
import { Button } from '@repo/design-system/components/ui/button';
import { SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import type { SubscriptionTier } from '@repo/auth/client;

interface DashboardClientProps {
  initialTier: SubscriptionTier;
}

export function DashboardClient({ initialTier }: DashboardClientProps) {
  const { tier, isFree } = useSubscription();

  return (
    <div className="space-y-6">
      {/* Upgrade Banner */}
      {isFree() && (
        <div className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 dark:border-blue-800 dark:from-blue-950 dark:to-cyan-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <SparklesIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold">Upgrade to unlock more integrations</h3>
                <p className="text-sm text-muted-foreground">
                  Get access to Slack, Airtable, Notion and more with Pro plan
                </p>
              </div>
            </div>
            <Button asChild>
              <Link href="/pricing">
                <SparklesIcon className="mr-2 h-4 w-4" />
                View Plans
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Overview Stats */}
      <OverviewStats />

      {/* Integrations */}
      <IntegrationsSection />

      {/* Recent Activity */}
      <RecentActivity />
    </div>
  );
}