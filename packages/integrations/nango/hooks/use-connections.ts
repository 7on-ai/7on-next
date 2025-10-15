'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@repo/auth/client';
import { useToast } from '@repo/design-system/components/ui/use-toast';
import { analytics } from '@repo/analytics/posthog/client';

export interface Connection {
  id: string;
  connectionId: string;
  providerConfigKey: string;
  provider: string;
  status: ConnectionStatus;
  scopes: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  expiresAt?: string;
  errorMessage?: string;
}

export type ConnectionStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REVOKED'
  | 'ERROR'
  | 'PENDING'
  | 'DISCONNECTED';

interface UseConnectionsOptions {
  autoFetch?: boolean;
  refetchInterval?: number;
}

export function useConnections(options: UseConnectionsOptions = {}) {
  const { autoFetch = true, refetchInterval } = options;
  const { user } = useUser();
  const { toast } = useToast();

  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/nango/connections');

      if (!response.ok) {
        throw new Error('Failed to fetch connections');
      }

      const data = await response.json();
      setConnections(data.connections || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Error fetching connections:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const disconnect = useCallback(
    async (connectionId: string) => {
      if (!user?.id) return;

      try {
        const response = await fetch('/api/nango/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId }),
        });

        if (!response.ok) {
          throw new Error('Failed to disconnect');
        }

        setConnections((prev) =>
          prev.map((conn) =>
            conn.connectionId === connectionId
              ? { ...conn, status: 'DISCONNECTED' as ConnectionStatus }
              : conn
          )
        );

        const connection = connections.find((c) => c.connectionId === connectionId);
        if (connection) {
          analytics.capture('Integration Disconnected', {
            integration: connection.providerConfigKey,
            connectionId,
          });
        }

        toast({
          title: 'Disconnected',
          description: 'Integration disconnected successfully',
        });

        await fetchConnections();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: 'Disconnection failed',
          description: message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [user, connections, fetchConnections, toast]
  );

  const refresh = useCallback(
    async (connectionId: string) => {
      if (!user?.id) return;

      try {
        const response = await fetch(`/api/nango/connections/${connectionId}/refresh`, {
          method: 'POST',
        });

        if (!response.ok) {
          throw new Error('Failed to refresh connection');
        }

        toast({
          title: 'Refreshed',
          description: 'Connection refreshed successfully',
        });

        await fetchConnections();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: 'Refresh failed',
          description: message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [user, fetchConnections, toast]
  );

  const getConnectionsByStatus = useCallback(
    (status: ConnectionStatus) => {
      return connections.filter((conn) => conn.status === status);
    },
    [connections]
  );

  const activeConnectionsCount = useCallback(() => {
    return connections.filter((conn) => conn.status === 'ACTIVE').length;
  }, [connections]);

  const isConnected = useCallback(
    (providerConfigKey: string) => {
      return connections.some(
        (conn) =>
          conn.providerConfigKey === providerConfigKey && conn.status === 'ACTIVE'
      );
    },
    [connections]
  );

  const getConnection = useCallback(
    (providerConfigKey: string) => {
      return connections.find((conn) => conn.providerConfigKey === providerConfigKey);
    },
    [connections]
  );

  useEffect(() => {
    if (autoFetch && user?.id) {
      fetchConnections();
    }
  }, [autoFetch, user?.id, fetchConnections]);

  useEffect(() => {
    if (!refetchInterval || !user?.id) return;

    const interval = setInterval(() => {
      fetchConnections();
    }, refetchInterval);

    return () => clearInterval(interval);
  }, [refetchInterval, user?.id, fetchConnections]);

  return {
    connections,
    isLoading,
    error,
    fetchConnections,
    disconnect,
    refresh,
    getConnectionsByStatus,
    activeConnectionsCount,
    isConnected,
    getConnection,
  };
}