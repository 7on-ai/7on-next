// apps/app/app/api/user/social-credentials/disconnect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@repo/auth/server';
import { database as db } from '@repo/database';

export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user from database
    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { 
        id: true,
        n8nUrl: true,
        n8nUserEmail: true,
        n8nEncryptionKey: true,
        email: true,
        northflankProjectStatus: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get provider from query params
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    if (!provider) {
      return NextResponse.json({ error: 'Missing provider parameter' }, { status: 400 });
    }

    console.log('🔄 Disconnecting provider:', provider, 'for user:', user.id);

    // Find credential in database
    const credential = await db.socialCredential.findFirst({
      where: { 
        userId: user.id,
        provider: provider,
      },
    });

    if (!credential) {
      return NextResponse.json({ 
        error: 'Credential not found',
        message: 'This connection does not exist'
      }, { status: 404 });
    }

    // Step 1: Delete credentials from N8N (if injected)
    if (
      credential.injectedToN8n && 
      credential.n8nCredentialIds && 
      user.n8nUrl && 
      user.n8nEncryptionKey &&
      user.northflankProjectStatus === 'ready'
    ) {
      console.log('🗑️ Deleting credentials from N8N...');
      
      try {
        const n8nEmail = user.n8nUserEmail || user.email;
        const n8nPassword = `7On${user.n8nEncryptionKey}`;
        const n8nUrl = user.n8nUrl.replace(/\/$/, '');

        // Login to N8N
        const cookies = await loginToN8N(n8nUrl, n8nEmail, n8nPassword);

        // Delete each credential from N8N
        const credentialIds = Array.isArray(credential.n8nCredentialIds) 
          ? credential.n8nCredentialIds 
          : [credential.n8nCredentialIds];

        const deleteResults = await Promise.allSettled(
          credentialIds.map((credId: any) => 
            deleteN8NCredential(n8nUrl, cookies, credId)
          )
        );

        const successCount = deleteResults.filter(r => r.status === 'fulfilled').length;
        console.log(`✅ Deleted ${successCount}/${credentialIds.length} credentials from N8N`);

      } catch (n8nError) {
        console.error('⚠️ Failed to delete from N8N (will continue with DB deletion):', n8nError);
        // Continue with database deletion even if N8N deletion fails
      }
    }

    // Step 2: Delete from database
    await db.socialCredential.delete({
      where: { id: credential.id },
    });

    console.log('✅ Credential deleted from database');

    return NextResponse.json({
      success: true,
      message: `Successfully disconnected ${provider}`,
      provider: provider,
    });

  } catch (error) {
    console.error('❌ Disconnect error:', error);
    return NextResponse.json({ 
      error: 'Internal error',
      message: (error as Error).message 
    }, { status: 500 });
  }
}

// ===== Helper Functions =====

async function loginToN8N(
  n8nUrl: string,
  email: string,
  password: string
): Promise<string> {
  console.log('🔐 Logging into N8N for credential deletion...');
  
  const response = await fetch(`${n8nUrl}/rest/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrLdapLoginId: email,
      password,
    }),
  });

  if (!response.ok) {
    throw new Error(`N8N login failed: ${response.status}`);
  }

  const cookies = response.headers.get('set-cookie');
  if (!cookies) {
    throw new Error('No cookies received from N8N login');
  }

  return cookies;
}

async function deleteN8NCredential(
  n8nUrl: string,
  cookies: string,
  credentialId: string
): Promise<void> {
  console.log('🗑️ Deleting N8N credential:', credentialId);

  const response = await fetch(`${n8nUrl}/rest/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete credential: ${response.status} - ${errorText}`);
  }

  console.log('✅ N8N credential deleted:', credentialId);
}