'use client';

import { createContext, useContext, useState } from 'react';
import { HttpProjectService } from './http/httpProjectService';
import { MockMigrationService } from './mock/mockServices';
import type { Services } from './types';

const ServiceContext = createContext<Services | undefined>(undefined);

/** Supplies the service implementations. Projects are real (files on disk); the pipeline is still mocked. */
export function ServiceProvider({ children }: { children: React.ReactNode }) {
	const [services] = useState<Services>(() => ({ projects: new HttpProjectService(), migration: new MockMigrationService() }));
	return <ServiceContext.Provider value={services}>{children}</ServiceContext.Provider>;
}

export function useServices(): Services {
	const services = useContext(ServiceContext);
	if (!services) {
		throw new Error('useServices must be used inside <ServiceProvider>');
	}
	return services;
}
