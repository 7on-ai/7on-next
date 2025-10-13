import { getUserTier } from '@repo/auth/server';
import type { Metadata } from 'next';
import { PricingCard } from './components/pricing-card-v2';
import { BillingToggle } from './components/billing-toggle';

export const metadata: Metadata = {
  title: 'Pricing - Choose Your Plan',
  description: 'Simple, transparent pricing. Upgrade anytime.',
};

export default async function PricingPage() {
  const currentTier = await getUserTier();

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-purple-100/30 via-blue-100/30 to-pink-100/30">
      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Header */}

        {/* Billing Toggle */}
        <BillingToggle />

        {/* Pricing Cards */}
        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {/* FREE Plan */}
          <PricingCard
            tier="FREE"
            name="Free"
            monthlyPrice={0}
            yearlyPrice={0}
            description="For individuals or teams looking to organize anything."
            features={[
              'Access to basic dashboard',
              'Basic service connection',
            ]}
            buttonText="Get started"
            buttonVariant="outline"
            priceIds={null}
            isCurrentPlan={currentTier === 'FREE'}
          />

          {/* PRO Plan (Standard) */}
          <PricingCard
            tier="PRO"
            name="Standard"
            monthlyPrice={29}
            yearlyPrice={290}
            description="For teams that need to manage more work."
            features={[
              'Full service connection',
              'Advanced dashboard',
              'Unlimited API calls',
              'Export data',
              'Priority support',
            ]}
            buttonText="Upgrade Now"
            buttonVariant="default"
            buttonColor="bg-cyan-500 hover:bg-cyan-600"
            priceIds={{
              monthly: 'price_1Ric5JDLk0PkB2fKhSmA0GoO',
              yearly: 'price_1SHbUfDLk0PkB2fKliMAf7R4',
            }}
            isCurrentPlan={currentTier === 'PRO'}
            isPopular
          />

          {/* BUSINESS Plan (Premium) */}
          <PricingCard
            tier="BUSINESS"
            name="Premium"
            monthlyPrice={79}
            yearlyPrice={790}
            description="Best for teams that need to track multiple projects."
            features={[
              'Everything in Standard',
              'Custom branding',
              'SSO integration',
              'Dedicated support',
              'API access',
              'Advanced security',
            ]}
            buttonText="Try for free"
            buttonVariant="default"
            buttonColor="bg-orange-500 hover:bg-orange-600"
            priceIds={{
              monthly: 'price_1SHbwMDLk0PkB2fKP0kXrabL',
              yearly: 'price_1SHbxXDLk0PkB2fKCJYkEJCC',
            }}
            isCurrentPlan={currentTier === 'BUSINESS'}
          />
        </div>
      </div>
    </div>
  );
}