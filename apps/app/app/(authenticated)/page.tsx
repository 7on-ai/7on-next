// apps/app/app/page.tsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { database } from '@repo/database';
import { getUserTier } from '@repo/auth/server';

export default async function HomePage() {
  const { userId: clerkUserId } = await auth();
  const user = await currentUser();

  if (!clerkUserId || !user) {
    // Not authenticated, redirect to sign-in
    redirect('/sign-in');
  }

  const userEmail = user.emailAddresses[0]?.emailAddress || null;
  const tier = await getUserTier();

  // ✅ Get or create database user
  let dbUser = await database.user.findUnique({
    where: { clerkId: clerkUserId },
    select: {
      id: true,
      email: true,
      northflankProjectId: true,
      northflankProjectStatus: true,
      n8nUrl: true,
      createdAt: true,
    },
  });

  // If user doesn't exist in DB, create them
  if (!dbUser) {
    console.log('🆕 Creating new user in database (from root page)');
    
    dbUser = await database.user.create({
      data: {
        clerkId: clerkUserId,
        email: userEmail || '',
        subscriptionTier: tier,
      },
      select: {
        id: true,
        email: true,
        northflankProjectId: true,
        northflankProjectStatus: true,
        n8nUrl: true,
        createdAt: true,
      },
    });

    console.log('🚀 New user created, skipping auto-provision trigger (provision-helper-root removed)');
  } else {
    // Check if existing user needs provisioning
    const needsProvisioning = 
      !dbUser.northflankProjectId || 
      !dbUser.n8nUrl ||
      ['failed', 'timeout', 'webhook_provision_failed', 'webhook_fetch_failed'].includes(
        dbUser.northflankProjectStatus || ''
      );

    if (needsProvisioning) {
      console.log('🔄 Existing user needs provisioning, skipping trigger (provision-helper-root removed):', dbUser.id, dbUser.northflankProjectStatus);
    }
  }

  // Redirect to dashboard
  redirect('/dashboard');
}
