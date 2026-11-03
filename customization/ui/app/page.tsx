'use client';

import { useHostTheme } from '@/components/useHostTheme';

export default function Page() {
	const theme = useHostTheme();
	return (
		<main className="p-3">
			<h1 className="text-sm font-semibold uppercase tracking-wide">Migration Studio</h1>
			<p className="mt-2" style={{ color: 'var(--vscode-descriptionForeground)' }}>
				Next.js customization layer is running inside the IDE.
			</p>
		</main>
	);
}
