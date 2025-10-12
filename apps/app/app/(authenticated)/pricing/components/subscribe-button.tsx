'use client';

import { Button } from '@repo/design-system/components/ui/button';
import { useState } from 'react';
import { Loader2Icon, SparklesIcon } from 'lucide-react';

interface SubscribeButtonProps {
  priceId: string;
  isCurrentPlan: boolean;
}

export function SubscribeButton({ priceId, isCurrentPlan }: SubscribeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async () => {
    setIsLoading(true);
    
    try {
      // Call API to create Stripe Checkout Session
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();

      // Redirect to Stripe Checkout
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCurrentPlan) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Current Plan
      </Button>
    );
  }

  return (
    <Button
      onClick={handleSubscribe}
      disabled={isLoading}
      className="group relative w-full overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
    >
      {isLoading ? (
        <>
          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <SparklesIcon className="mr-2 h-4 w-4" />
          Upgrade to Pro
        </>
      )}
      
      {/* Shine effect */}
      <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-[100%]" />
    </Button>
  );
}