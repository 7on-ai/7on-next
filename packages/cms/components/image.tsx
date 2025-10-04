// Mock Image component
// Original: export { BaseHubImage as Image } from 'basehub/next-image';

import NextImage from 'next/image';

type ImageProps = {
  src: string;
  width?: number;
  height?: number;
  alt: string;
  className?: string;
  priority?: boolean;
};

export const Image = ({ src, width, height, alt, className, priority }: ImageProps) => {
  if (!src) return null;
  
  return (
    <NextImage
      src={src}
      width={width || 800}
      height={height || 600}
      alt={alt}
      className={className}
      priority={priority}
    />
  );
};
