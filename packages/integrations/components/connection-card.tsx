'use client';

import { Button } from '@repo/design-system/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/design-system/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/design-system/components/ui/dropdown-menu';
import { cn } from '@repo/design-system/lib/utils';
import {
  CheckCircle2Icon,
  MoreVerticalIcon,
  RefreshCwIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';
import * as Icons from 'lucide-react';
import type { Connection } from '../nango/hooks/use-connections';

interface ConnectionCardProps {
  connection: Connection;
  onDisconnect: (connectionId: string) => void;
  onRefresh?: (connectionId: string) => void;
}

const STATUS_CONFIG = {
  ACTIVE: {
    icon: CheckCircle2Icon,
    label: 'Connected',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-950',
  },
  EXPIRED: {
    icon: XCircleIcon,
    label: 'Expired',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-950',
  },
  REVOKED: {
    icon: XCircleIcon,
    label: 'Revoked',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-950',
  },
  ERROR: {
    icon: XCircleIcon,
    label: 'Error',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-950',
  },
  PENDING: {
    icon: RefreshCwIcon,
    label: 'Pending',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-950',
  },
  DISCONNECTED: {
    icon: XCircleIcon,
    label: 'Disconnected',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-950',
  },
};

/**
 * Connection Card Component
 * Display a connected service with status and actions
 */
export function ConnectionCard({
  connection,
  onDisconnect,
  onRefresh,
}: ConnectionCardProps) {
  const statusConfig = STATUS_CONFIG[connection.status];
  const StatusIcon = statusConfig.icon;

  // Get icon from provider name (fallback to Plug)
  const IconComponent =
    Icons[`${connection.provider}Icon` as keyof typeof Icons] || Icons.PlugIcon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <IconComponent className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{connection.provider}</CardTitle>
            <CardDescription className="text-xs">
              Connected {new Date(connection.createdAt).toLocaleDateString()}
            </CardDescription>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVerticalIcon className="h-4 w-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onRefresh && (
              <DropdownMenuItem
                onClick={() => onRefresh(connection.connectionId)}
              >
                <RefreshCwIcon className="mr-2 h-4 w-4" />
                Refresh
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onDisconnect(connection.connectionId)}
              className="text-destructive"
            >
              <Trash2Icon className="mr-2 h-4 w-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        <div
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
            statusConfig.bgColor,
            statusConfig.color
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {statusConfig.label}
        </div>
      </CardContent>
    </Card>
  );
}