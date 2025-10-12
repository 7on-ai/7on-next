'use client';

import { Button } from '@repo/design-system/components/ui/button';
import { CheckIcon } from 'lucide-react';
import { SubscribeButton } from './subscribe-button';
import { cn } from '@repo/design-system/lib/utils';

interface PricingCardProps {
  tier: 'FREE' | 'PRO';
  name: string;
  price: number;
  interval: 'month' | 'year';
  description: string;
  features: string[];
  priceId: string | null;
  isCurrentPlan: boolean;
  isPopular?: boolean;
  isFree?: boolean;
}

export function PricingCard({
  tier,
  name,
  price,
  interval,
  description,
  features,
  priceId,
  isCurrentPlan,
  isPopular,
  isFree,
}: PricingCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border transition-all duration-300',
        isPopular
          ? 'border-primary/50 bg-gradient-to-b from-primary/5 to-transparent shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/20'
          : 'border-border/50 bg-card/50 backdrop-blur-sm hover:border-border hover:bg-card/80'
      )}
    >
      {/* Popular Badge */}
      {isPopular && (
        <div className="absolute top-4 right-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-3 py-1 text-xs font-semibold text-white">
          Popular
        </div>
      )}

      {/* Current Plan Badge */}
      {isCurrentPlan && (
        <div className="absolute top-4 left-4 rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Current Plan
        </div>
      )}

      <div className="p-8">
        {/* Header */}
        <div className="mb-6">
          <h3 className="text-2xl font-bold">{name}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Price */}
        <div className="mb-8">
          <div className="flex items-baseline">
            <span className="text-5xl font-bold tracking-tight">
              ${price}
            </span>
            <span className="ml-2 text-muted-foreground">/{interval}</span>
          </div>
        </div>

        {/* CTA Button */}
        <div className="mb-8">
          {isFree ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={isCurrentPlan}
            >
              {isCurrentPlan ? 'Current Plan' : 'Get Started'}
            </Button>
          ) : (
            <SubscribeButton
              priceId={priceId!}
              isCurrentPlan={isCurrentPlan}
            />
          )}
        </div>

        {/* Features */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">What's included:</p>
          <ul className="space-y-2">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-3 text-sm">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Animated Border Gradient (for popular card) */}
      {isPopular && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 opacity-50 blur-xl" />
        </div>
      )}
    </div>
  );
}