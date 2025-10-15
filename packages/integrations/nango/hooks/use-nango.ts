'use client';

import { useState, useCallback } from 'react';
import { useUser } from '@repo/auth/client';
import { toast } from '@repo/design-system/components/ui/use-toast';
import { analytics } from '@repo/analytics/posthog/client';
import type { IntegrationKey } from '../config';

interface NangoAuthOptions {
  providerConfigKey: IntegrationKey;
  connectionId?: string;
  params?: Record<string, string>;
}

interface NangoSessionResponse {
  token: string;
  expiresAt: string;
}

export function useNango() {
  const { user } = useUser();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSessionToken = useCallback(
    async (providerConfigKey: string): Promise<string> => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const response = await fetch('/api/nango/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerConfigKey,
          connectionId: user.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create session token');
      }

      const data: NangoSessionResponse = await response.json();
      return data.token;
    },
    [user]
  );

  const connect = useCallback(
    async ({ providerConfigKey, connectionId, params }: NangoAuthOptions) => {
      setIsConnecting(true);
      setError(null);

      try {
        analytics.capture('Integration Connection Initiated', {
          integration: providerConfigKey,
          source: 'dashboard',
        });

        // Get session token from backend
        const sessionToken = await getSessionToken(providerConfigKey);

        // Dynamically import Nango SDK
        const { default: Nango } = await import('@nangohq/frontend');

        // ✅ สร้าง Nango instance (ไม่ต้องส่ง config ถ้าใช้ default)
        const nango = new Nango();

        // ✅ เปิด Connect UI พร้อม session token
        return new Promise<void>((resolve, reject) => {
          nango.openConnectUI({
            sessionToken: sessionToken, // ✅ ส่ง sessionToken ตรงนี้
            onEvent: (event: any) => {
              console.log('Nango event:', event);

              // ✅ Event type ใหม่คือ 'connect' ไม่ใช่ 'connect.success'
              if (event.type === 'connect') {
                toast.success(
                  'Connection successful',
                  `Successfully connected to ${providerConfigKey}`
                );

                analytics.capture('Integration Connected', {
                  integration: providerConfigKey,
                  connectionId: event.payload?.connectionId || connectionId,
                });

                resolve();
              } else if (event.type === 'error') {
                const errorMessage = event.payload?.error || 'Connection failed';
                setError(errorMessage);

                toast.error('Connection failed', errorMessage);

                analytics.capture('Integration Connection Failed', {
                  integration: providerConfigKey,
                  error: errorMessage,
                });

                reject(new Error(errorMessage));
              } else if (event.type === 'close') {
                // UI ถูกปิด (อาจถูก cancel หรือสำเร็จแล้ว)
                console.log('Connect UI closed');
              }
            },
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);

        toast.error('Connection error', message);

        analytics.capture('Integration Connection Failed', {
          integration: providerConfigKey,
          error: message,
        });

        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [getSessionToken]
  );

  const isAvailable = useCallback(async () => {
    try {
      await import('@nangohq/frontend');
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    connect,
    isConnecting,
    error,
    isAvailable,
  };
}