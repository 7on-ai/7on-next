// Mock TableOfContents component
// Original imports from 'basehub/react-rich-text'

import type { ComponentProps, ReactNode } from 'react';

// Mock RichText component
const RichText = ({ children, components }: { children?: ReactNode; components?: any }) => {
  return null;
};

type TableOfContentsProperties = {
  readonly data: ReactNode;
  components?: any;
};

export const TableOfContents = ({
  data,
  ...props
}: TableOfContentsProperties) => {
  return null;
};
