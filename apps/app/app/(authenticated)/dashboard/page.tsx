// apps/app/app/(authenticated)/dashboard/page.tsx
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getUserTier } from '@repo/auth/server';
import type { Metadata } from 'next';
import { DashboardClientWrapper } from './components/dashboard-client-wrapper';
import { Header } from '../components/header';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Manage your integrations and view analytics',
};

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const { sessionClaims } = await auth();
  const userEmail = sessionClaims?.email as string | null;
  const tier = await getUserTier();

  return (
    <>
      <Header pages={['Dashboard']} page="Overview" />
      <DashboardClientWrapper 
        userId={userId} 
        userEmail={userEmail} 
        initialTier={tier} 
      />
    </>
  );
}