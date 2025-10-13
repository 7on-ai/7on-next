'use client';

import { Button } from '@repo/design-system/components/ui/button';
import { useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import { cn } from '@repo/design-system/lib/utils';

interface SubscribeButtonProps {
  priceId: string;
  isCurrentPlan: boolean;
  className?: string;
  children: React.ReactNode;
}

export function SubscribeButton({
  priceId,
  isCurrentPlan,
  className,
  children,
}: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      setLoading(false);
      alert('Failed to create checkout session. Please try again.');
    }
  };

  if (isCurrentPlan) {
    return (
      <Button
        variant="outline"
        className={cn('w-full', className)}
        disabled
      >
        Current Plan
      </Button>
    );
  }

  return (
    <Button
      onClick={handleSubscribe}
      disabled={loading}
      className={cn('w-full text-white', className)}
    >
      {loading ? (
        <>
          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : (
        children
      )}
    </Button>
  );
}