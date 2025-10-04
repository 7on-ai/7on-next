import type { ReactNode } from 'react';

type FeedProps = {
  queries: any[];
  children: (...data: any[]) => ReactNode | Promise<ReactNode>; // เปลี่ยนเป็น ...data
};

// Mock Feed component - replace with actual Pump from basehub when ready
export const Feed = ({ queries, children }: FeedProps) => {
  return null;
};
//export { Pump as Feed } from 'basehub/react-pump';
