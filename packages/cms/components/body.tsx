// Mock RichText component
// Original: import { RichText } from 'basehub/react-rich-text';

import type { ReactNode } from 'react';

type RichTextProps = {
  content?: any;
  components?: any;
  children?: ReactNode;
};

const RichText = ({ content, components, children }: RichTextProps) => {
  return null;
};

export const Body = RichText;
