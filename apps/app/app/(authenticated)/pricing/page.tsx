import { getUserTier, TIER_PRICING, TIER_FEATURES, FEATURE_DESCRIPTIONS } from '@repo/auth/server';
import type { Metadata } from 'next';
import { PricingCard } from './components/pricing-card';

export const metadata: Metadata = {
  title: 'Pricing - Choose Your Plan',
  description: 'Simple, transparent pricing. Upgrade anytime.',
};

export default async function PricingPage() {
  const currentTier = await getUserTier();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Animated Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/4 h-[800px] w-[800px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 h-[800px] w-[800px] rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl lg:text-6xl">
            Choose Your Plan
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Simple, transparent pricing. Upgrade anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="mt-16 grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* FREE Plan */}
          <PricingCard
            tier="FREE"
            name={TIER_PRICING.FREE.name}
            price={TIER_PRICING.FREE.price}
            interval={TIER_PRICING.FREE.interval}
            description={TIER_PRICING.FREE.description}
            features={TIER_FEATURES.FREE.map(f => FEATURE_DESCRIPTIONS[f])}
            priceId={null}
            isCurrentPlan={currentTier === 'FREE'}
            isFree
          />

          {/* PRO Plan */}
          <PricingCard
            tier="PRO"
            name={TIER_PRICING.PRO.name}
            price={TIER_PRICING.PRO.price}
            interval={TIER_PRICING.PRO.interval}
            description={TIER_PRICING.PRO.description}
            features={TIER_FEATURES.PRO.map(f => FEATURE_DESCRIPTIONS[f])}
            priceId={TIER_PRICING.PRO.priceId}
            isCurrentPlan={currentTier === 'PRO'}
            isPopular
          />
        </div>

        {/* FAQ or Additional Info */}
        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Need help choosing? Contact us at{' '}
            <a href="mailto:support@7on.ai" className="text-primary hover:underline">
              support@7on.ai
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}