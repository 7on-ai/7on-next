// apps/app/app/(authenticated)/dashboard/lora/page.tsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { database } from '@repo/database';
import { Header } from '../../components/header';
import { LoraTrainingComplete } from './components/lora-training-complete';

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