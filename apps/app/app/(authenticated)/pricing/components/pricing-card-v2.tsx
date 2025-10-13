'use client';

import { Button } from '@repo/design-system/components/ui/button';
import { CheckIcon } from 'lucide-react';
import { SubscribeButton } from './subscribe-button';
import { cn } from '@repo/design-system/lib/utils';
import { useBilling } from './billing-toggle';

interface PricingCardProps {
  tier: 'FREE' | 'PRO' | 'BUSINESS';
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  buttonText: string;
  buttonVariant?: 'default' | 'outline';
  buttonColor?: string;
  priceIds: {
    monthly: string;
    yearly: string;
  } | null;
  isCurrentPlan: boolean;
  isPopular?: boolean;
}

export function PricingCard({
  tier,
  name,
  monthlyPrice,
  yearlyPrice,
  description,
  features,
  buttonText,
  buttonVariant = 'default',
  buttonColor,
  priceIds,
  isCurrentPlan,
  isPopular,
}: PricingCardProps) {
  const { interval } = useBilling();
  const price = interval === 'monthly' ? monthlyPrice : yearlyPrice;
  const priceId = priceIds ? priceIds[interval] : null;

  return (
    <div
      className={cn(
        'relative rounded-2xl bg-white p-8 shadow-sm transition-all hover:shadow-md',
        isPopular && 'ring-2 ring-blue-500'
      )}
    >
      {/* Popular Badge */}
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-blue-500 px-4 py-1 text-white text-xs font-semibold">
            POPULAR
          </span>
        </div>
      )}

      {/* Current Plan Badge */}
      {isCurrentPlan && (
        <div className="absolute top-4 right-4">
          <span className="rounded-full bg-green-100 px-3 py-1 text-green-700 text-xs font-semibold">
            Current Plan
          </span>
        </div>
      )}

      {/* Header */}
      <div className="text-center">
        <h3 className="text-2xl font-bold text-gray-900">{name}</h3>
        <p className="mt-2 text-gray-600 text-sm">{description}</p>
      </div>

      {/* Price */}
      <div className="mt-6 text-center">
        <div className="flex items-baseline justify-center">
          <span className="text-5xl font-bold text-gray-900">${price}</span>
          {tier !== 'FREE' && (
            <span className="ml-2 text-gray-600 text-sm">
              per user per {interval === 'monthly' ? 'month' : 'year'}
            </span>
          )}
        </div>
        {tier === 'FREE' && (
          <p className="mt-2 text-gray-600 text-sm">Free for your whole team</p>
        )}
      </div>

      {/* CTA Button */}
      <div className="mt-8">
        {isCurrentPlan ? (
          <Button
            variant="outline"
            className="w-full"
            disabled
          >
            Current Plan
          </Button>
        ) : priceId ? (
          <SubscribeButton
            priceId={priceId}
            isCurrentPlan={isCurrentPlan}
            className={cn(
              'w-full',
              buttonColor || 'bg-gray-900 hover:bg-gray-800'
            )}
          >
            {buttonText}
          </SubscribeButton>
        ) : (
          <Button
            variant={buttonVariant}
            className="w-full"
          >
            {buttonText}
          </Button>
        )}
      </div>

      {/* Features List */}
      <ul className="mt-8 space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            <CheckIcon className="h-5 w-5 shrink-0 text-green-500" />
            <span className="text-gray-700 text-sm">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}