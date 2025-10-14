import { getUserTier } from '@repo/auth/server';
import type { Metadata } from 'next';
import { DashboardClient } from './components/dashboard-client';
import { Header } from '../components/header';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Manage your integrations and view analytics',
};

export default async function DashboardPage() {
  const tier = await getUserTier();

  return (
    <>
      <Header pages={['Dashboard']} page="Overview" />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <DashboardClient initialTier={tier} />
      </div>
    </>
  );
}