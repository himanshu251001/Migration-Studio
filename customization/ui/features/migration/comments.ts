'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';

/** A reviewer comment on a generated artifact. */
export interface ReviewComment {
	readonly id: string;
	/** File name of the artifact the comment is on. */
	readonly artifact: string;
	/** 1-based line the comment is attached to. */
	readonly line: number;
	readonly text: string;
	readonly author: string;
}

const POLL_MS = 3000;

/**
 * The reviewer's not yet sent comments. Comments are added in the IDE's artifact editor, a different frame than
 * this one, so they are polled and refreshed when this frame regains focus.
 */
export function useReviewComments(project: Project): { comments: readonly ReviewComment[]; refresh: () => Promise<void> } {
	const { artifacts } = useServices();
	const [comments, setComments] = useState<readonly ReviewComment[]>([]);

	const refresh = useCallback(async () => {
		try {
			setComments(await artifacts.getComments(project));
		} catch {
			// keep what is shown; the next poll retries
		}
	}, [artifacts, project]);

	useEffect(() => {
		void refresh();
		const timer = setInterval(() => void refresh(), POLL_MS);
		const onFocus = () => void refresh();
		window.addEventListener('focus', onFocus);
		return () => {
			clearInterval(timer);
			window.removeEventListener('focus', onFocus);
		};
	}, [refresh]);

	return { comments, refresh };
}
