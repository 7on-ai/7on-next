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

  if (!dbUser) {
    dbUser = await database.user.create({
      data: {
        clerkId: clerkUserId,
        email: userEmail || '',
        subscriptionTier: tier,
      },
    });
  }

  return (
    <>
      <Header pages={['Dashboard']} page="Overview" />
      <DashboardClientWrapper 
        userId={dbUser.id}  // ✅ ส่ง database ID
        userEmail={userEmail} 
        initialTier={tier} 
      />
    </>
  );
}