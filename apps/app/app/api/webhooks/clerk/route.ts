// apps/app/app/api/webhooks/clerk/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { db } from '@/lib/db';

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

    console.log('📥 Clerk webhook received:', event.type);

    // Handle user.created event
    if (event.type === 'user.created') {
      const { id: clerkId, email_addresses, first_name, last_name } = event.data;
      const email = email_addresses[0]?.email_address;

      if (!email) {
        console.error('❌ No email found for user:', clerkId);
        return NextResponse.json({ error: 'No email found' }, { status: 400 });
      }

      console.log('✅ Creating user in database:', { clerkId, email });

      // 1. Create user in Neon database
      const user = await db.user.create({
        data: {
          clerkId,
          email,
          subscriptionTier: 'FREE',
          apiCallsCount: 0,
          usageResetAt: new Date(),
        },
      });

      console.log('✅ User created:', user.id);

      // 2. 🚀 Automatically provision Northflank N8N instance
      try {
        const userName = `${first_name || ''} ${last_name || ''}`.trim() || email.split('@')[0];

        console.log('🚀 Provisioning Northflank for user:', user.id);

        const provisionResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL}/api/provision-northflank`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              userName,
              userEmail: email,
            }),
          }
        );

        if (provisionResponse.ok) {
          const provisionData = await provisionResponse.json();
          console.log('✅ Northflank provisioning initiated:', provisionData);
        } else {
          const errorText = await provisionResponse.text();
          console.error('❌ Northflank provisioning failed:', errorText);
        }
      } catch (provisionError) {
        console.error('❌ Error calling provision-northflank:', provisionError);
        // Don't fail the webhook - user is still created
      }

      return NextResponse.json({
        success: true,
        userId: user.id,
        message: 'User created and Northflank provisioning initiated',
      });
    }

    // Handle user.updated event
    if (event.type === 'user.updated') {
      const { id: clerkId, email_addresses } = event.data;
      const email = email_addresses[0]?.email_address;

      await db.user.update({
        where: { clerkId },
        data: { email, updatedAt: new Date() },
      });

      console.log('✅ User updated:', clerkId);
    }

    // Handle user.deleted event
    if (event.type === 'user.deleted') {
      const { id: clerkId } = event.data;

      await db.user.delete({
        where: { clerkId },
      });

      console.log('✅ User deleted:', clerkId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('💥 Clerk webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}