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

      log.info('🆕 Creating new user in database', { clerkId, email });

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

      log.info('✅ User created successfully', { userId: user.id, email });

      // 🚀 Auto-provision N8N instance
      const userName = `${first_name || ''} ${last_name || ''}`.trim() 
        || username 
        || email.split('@')[0];

      log.info('🚀 Starting immediate N8N provisioning', { 
        userId: user.id, 
        userName,
        email 
      });

      // ✅ FIX: Use absolute URL and proper error handling
      const provisionUrl = process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/provision-northflank`
        : `https://${request.headers.get('host')}/api/provision-northflank`;

      console.log('📞 Calling provision API at:', provisionUrl);

      try {
        const provisionResponse = await fetch(provisionUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'Clerk-Webhook/1.0'
          },
          body: JSON.stringify({
            userId: user.id,
            userName,
            userEmail: email,
          }),
          // ✅ Add timeout
          signal: AbortSignal.timeout(10000), // 10 seconds timeout for webhook
        });

        const responseText = await provisionResponse.text();
        
        if (provisionResponse.ok) {
          let data;
          try {
            data = JSON.parse(responseText);
          } catch {
            data = { message: responseText };
          }

          log.info('✅ N8N provisioning initiated successfully', { 
            userId: user.id,
            method: data.method,
            status: data.status,
            response: data
          });

          console.log('✅ Provision response:', JSON.stringify(data, null, 2));
        } else {
          log.error('❌ N8N provisioning API returned error', { 
            userId: user.id, 
            status: provisionResponse.status,
            error: responseText 
          });

          console.error('❌ Provision failed:', responseText);

          // Update user with error status
          await database.user.update({
            where: { id: user.id },
            data: {
              northflankProjectStatus: 'webhook_provision_failed',
              n8nSetupError: `Webhook provision failed: ${responseText.substring(0, 200)}`,
            },
          });
        }
      } catch (fetchError) {
        const errorMessage = fetchError instanceof Error 
          ? fetchError.message 
          : 'Unknown fetch error';

        log.error('❌ N8N provisioning fetch error', { 
          userId: user.id, 
          error: errorMessage,
          url: provisionUrl
        });

        console.error('💥 Provision fetch error:', errorMessage);

        // Update user with error status
        await database.user.update({
          where: { id: user.id },
          data: {
            northflankProjectStatus: 'webhook_fetch_failed',
            n8nSetupError: `Webhook fetch failed: ${errorMessage}`,
          },
        });
      }

      return NextResponse.json({
        success: true,
        userId: user.id,
        message: 'User created and N8N provisioning attempted',
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

      log.info('✅ User updated', { clerkId });
    }

    // Handle user.deleted event
    if (event.type === 'user.deleted') {
      const { id: clerkId } = event.data;

      await database.user.delete({
        where: { clerkId },
      });

      log.info('✅ User deleted', { clerkId });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('💥 Clerk webhook error', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    console.error('💥 Webhook error:', error);
    
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}