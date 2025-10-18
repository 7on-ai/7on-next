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

export function useNango() {
  const { user } = useUser();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSessionToken = useCallback(
    async (providerConfigKey: string): Promise<string> => {
      if (!user?.id) throw new Error('User not authenticated');

      const res = await fetch('/api/nango/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerConfigKey }),
      });

      const data = await res.json();
      if (!res.ok || !data?.token) throw new Error('Failed to create session token');

      console.log('✅ Session token:', data.token);
      return data.token;
    },
    [user]
  );

  const connect = useCallback(
    async ({ providerConfigKey }: NangoAuthOptions) => {
      setIsConnecting(true);
      setError(null);

      try {
        analytics.capture('Integration Connection Initiated', {
          integration: providerConfigKey,
          source: 'dashboard',
        });

        const { default: Nango } = await import('@nangohq/frontend');
        const nango = new Nango(); // ✅ ไม่มี public_key แล้ว

        const connectUI = nango.openConnectUI({
          onEvent: (event: any) => {
            console.log('📡 Nango event:', event);

            if (event.type === 'connect') {
              toast.success('Connected', `Connected to ${providerConfigKey}`);
              analytics.capture('Integration Connected', {
                integration: providerConfigKey,
                connectionId: event.payload?.connectionId,
              });
              window.dispatchEvent(
                new CustomEvent('nango:connected', {
                  detail: {
                    integration: providerConfigKey,
                    connectionId: event.payload?.connectionId,
                  },
                })
              );
              setIsConnecting(false);
            } else if (event.type === 'error') {
              const message = event.payload?.error || 'Connection failed';
              setError(message);
              toast.error('Connection failed', message);
              analytics.capture('Integration Connection Failed', {
                integration: providerConfigKey,
                error: message,
              });
              setIsConnecting(false);
            } else if (event.type === 'close') {
              setIsConnecting(false);
            }
          },
        });

        // 🔑 ดึง session token จาก backend
        const sessionToken = await getSessionToken(providerConfigKey);
        connectUI.setSessionToken(sessionToken); // ต้องเป็น JWT ไม่ใช่ session ID

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        toast.error('Connection error', msg);
        analytics.capture('Integration Connection Failed', {
          integration: providerConfigKey,
          error: msg,
        });
        setIsConnecting(false);
        throw err;
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

  return { connect, isConnecting, error, isAvailable };
}
