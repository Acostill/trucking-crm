import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', noPadding = false }) => {
  return (
    <div 
      className={`
        bg-white/70 backdrop-blur-xl 
        border border-white/40 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] 
        rounded-2xl transition-all duration-300 hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)]
        ${noPadding ? '' : 'p-6'} 
        ${className}
      `}
    >
      {children}
    </div>
  );
};
