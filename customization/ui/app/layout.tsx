import type { Metadata } from 'next';
import './globals.css';
import { HostBridgeProvider } from '@/components/HostBridgeProvider';
import { ServiceProvider } from '@/services/ServiceProvider';
import { MigrationProvider } from '@/state/MigrationProvider';

export const metadata: Metadata = { title: 'Migration Studio' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<HostBridgeProvider>
					<ServiceProvider>
						<MigrationProvider>{children}</MigrationProvider>
					</ServiceProvider>
				</HostBridgeProvider>
			</body>
		</html>
	);
}
