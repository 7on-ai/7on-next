'use server';

import { auth } from '@repo/auth/server';
import { database } from '@repo/database';

const colors = [
  'var(--color-red-500)',
  'var(--color-orange-500)',
  'var(--color-amber-500)',
  'var(--color-yellow-500)',
  'var(--color-lime-500)',
  'var(--color-green-500)',
  'var(--color-emerald-500)',
  'var(--color-teal-500)',
  'var(--color-cyan-500)',
  'var(--color-sky-500)',
  'var(--color-blue-500)',
  'var(--color-indigo-500)',
  'var(--color-violet-500)',
  'var(--color-purple-500)',
  'var(--color-fuchsia-500)',
  'var(--color-pink-500)',
  'var(--color-rose-500)',
];

export const getUsers = async (
  userIds: string[]
): Promise<
  | {
      data: Liveblocks['UserMeta']['info'][];
    }
  | {
      error: unknown;
    }
> => {
  try {
    const { orgId } = await auth();

    if (!orgId) {
      throw new Error('Not logged in');
    }

    // Get organization members from database
    const members = await database.organizationMember.findMany({
      where: {
        organizationId: orgId,
        userId: {
          in: userIds,
        },
      },
      take: 100,
    });

    // For now, we'll use userId as the name since we don't have user details stored
    // You may want to fetch user details from Supabase Auth API or store them in your database
    const data: Liveblocks['UserMeta']['info'][] = members.map((member) => ({
      name: member.userId.slice(0, 8), // Use first 8 chars of userId as placeholder
      picture: '', // No picture available without additional user data
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    return { data };
  } catch (error) {
    return { error };
  }
};