'use client';

import dynamic from 'next/dynamic';
import { createClient } from '../client';
import { useState } from 'react';
import { Button } from '@repo/design-system/components/ui/button';
import { Input } from '@repo/design-system/components/ui/input';
import { Label } from '@repo/design-system/components/ui/label';
import { CheckCircle2Icon } from 'lucide-react';

// ✅ โหลด next/navigation และ next/link แบบ dynamic เพื่อลดปัญหา build ใน non-Next env
const useRouter = dynamic(async () => (await import('next/navigation')).useRouter, { ssr: false });
const Link = dynamic(async () => (await import('next/link')).default, { ssr: false });

export const SignUp = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ✅ ใช้ dynamic hook ป้องกัน build error
  const routerHook = useRouter as unknown as () => { push: (path: string) => void };
  const router = routerHook ? routerHook() : { push: () => {} };

  const supabase = createClient();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          full_name: name,
        },
        emailRedirectTo: typeof window !== 'undefined'
          ? `${window.location.origin}/api/auth/callback`
          : undefined,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: typeof window !== 'undefined'
          ? `${window.location.origin}/api/auth/callback`
          : undefined,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="grid gap-6">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-green-500/20 bg-green-500/10 p-6">
          <CheckCircle2Icon className="h-12 w-12 text-green-500" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Check your email</h3>
            <p className="mt-2 text-muted-foreground text-sm">
              We&apos;ve sent a confirmation link to{' '}
              <span className="font-medium text-foreground">{email}</span>
            </p>
            <p className="mt-4 text-muted-foreground text-xs">
              Click the link in the email to complete your registration.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => router.push('/sign-in')}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {error && (
        <div className="rounded-md bg-destructive/15 p-3 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSignUp}>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </div>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        <Button variant="outline" type="button" disabled={loading} onClick={() => handleOAuth('google')}>
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Google
        </Button>

        <Button variant="outline" type="button" disabled={loading} onClick={() => handleOAuth('github')}>
          <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 
              6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703
              -2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466
              -1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531
              1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338
              -2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988
              1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0
              .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115
              2.504.337 1.909-1.296 2.747-1.027
              2.747-1.027.546 1.379.202 2.398.1 2.651.64.7
              1.028 1.595 1.028 2.688 0 3.848-2.339
              4.695-4.566 4.943.359.309.678.92.678 1.855
              0 1.338-.012 2.419-.012 2.747 0
              .268.18.58.688.482A10.019 10.019 0 0022 
              12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          GitHub
        </Button>
      </div>

      <p className="px-8 text-center text-muted-foreground text-sm">
        Already have an account?{' '}
        <Link href="/sign-in" className="underline underline-offset-4 hover:text-primary">
          Sign in
        </Link>
      </p>

      <p className="px-8 text-center text-muted-foreground text-xs">
        By clicking continue, you agree to our{' '}
        <Link href="/legal/terms" className="underline underline-offset-4 hover:text-primary">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-primary">
          Privacy Policy
        </Link>.
      </p>
    </div>
  );
};
