'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/design-system/components/ui/card';
import { ActivityIcon, CheckCircle2Icon, PlugIcon, XCircleIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Activity {
  id: string;
  type: 'connection' | 'disconnection' | 'api_call';
  description: string;
  timestamp: string;
  status: 'success' | 'error';
}

export function RecentActivity() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const response = await fetch('/api/activity/recent');
        if (response.ok) {
          const data = await response.json();
          setActivities(data.activities || []);
        }
      } catch (error) {
        console.error('Failed to fetch activity:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchActivity();
  }, []);

  const getIcon = (type: Activity['type']) => {
    switch (type) {
      case 'connection':
        return PlugIcon;
      case 'disconnection':
        return XCircleIcon;
      case 'api_call':
        return ActivityIcon;
      default:
        return ActivityIcon;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Your latest integration activity</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : activities.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No recent activity</div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const Icon = getIcon(activity.type);
              return (
                <div key={activity.id} className="flex items-start gap-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{activity.description}</p>
                      {activity.status === 'success' ? (
                        <CheckCircle2Icon className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircleIcon className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}