import { notFound } from 'next/navigation';
import { MigrationScreen } from '@/components/migration/MigrationScreen';
import { isScreenKey } from '@/features/migration/steps';

export default async function Page({ params }: { params: Promise<{ step: string }> }) {
	const { step } = await params;
	if (!isScreenKey(step)) {
		notFound();
	}
	return <MigrationScreen screen={step} />;
}
