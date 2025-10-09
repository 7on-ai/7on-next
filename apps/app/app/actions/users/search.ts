'use server';

import { auth } from '@repo/auth/server';
import { database } from '@repo/database';
import Fuse from 'fuse.js';

export const searchUsers = async (
  query: string
): Promise<
  | {
      data: string[];
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
      },
      take: 100,
    });

    // Map members to searchable format
    // Note: Since we don't have user names stored, we use userId
    // You may want to enhance this by storing user profiles in your database
    const users = members.map((member) => ({
      id: member.id,
      userId: member.userId,
      // Placeholder name - you should store actual user names in your database
      name: member.userId.slice(0, 8),
    }));

    // Use Fuse.js for fuzzy search
    const fuse = new Fuse(users, {
      keys: ['name', 'userId'],
      minMatchCharLength: 1,
      threshold: 0.3,
    });

    const results = fuse.search(query);
    const data = results.map((result) => result.item.id);

    return { data };
  } catch (error) {
    return { error };
  }
};