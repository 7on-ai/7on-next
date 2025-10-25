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

    // ===== Handle user.deleted event =====
    if (event.type === 'user.deleted') {
      const { id: clerkId } = event.data;

      try {
        // ✅ Check if user exists first
        const existingUser = await database.user.findUnique({
          where: { clerkId },
          select: { id: true, northflankProjectId: true }
        });

        if (!existingUser) {
          log.warn('⚠️ User already deleted or never existed', { clerkId });
          return NextResponse.json({ 
            success: true, 
            message: 'User already deleted or never existed' 
          });
        }

        // TODO: Optional - Delete Northflank project if exists
        if (existingUser.northflankProjectId) {
          log.info('🗑️ User has Northflank project - consider cleanup', {
            projectId: existingUser.northflankProjectId
          });
          // Add cleanup logic here if needed in future
        }

        // Delete user from database
        await database.user.delete({
          where: { clerkId },
        });

        log.info('✅ User deleted successfully', { clerkId, userId: existingUser.id });
        
        return NextResponse.json({ 
          success: true,
          message: 'User deleted successfully'
        });
      } catch (deleteError) {
        // Handle case where user was already deleted during processing (race condition)
        if ((deleteError as any)?.code === 'P2025') {
          log.warn('⚠️ User already deleted during processing', { clerkId });
          return NextResponse.json({ 
            success: true, 
            message: 'User already deleted' 
          });
        }
        throw deleteError;
      }
    }

    // ===== Handle user.created event =====
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

      // ✅ Check if user already exists (handle webhook retries)
      let user = await database.user.findUnique({
        where: { clerkId },
      });

      if (user) {
        log.warn('⚠️ User already exists (webhook retry detected)', { 
          userId: user.id, 
          clerkId 
        });
        
        // Check if provisioning is needed
        if (!user.northflankProjectId || 
            ['failed', 'webhook_provision_failed', 'webhook_fetch_failed'].includes(user.northflankProjectStatus || '')) {
          log.info('🔄 Retrying provisioning for existing user', { userId: user.id });
          // Continue to provisioning below
        } else {
          return NextResponse.json({
            success: true,
            userId: user.id,
            message: 'User already exists',
          });
        }
      } else {
        // Create new user
        user = await database.user.create({
          data: {
            clerkId,
            email,
            subscriptionTier: 'FREE',
            apiCallsCount: 0,
            usageResetAt: new Date(),
          },
        });

        log.info('✅ User created successfully', { userId: user.id, email });
      }

      // 🚀 Auto-provision N8N instance
      const userName = `${first_name || ''} ${last_name || ''}`.trim() 
        || username 
        || email.split('@')[0];

      log.info('🚀 Starting N8N provisioning', { 
        userId: user.id, 
        userName,
        email 
      });

      // ✅ Use absolute URL with proper fallback
      const provisionUrl = process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/provision-northflank`
        : `https://${request.headers.get('host')}/api/provision-northflank`;

      console.log('📞 Calling provision API at:', provisionUrl);

      // ✅ Fire-and-forget to prevent webhook timeout
      // This runs asynchronously and doesn't block webhook response
      fetch(provisionUrl, {
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
      })
      .then(async (provisionResponse) => {
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
            status: data.status
          });

          console.log('✅ Provision response:', JSON.stringify(data, null, 2));
        } else {
          log.error('❌ N8N provisioning API returned error', { 
            userId: user.id, 
            status: provisionResponse.status,
            error: responseText 
          });

          console.error('❌ Provision failed:', responseText);

          // Update user with error status asynchronously
          await database.user.update({
            where: { id: user.id },
            data: {
              northflankProjectStatus: 'webhook_provision_failed',
              n8nSetupError: `Provision failed: ${responseText.substring(0, 200)}`,
              updatedAt: new Date(),
            },
          }).catch(e => {
            console.error('Failed to update error status:', e);
            log.error('Failed to update error status', { error: e });
          });
        }
      })
      .catch(async (fetchError) => {
        const errorMessage = fetchError instanceof Error 
          ? fetchError.message 
          : 'Unknown fetch error';

        log.error('❌ N8N provisioning fetch error', { 
          userId: user.id, 
          error: errorMessage,
          url: provisionUrl
        });

        console.error('💥 Provision fetch error:', errorMessage);

        // Update user with error status asynchronously
        await database.user.update({
          where: { id: user.id },
          data: {
            northflankProjectStatus: 'webhook_fetch_failed',
            n8nSetupError: `Fetch failed: ${errorMessage}`,
            updatedAt: new Date(),
          },
        }).catch(e => {
          console.error('Failed to update error status:', e);
          log.error('Failed to update error status', { error: e });
        });
      });

      // ✅ Return immediately - don't wait for provisioning
      // This prevents webhook timeout issues
      return NextResponse.json({
        success: true,
        userId: user.id,
        message: 'User created and N8N provisioning started',
      });
    }

    // ===== Handle user.updated event =====
    if (event.type === 'user.updated') {
      const { id: clerkId, email_addresses } = event.data;
      const email = email_addresses[0]?.email_address;

      // ✅ Check if user exists before updating
      const existingUser = await database.user.findUnique({
        where: { clerkId },
      });

      if (!existingUser) {
        log.warn('⚠️ Cannot update - user not found', { clerkId });
        return NextResponse.json({ 
          success: true, 
          message: 'User not found - skipping update' 
        });
      }

      await database.user.update({
        where: { clerkId },
        data: { 
          email: email || undefined, 
          updatedAt: new Date() 
        },
      });

      log.info('✅ User updated', { clerkId });
    }

    return NextResponse.json({ success: true });
    
  } catch (error) {
    log.error('💥 Clerk webhook error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    console.error('💥 Webhook error:', error);
    
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}