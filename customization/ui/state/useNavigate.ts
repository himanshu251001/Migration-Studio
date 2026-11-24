'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import type { ScreenKey } from '@/features/migration/steps';
import { isEmbedded, postToHost } from '@/lib/hostBridge';

const STUDIO_TITLE = 'Migration Studio';

/** Routes that render in the wide studio (editor tab) rather than the narrow sidebar launcher. */
function isStudioRoute(pathname: string): boolean {
	return pathname === '/studio' || pathname === '/settings' || pathname.startsWith('/migration');
}

/**
 * All in-app navigation goes through here. Inside the IDE the studio is wide, so asking for a studio view
 * from outside the studio (the narrow sidebar launcher) opens it in an editor tab instead of navigating the sidebar.
 */
export function useNavigate() {
	const router = useRouter();
	const pathname = usePathname();
	const inStudio = isStudioRoute(pathname);

	return useMemo(() => {
		/** Shows `route` in the studio: an editor tab when called from the IDE sidebar, otherwise in place. */
		const open = (route: string) => {
			if (isEmbedded() && !inStudio) {
				postToHost({ v: 1, type: 'openEditor', payload: { route, title: STUDIO_TITLE } });
			} else {
				router.push(route);
			}
		};
		return {
			/** The studio entry: detects projects and shows the matching view (select, create or the project). */
			studio: () => open('/studio'),
			screen: (key: ScreenKey) => open(`/migration/${key}`),
			/** The Settings page. Inside the IDE it always opens as its own editor tab, even from within the studio; in a plain browser it opens in a new tab. */
			settings: () => {
				if (isEmbedded()) {
					postToHost({ v: 1, type: 'openEditor', payload: { route: '/settings', title: 'Settings' } });
				} else {
					window.open('/settings', '_blank', 'noopener');
				}
			},
			/** Leaves the studio: closes its editor tab inside the IDE, otherwise returns to the launcher. */
			closeStudio: () => {
				if (isEmbedded() && inStudio) {
					postToHost({ v: 1, type: 'closeEditor', payload: {} });
				} else {
					router.push('/');
				}
			}
		};
	}, [router, inStudio]);
}
