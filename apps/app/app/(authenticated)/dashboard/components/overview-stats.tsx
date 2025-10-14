'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/design-system/components/ui/card';
import { useConnections } from '@repo/integrations/nango/hooks/use-connections';
import { ActivityIcon, PlugIcon, SparklesIcon } from 'lucide-react';
import { useSubscription } from '@repo/auth/hooks/use-subscription';

interface UsageSummary {
  apiCalls: number;
  connections: number;
  year: number;
  month: number;
}

export function OverviewStats() {
  const { activeConnectionsCount } = useConnections();
  const { tier } = useSubscription();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const response = await fetch('/api/usage/summary');
        if (response.ok) {
          const data = await response.json();
          setUsage(data);
        }
      } catch (error) {
        console.error('Failed to fetch usage:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsage();
  }, []);

  const stats = [
    {
      title: 'Active Connections',
      value: isLoading ? '...' : activeConnectionsCount(),
      icon: PlugIcon,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-950',
    },
    {
      title: 'API Calls',
      value: isLoading ? '...' : usage?.apiCalls || 0,
      icon: ActivityIcon,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-950',
    },
    {
      title: 'Current Plan',
      value: tier,
      icon: SparklesIcon,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-950',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}