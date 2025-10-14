import { cn } from '@repo/design-system/lib/utils';
import { SparklesIcon } from 'lucide-react';

interface ProBadgeProps {
  tier?: 'PRO' | 'BUSINESS';
  className?: string;
  showIcon?: boolean;
}

/**
 * Pro Badge Component
 * Display badge indicating premium features
 */
export function ProBadge({ 
  tier = 'PRO', 
  className,
  showIcon = true 
}: ProBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        tier === 'PRO'
          ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
          : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
        className
      )}
    >
      {showIcon && <SparklesIcon className="h-3 w-3" />}
      {tier}
    </span>
  );
}