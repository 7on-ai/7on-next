// apps/app/app/api/webhooks/clerk/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { database } from '@repo/database';
import { log } from '@repo/observability/log';

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const payload = await request.text();
    const headers = {
      'svix-id': request.headers.get('svix-id')!,
      'svix-timestamp': request.headers.get('svix-timestamp')!,
      'svix-signature': request.headers.get('svix-signature')!,
    };

    const wh = new Webhook(WEBHOOK_SECRET);
    const event = wh.verify(payload, headers) as any;

    log.info('Clerk webhook received', { type: event.type });

    // Handle user.created event
    if (event.type === 'user.created') {
      const { 
        id: clerkId, 
        email_addresses, 
        first_name, 
        last_name,
        username 
      } = event.data;
      
      const email = email_addresses[0]?.email_address;

      if (!email) {
        log.error('No email found for user', { clerkId });
        return NextResponse.json({ error: 'No email found' }, { status: 400 });
      }

      log.info('Creating user in database', { clerkId, email });

      // Create user in database
      const user = await database.user.create({
        data: {
          clerkId,
          email,
          subscriptionTier: 'FREE',
          apiCallsCount: 0,
          usageResetAt: new Date(),
        },
      });

      log.info('User created successfully', { userId: user.id });

      // 🚀 Auto-provision N8N instance
      try {
        const userName = `${first_name || ''} ${last_name || ''}`.trim() 
          || username 
          || email.split('@')[0];

        log.info('Starting N8N provisioning', { 
          userId: user.id, 
          userName,
          email 
        });

        // Call provision API (non-blocking)
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/provision-northflank`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            userName,
            userEmail: email,
          }),
        }).then(async (response) => {
          if (response.ok) {
            const data = await response.json();
            log.info('N8N provisioning initiated', { 
              userId: user.id,
              method: data.method,
              status: data.status 
            });
          } else {
            const error = await response.text();
            log.error('N8N provisioning failed', { 
              userId: user.id, 
              error 
            });
          }
        }).catch((error) => {
          log.error('N8N provisioning request failed', { 
            userId: user.id, 
            error: error.message 
          });
        });

        log.info('N8N provisioning request sent (background)', { userId: user.id });
      } catch (provisionError) {
        log.error('Error initiating N8N provision', { 
          userId: user.id, 
          error: provisionError instanceof Error ? provisionError.message : 'Unknown error'
        });
        // Don't fail the webhook - user is still created
      }

      return NextResponse.json({
        success: true,
        userId: user.id,
        message: 'User created and N8N provisioning initiated',
      });
    }

    // Handle user.updated event
    if (event.type === 'user.updated') {
      const { id: clerkId, email_addresses } = event.data;
      const email = email_addresses[0]?.email_address;

      await database.user.update({
        where: { clerkId },
        data: { 
          email: email || undefined, 
          updatedAt: new Date() 
        },
      });

      log.info('User updated', { clerkId });
    }

    // Handle user.deleted event
    if (event.type === 'user.deleted') {
      const { id: clerkId } = event.data;

      await database.user.delete({
        where: { clerkId },
      });

      log.info('User deleted', { clerkId });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Clerk webhook error', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}