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
      
      {/* Wrapper with Shader Background */}
      <div className="relative flex flex-1 flex-col">
        {/* Optional: Shader Background */}
        {/* Uncomment below to add shader background */}
        {/* 
        <div className="absolute inset-0 pointer-events-none">
          <MeshGradient
            className="w-full h-full opacity-30"
            colors={['#000000', '#1a1a1a', '#333333', '#ffffff']}
            speed={0.5}
            backgroundColor="transparent"
          />
        </div>
        */}
        
        {/* Lighting overlays (subtle) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" />
          <div className="absolute top-3/4 right-1/4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col gap-6 p-6">
          <DashboardClient initialTier={tier} />
        </div>
      </div>
    </>
  );
}