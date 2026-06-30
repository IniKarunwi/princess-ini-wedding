import { ReactNode } from 'react';

interface GlassPillProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export default function GlassPill({ children, onClick, className = '' }: GlassPillProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-[18px] py-[9px] ${className}`}
      style={{
        background: 'rgba(20, 16, 12, 0.65)',
        border: '1px solid rgba(201, 168, 76, 0.45)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </Tag>
  );
}
