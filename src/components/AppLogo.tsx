/**
 * App Logo Component
 * 
 * Displays the Speak2MyAI logo.
 */

import appLogo from '@/assets/app-logo.png';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-10 h-10',
  md: 'w-16 h-16',
  lg: 'w-24 h-24',
};

export function AppLogo({ size = 'md', className = '' }: AppLogoProps) {
  return (
    <img
      src={appLogo}
      alt="Speak2MyAI"
      className={`${sizeClasses[size]} rounded-2xl object-cover ${className}`}
    />
  );
}
