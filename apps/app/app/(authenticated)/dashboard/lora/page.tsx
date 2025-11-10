// apps/app/app/(authenticated)/dashboard/lora/page.tsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { database } from '@repo/database';
import { Header } from '../../components/header';
import dynamic from 'next/dynamic';

// Dynamic import - ใน Next.js 15 ไม่ต้องใช้ ssr: false
const LoraTrainingComplete = dynamic(
  () => import('./components/lora-training-complete').then(mod => ({ 
    default: mod.LoraTrainingComplete 
  })),
  { 
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
      </div>
    )
  }
);

export const metadata = {
  title: 'LoRA Training',
  description: 'Fine-tune your AI model',
};

export default async function LoraPage() {
  const { userId: clerkUserId } = await auth();
  const user = await currentUser();
  
  if (!clerkUserId || !user) {
    redirect('/sign-in');
  }
  
  const dbUser = await database.user.findUnique({
    where: { clerkId: clerkUserId },
    select: {
      id: true,
      postgresSchemaInitialized: true,
      loraTrainingStatus: true,
      loraAdapterVersion: true,
      loraLastTrainedAt: true,
      loraTrainingError: true,
      goodChannelCount: true,
      badChannelCount: true,
      mclChainCount: true,
    },
  });
  
  if (!dbUser) {
    redirect('/sign-in');
  }
  
  return (
    <>
      <Header pages={['Dashboard', 'LoRA Training']} page="LoRA Training" />
      <LoraTrainingComplete user={dbUser} />
    </>
  );
}