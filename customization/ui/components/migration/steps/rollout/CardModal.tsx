'use client';

import { Modal } from '@/components/ui';
import type { RolloutCard } from '@/features/migration/rollout';

/** Shows the bullet points of one rollout strategy card. */
export function CardModal({ card, onClose }: { card: RolloutCard; onClose: () => void }) {
	return (
		<Modal title={card.title} onClose={onClose} wide>
			<ul className="space-y-space-sm">
				{card.bullets.map(b => (
					<li key={b} className="flex gap-space-sm text-body-md font-body-md">
						<span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
						{b}
					</li>
				))}
			</ul>
		</Modal>
	);
}
