import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// Folder Sort's ActionButton convention: shared Lucide strokes, accessible icon labels.
export function IconButton({ icon: Icon, label, children, className = '', ...props }: {
  icon: LucideIcon; label: string; children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`icon-button ${className}`} aria-label={label} title={label}>
    <Icon size={18} aria-hidden="true" />{children}
  </button>;
}
