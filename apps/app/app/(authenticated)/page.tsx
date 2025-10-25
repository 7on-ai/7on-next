// apps/app/app/(authenticated)/page.tsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { database } from '@repo/database';
import { getUserTier } from '@repo/auth/server';
import { DeploymentStatusScreen } from './components/deployment-status-screen';

export default async function HomePage() {
  const { userId: clerkUserId } = await auth();
  const user = await currentUser();

  if (!clerkUserId || !user) {
    redirect('/sign-in');
  }

  const userEmail = user.emailAddresses[0]?.emailAddress || null;
  const tier = await getUserTier();

  // Get or create database user
  let dbUser = await database.user.findUnique({
    where: { clerkId: clerkUserId },
    select: {
      id: true,
      clerkId: true,
      email: true,
      northflankProjectId: true,
      northflankProjectStatus: true,
      n8nUrl: true,
      createdAt: true,
    },
  });

  // If user doesn't exist, create them
  if (!dbUser) {
    console.log('🆕 Creating new user in database');
    
    dbUser = await database.user.create({
      data: {
        clerkId: clerkUserId,
        email: userEmail || '',
        subscriptionTier: tier,
      },
      select: {
        id: true,
        clerkId: true,
        email: true,
        northflankProjectId: true,
        northflankProjectStatus: true,
        n8nUrl: true,
        createdAt: true,
      },
    });
  }

  // Check if user needs deployment status screen
  const needsDeployment = 
    !dbUser.northflankProjectId || 
    !dbUser.n8nUrl ||
    ['initiated', 'deploying', 'pending'].includes(dbUser.northflankProjectStatus || '');

  // Show deployment status for new users or deploying users
  if (needsDeployment) {
    return (
      <DeploymentStatusScreen 
        userId={dbUser.id}
        userEmail={userEmail || ''}
        projectStatus={dbUser.northflankProjectStatus || 'pending'}
      />
    );
  }

  // User already has N8N deployed, redirect to dashboard
  redirect('/dashboard');
}