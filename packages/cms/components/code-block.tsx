// Mock CodeBlock component
// Original: export { CodeBlock } from 'basehub/react-code-block';

type CodeBlockProps = {
  theme?: string;
  snippets?: Array<{
    code: string;
    language: string;
  }>;
};

export const CodeBlock = ({ theme, snippets }: CodeBlockProps) => {
  return null;
};
