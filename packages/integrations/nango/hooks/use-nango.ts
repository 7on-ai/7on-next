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

  /**
   * Get Nango Connect Session Token from backend
   */
  const getSessionToken = useCallback(
    async (providerConfigKey: string): Promise<string> => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('🔍 Requesting session token for:', providerConfigKey);

      const response = await fetch('/api/nango/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerConfigKey,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Session token error:', error);
        throw new Error(error.error || 'Failed to create session token');
      }

      const data = await response.json();
      console.log('✅ Session response received:', data);
      console.log('🔍 Token exists:', !!data.token);
      console.log('🔍 Token length:', data.token?.length);
      
      if (!data.token) {
        console.error('❌ No token in response:', data);
        throw new Error('Session token not found in response');
      }
      
      return data.token;
    },
    [user]
  );

  /**
   * Connect to an integration using Nango Connect UI
   * https://docs.nango.dev/integrate/guides/authorize-an-api
   */
  const connect = useCallback(
    async ({ providerConfigKey, connectionId, params }: NangoAuthOptions) => {
      setIsConnecting(true);
      setError(null);

      try {
        // Track analytics
        analytics.capture('Integration Connection Initiated', {
          integration: providerConfigKey,
          source: 'dashboard',
        });

        // Dynamically import Nango SDK (client-side only)
        const { default: Nango } = await import('@nangohq/frontend');

        console.log('🚀 Initializing Nango...');
        
        // Get session token first
        console.log('🔑 Fetching session token...');
        const sessionToken = await getSessionToken(providerConfigKey);
        console.log('✅ Token received, length:', sessionToken?.length);
        console.log('🔍 Token preview:', sessionToken?.substring(0, 30) + '...');
        console.log('🔍 Token full (for debug):', sessionToken);
        
        // 🔍 Decode token to see what's inside (DEBUG)
        console.log('🔍 Decoding session token info...');
        console.log('🔍 Token parts count:', sessionToken.split('.').length);
        
        try {
          // Session token เป็น JWT - ลอง decode ดู (ส่วน payload)
          const parts = sessionToken.split('.');
          console.log('🔍 Token has', parts.length, 'parts (JWT needs 3)');
          
          if (parts.length === 3) {
            console.log('🔍 Attempting to decode part 2 (payload)...');
            const base64Payload = parts[1];
            console.log('🔍 Base64 payload length:', base64Payload.length);
            
            // Add padding if needed
            const paddedPayload = base64Payload + '='.repeat((4 - base64Payload.length % 4) % 4);
            const decodedPayload = atob(paddedPayload);
            console.log('🔍 Decoded payload string:', decodedPayload);
            
            const payload = JSON.parse(decodedPayload);
            console.log('📦 Token payload:', payload);
            console.log('📦 Allowed integrations:', payload.allowed_integrations);
            console.log('📦 End user:', payload.end_user);
          } else {
            console.warn('⚠️ Token is not JWT format (not 3 parts)');
            console.log('⚠️ This might be a session token ID, not a JWT');
          }
        } catch (e) {
          console.error('⚠️ Could not decode token:', e);
          console.error('⚠️ Error details:', e instanceof Error ? e.message : 'Unknown');
        }

        // Initialize Nango with session token
        console.log('🔐 Creating Nango instance with token...');
        const nango = new Nango({ connectSessionToken: sessionToken });
        
        console.log('✅ Nango instance created');
        console.log('🔍 Nango instance type:', typeof nango);
        console.log('🔍 Nango methods:', Object.keys(nango));
        
        // Open Connect UI
        console.log('🎨 Opening Connect UI...');
        console.log('🔍 Target integration:', providerConfigKey);
        
        nango.openConnectUI({
          onEvent: (event: any) => {
            console.log('📡 Nango event:', event);
            console.log('📡 Event type:', event.type);
            console.log('📡 Event payload:', event.payload);

            if (event.type === 'connect') {
              console.log('✅ Connection successful!', event.payload);
              
              toast.success('Connected', `Successfully connected to ${providerConfigKey}`);

              analytics.capture('Integration Connected', {
                integration: providerConfigKey,
                connectionId: event.payload?.connectionId,
              });

              setIsConnecting(false);
              
              // Trigger refresh of connections list
              window.dispatchEvent(new CustomEvent('nango:connected', {
                detail: { integration: providerConfigKey }
              }));
              
            } else if (event.type === 'error') {
              const errorMessage = event.payload?.error || 'Connection failed';
              console.error('❌ Connection error:', errorMessage);
              
              setError(errorMessage);
              toast.error('Connection failed', errorMessage);

              analytics.capture('Integration Connection Failed', {
                integration: providerConfigKey,
                error: errorMessage,
              });

              setIsConnecting(false);
              
            } else if (event.type === 'close') {
              console.log('🔒 Connect UI closed');
              setIsConnecting(false);
            }
          },
        });
        
        console.log('✅ Connect UI opened successfully');

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);

        console.error('💥 Connection error:', err);
        console.error('💥 Error stack:', err instanceof Error ? err.stack : 'No stack');

        toast.error('Connection error', message);

        analytics.capture('Integration Connection Failed', {
          integration: providerConfigKey,
          error: message,
        });

        setIsConnecting(false);
        throw err;
      }
    },
    [getSessionToken]
  );

  /**
   * Check if Nango is available (SDK loaded)
   */
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