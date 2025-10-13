'use client';

import { useState, createContext, useContext, type ReactNode } from 'react';
import { cn } from '@repo/design-system/lib/utils';

type BillingInterval = 'monthly' | 'yearly';

const BillingContext = createContext<{
  interval: BillingInterval;
  setInterval: (interval: BillingInterval) => void;
}>({
  interval: 'monthly',
  setInterval: () => {},
});

export const useBilling = () => useContext(BillingContext);

// Provider Component
export function BillingProvider({ children }: { children: ReactNode }) {
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  return (
    <BillingContext.Provider value={{ interval, setInterval }}>
      {children}
    </BillingContext.Provider>
  );
}

// Toggle Component
export function BillingToggle() {
  const { interval, setInterval } = useBilling();

  return (
    <div className="mt-8 flex justify-center">
      <div className="inline-flex items-center gap-1 rounded-full border bg-background p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setInterval('monthly')}
          className={cn(
            'rounded-full px-6 py-2 text-sm font-medium transition-all',
            interval === 'monthly'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval('yearly')}
          className={cn(
            'flex items-center gap-2 rounded-full px-6 py-2 text-sm font-medium transition-all',
            interval === 'yearly'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Yearly
          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-green-600 text-xs font-semibold">
            Save 17%
          </span>
        </button>
      </div>
    </div>
  );
}