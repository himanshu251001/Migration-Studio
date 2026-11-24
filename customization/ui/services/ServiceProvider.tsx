'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { setBackendMode } from '@/lib/backendMode';
import type { Settings } from '@/features/migration/settings';
import { HttpArtifactService } from './http/httpArtifactService';
import { HttpTrackerService } from './http/httpTrackerService';
import { HttpMigrationService } from './http/HttpMigrationService';
import { HttpProjectService } from './http/httpProjectService';
import { MockMigrationService } from './mock/mockServices';
import { SwitchableMigrationService } from './switchable/SwitchableMigrationService';
import type { Services } from './types';

const ServiceContext = createContext<Services | undefined>(undefined);

/** Supplies the service implementations. Projects are real (files on disk); the pipeline is mock or real, per the Settings page. */
export function ServiceProvider({ children }: { children: React.ReactNode }) {
	const [services] = useState<Services>(() => ({ projects: new HttpProjectService(), migration: new SwitchableMigrationService(new MockMigrationService(), new HttpMigrationService()), artifacts: new HttpArtifactService(), tracker: new HttpTrackerService() }));

	useEffect(() => {
		fetch('/api/settings').then(r => r.ok ? r.json() as Promise<{ settings: Settings }> : undefined).then(d => d && setBackendMode(d.settings.backendMode)).catch(() => undefined);
	}, []);
	return <ServiceContext.Provider value={services}>{children}</ServiceContext.Provider>;
}

export function useServices(): Services {
	const services = useContext(ServiceContext);
	if (!services) {
		throw new Error('useServices must be used inside <ServiceProvider>');
	}
	return services;
}
