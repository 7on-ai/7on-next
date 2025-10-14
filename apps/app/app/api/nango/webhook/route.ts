import { database } from '@repo/database';
import { log } from '@repo/observability/log';
import { NextResponse } from 'next/server';
import { analytics } from '@repo/analytics/posthog/server';
import { Prisma } from '@repo/database';

/**
 * Nango Webhook Handler
 * Receives events when users connect/disconnect services
 * 
 * Webhook events from Nango:
 * - sync.connection_created
 * - sync.connection_deleted
 * - sync.connection_error
 */

interface NangoWebhookPayload {
  type: 'sync' | 'auth' | 'forward';
  connectionId: string;
  providerConfigKey: string;
  userId: string;
  operation?: 'created' | 'updated' | 'deleted';
  error?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as NangoWebhookPayload;

    log.info('Nango webhook received', { payload });

    const { connectionId, providerConfigKey, userId, operation, error } = payload;

    // Find user by Clerk ID
    const user = await database.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      log.error('User not found for Nango webhook', { userId });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get integration name from config
    const integrationName = providerConfigKey
      .split('-')[0]
      .charAt(0)
      .toUpperCase() + providerConfigKey.split('-')[0].slice(1);

    // Handle different operations
    switch (operation) {
      case 'created': {
        // Create connection in database
        await database.nangoConnection.create({
          data: {
            userId: user.id,
            connectionId,
            providerConfigKey,
            provider: integrationName,
            status: 'ACTIVE',
            scopes: [],
            metadata: (payload.metadata || {}) as Prisma.JsonObject,
          },
        });

        // Track analytics
        analytics.capture({
          event: 'Integration Connected',
          distinctId: userId,
          properties: {
            integration: providerConfigKey,
            connectionId,
          },
        });

        log.info('Connection created', { connectionId, userId });
        break;
      }

      case 'deleted': {
        // Update connection status
        await database.nangoConnection.updateMany({
          where: {
            connectionId,
            userId: user.id,
          },
          data: {
            status: 'DISCONNECTED',
          },
        });

        // Track analytics
        analytics.capture({
          event: 'Integration Disconnected',
          distinctId: userId,
          properties: {
            integration: providerConfigKey,
            connectionId,
          },
        });

        log.info('Connection deleted', { connectionId, userId });
        break;
      }

      case 'updated': {
        // Update connection
        await database.nangoConnection.updateMany({
          where: {
            connectionId,
            userId: user.id,
          },
          data: {
            lastSyncedAt: new Date(),
            status: error ? 'ERROR' : 'ACTIVE',
            errorMessage: error || null,
          },
        });

        log.info('Connection updated', { connectionId, userId });
        break;
      }

      default: {
        log.warn('Unknown operation', { operation });
      }
    }

    await analytics.shutdown();

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Nango webhook error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}