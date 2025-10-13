'use client';

import { useState, createContext, useContext } from 'react';
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

export function BillingToggle() {
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  return (
    <BillingContext.Provider value={{ interval, setInterval }}>
      <div className="mt-8 flex justify-center">
        <div className="inline-flex items-center rounded-full bg-white p-1 shadow-sm">
          <button
            onClick={() => setInterval('monthly')}
            className={cn(
              'rounded-full px-6 py-2 text-sm font-medium transition-all',
              interval === 'monthly'
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('yearly')}
            className={cn(
              'rounded-full px-6 py-2 text-sm font-medium transition-all',
              interval === 'yearly'
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            Yearly
            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-green-700 text-xs">
              Save 17%
            </span>
          </button>
        </div>
      </div>
    </BillingContext.Provider>
  );
}