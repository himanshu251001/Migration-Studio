import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';

const VARIANTS = {
	primary: 'bg-primary-container hover:bg-secondary-container text-on-primary-container font-medium shadow-sm',
	secondary: 'bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant',
	ghost: 'hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: keyof typeof VARIANTS;
	icon?: string;
}

export function Button({ variant = 'secondary', icon, className = '', children, type = 'button', ...rest }: ButtonProps) {
	return (
		<button
			type={type}
			className={`px-3.5 py-1.5 rounded text-body-sm font-body-sm inline-flex items-center justify-center gap-space-xs transition-colors active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${className}`}
			{...rest}
		>
			{icon && <Icon name={icon} className="text-[16px]" />}
			{children}
		</button>
	);
}
