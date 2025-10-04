import type { ReactNode } from 'react';

type FeedProps = {
  queries: any[];
  children: (data: any[]) => ReactNode | Promise<ReactNode>;
};

// Mock Feed component - replace with actual Pump from basehub when ready
export const Feed = ({ queries, children }: FeedProps) => {
  return null;
};
