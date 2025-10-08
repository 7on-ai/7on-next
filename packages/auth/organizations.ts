import 'server-only';
import { database } from '@repo/database';
import { createClient } from './server';

export const createOrganization = async (name: string, userId: string) => {
  const organization = await database.organization.create({
    data: {
      name,
      members: {
        create: {
          userId,
          role: 'owner',
        },
      },
    },
  });

  // Set as active organization
  const supabase = await createClient();
  await supabase.auth.updateUser({
    data: { activeOrganizationId: organization.id },
  });

  return organization;
};

export const getOrganizations = async (userId: string) => {
  return await database.organization.findMany({
    where: {
      members: {
        some: {
          userId,
        },
      },
    },
    include: {
      members: true,
    },
  });
};

export const switchOrganization = async (organizationId: string) => {
  const supabase = await createClient();
  await supabase.auth.updateUser({
    data: { activeOrganizationId: organizationId },
  });
};

export const inviteToOrganization = async (
  organizationId: string,
  email: string,
  role: string = 'member'
) => {
  // Implement your invitation logic here
  // This could involve creating an invitation record and sending an email
};