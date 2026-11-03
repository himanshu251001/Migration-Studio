import type { Metadata } from 'next';
import './globals.css';
import { HostBridgeProvider } from '@/components/HostBridgeProvider';

export const metadata: Metadata = { title: 'Migration Studio' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<HostBridgeProvider>{children}</HostBridgeProvider>
			</body>
		</html>
	);
}
