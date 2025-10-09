'use client';

import { createClient } from '@repo/auth/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/design-system/components/ui/select';
import { BuildingIcon, PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Organization = {
  id: string;
  name: string;
};

export const OrganizationSwitcher = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        // Get current user to check active organization
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        // Get active org from user metadata
        const activeOrg = user.user_metadata?.activeOrganizationId;
        setActiveOrgId(activeOrg || null);

        // Fetch organizations from your database
        // This is a placeholder - you'll need to implement your own API endpoint
        const response = await fetch('/api/organizations');
        if (response.ok) {
          const data = await response.json();
          setOrganizations(data.organizations || []);
        }
      } catch (error) {
        console.error('Failed to load organizations:', error);
      } finally {
        setLoading(false);
      }
    };

    loadOrganizations();
  }, [supabase]);

  const handleOrganizationChange = async (orgId: string) => {
    if (orgId === 'create-new') {
      // Navigate to create organization page
      router.push('/organizations/new');
      return;
    }

    try {
      // Update active organization
      await supabase.auth.updateUser({
        data: { activeOrganizationId: orgId },
      });

      setActiveOrgId(orgId);
      router.refresh();
    } catch (error) {
      console.error('Failed to switch organization:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-2">
        <BuildingIcon className="h-4 w-4" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <button
        onClick={() => router.push('/organizations/new')}
        className="flex w-full items-center gap-2 rounded-md border p-2 hover:bg-accent"
      >
        <PlusIcon className="h-4 w-4" />
        <span className="text-sm">Create Organization</span>
      </button>
    );
  }

  return (
    <Select value={activeOrgId || undefined} onValueChange={handleOrganizationChange}>
      <SelectTrigger className="w-full">
        <div className="flex items-center gap-2">
          <BuildingIcon className="h-4 w-4" />
          <SelectValue placeholder="Select organization" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {organizations.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
        <SelectItem value="create-new">
          <div className="flex items-center gap-2">
            <PlusIcon className="h-4 w-4" />
            <span>Create new organization</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
};