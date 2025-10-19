// app/dashboard/page.tsx
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { DashboardClient } from './components/dashboard-client';
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

  // Get user email from Clerk
  const { sessionClaims } = await auth();
  const userEmail = sessionClaims?.email as string | null;

  return (
    <>
      <Header pages={['Dashboard']} page="Overview" />
      
      {/* Wrapper with Shader Background */}
      <div className="relative flex flex-1 flex-col">
        {/* Lighting overlays (subtle) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" />
          <div 
            className="absolute top-3/4 right-1/4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" 
            style={{ animationDelay: '1s' }} 
          />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col gap-6 p-6">
          <DashboardClient userId={userId} userEmail={userEmail} />
        </div>
      </div>
    </>
  );
}