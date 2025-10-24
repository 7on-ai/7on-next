// apps/app/app/(authenticated)/dashboard/provision-helper.ts
/**
 * Helper to call Northflank provisioning API
 * Separated into its own file for dynamic import to avoid blocking page render
 */

interface ProvisionParams {
  userId: string;
  userName: string;
  userEmail: string;
}

export async function provisionNorthflank(params: ProvisionParams) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    console.log('📞 Calling provision API:', {
      url: `${appUrl}/api/provision-northflank`,
      userId: params.userId,
      userName: params.userName,
      userEmail: params.userEmail,
    });

    const response = await fetch(`${appUrl}/api/provision-northflank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: params.userId,
        userName: params.userName,
        userEmail: params.userEmail,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Provision API failed:', data);
      throw new Error(data.error || 'Provisioning failed');
    }

    console.log('✅ Provisioning initiated successfully:', data);
    return data;
  } catch (error) {
    console.error('💥 Error calling provision API:', error);
    throw error;
  }
}