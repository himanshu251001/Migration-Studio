'use client';

import { useState } from 'react';
import { Badge, Button, Modal } from '@/components/ui';
import type { TargetMapping } from '@/features/migration/target';

/** Walks through the mappings one at a time so the reviewer can approve each. */
export function MappingModal({ mappings, approved, start, onApprove, onClose }: {
	mappings: readonly TargetMapping[];
	approved: readonly string[];
	start: number;
	onApprove: (mappingId: string) => void;
	onClose: () => void;
}) {
	const [index, setIndex] = useState(start);
	const mapping = mappings[index];
	return (
		<Modal title="Mapping" onClose={onClose} wide>
			<div className="space-y-space-md">
				<Badge className="bg-surface-container-highest text-on-surface-variant">{mapping.id}</Badge>
				<div>
					<div className="text-label-md font-label-md text-outline">Legacy</div>
					<div className="text-body-md font-body-md">{mapping.legacy}</div>
				</div>
				<div>
					<div className="text-label-md font-label-md text-outline">Target</div>
					<div className="text-body-md font-body-md">{mapping.target}</div>
				</div>
				<hr className="border-outline-variant/40" />
				<p className="text-body-md font-body-md text-on-surface-variant">{mapping.text}</p>
				<div className="flex items-center justify-between gap-space-sm">
					<div className="flex items-center gap-space-sm">
						<Button icon="arrow_back" disabled={index === 0} onClick={() => setIndex(index - 1)}>Prev</Button>
						<span className="text-label-md font-label-md text-on-surface-variant">{index + 1} / {mappings.length}</span>
						<Button disabled={index === mappings.length - 1} onClick={() => setIndex(index + 1)}>Next</Button>
					</div>
					{approved.includes(mapping.id)
						? <Badge className="bg-tertiary/15 text-tertiary">Approved</Badge>
						: <Button variant="primary" onClick={() => onApprove(mapping.id)}>Approve</Button>}
				</div>
			</div>
		</Modal>
	);
}
