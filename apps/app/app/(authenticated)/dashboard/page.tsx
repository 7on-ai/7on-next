// apps/app/app/(authenticated)/dashboard/page.tsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getUserTier } from '@repo/auth/server';
import { database } from '@repo/database';
import type { Metadata } from 'next';
import { DashboardClientWrapper } from './components/dashboard-client-wrapper';
import { Header } from '../components/header';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Manage your integrations and view analytics',
};

export default async function DashboardPage() {
  const { userId: clerkUserId } = await auth();
  const user = await currentUser();

  if (!clerkUserId || !user) {
    redirect('/sign-in');
  }

  const userEmail = user.emailAddresses[0]?.emailAddress || null;
  const tier = await getUserTier();

  // ✅ Get or create database user
  let dbUser = await database.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  // 🔥 NEW: Auto-provision Northflank for new users
  if (!dbUser) {
    console.log('🆕 Creating new user:', userEmail);
    
    dbUser = await database.user.create({
      data: {
        clerkId: clerkUserId,
        email: userEmail || '',
        subscriptionTier: tier,
      },
    });

    // ✅ NEW: Trigger Northflank provisioning in background
    if (dbUser.id && userEmail) {
      console.log('🚀 Starting Northflank provisioning for user:', dbUser.id);
      
      // ⚠️ IMPORTANT: Use dynamic import to avoid blocking page load
      import('../../provision-helper').then(({ provisionNorthflank }) => {
        provisionNorthflank({
          userId: dbUser.id,
          userName: user.firstName || user.username || userEmail.split('@')[0],
          userEmail: userEmail,
        }).catch((error) => {
          console.error('❌ Provisioning failed:', error);
        });
      }).catch((error) => {
        console.error('❌ Failed to import provision helper:', error);
      });
    }
  } else {
    console.log('👤 Existing user logged in:', dbUser.id);
    
    // ✅ Check if existing user needs provisioning
    if (!dbUser.northflankProjectId && userEmail) {
      console.log('🔄 Existing user without Northflank project, provisioning...');
      
      import('../../provision-helper').then(({ provisionNorthflank }) => {
        provisionNorthflank({
          userId: dbUser.id,
          userName: user.firstName || user.username || userEmail.split('@')[0],
          userEmail: userEmail,
        }).catch((error) => {
          console.error('❌ Provisioning failed:', error);
        });
      }).catch((error) => {
        console.error('❌ Failed to import provision helper:', error);
      });
    }
  }

  return (
    <>
      <Header pages={['Dashboard']} page="Overview" />
      <DashboardClientWrapper 
        userId={dbUser.id}
        userEmail={userEmail} 
        initialTier={tier} 
      />
    </>
  );
}