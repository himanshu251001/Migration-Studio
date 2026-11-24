import { getBackendMode } from '@/lib/backendMode';
import type { MigrationService } from '../types';

/**
 * Forwards every call to the mock or the real service, chosen at call time. Hooks keep one stable service while the
 * user flips the backend in Settings. A run already in flight stays on the service that started it.
 */
export class SwitchableMigrationService {
	constructor(mock: MigrationService, real: MigrationService) {
		return new Proxy(this, {
			get: (target, prop, receiver) => {
				if (prop === 'then' || typeof prop === 'symbol') {
					return Reflect.get(target, prop, receiver);
				}
				const service = getBackendMode() === 'real' ? real : mock;
				const member = service[prop as keyof MigrationService] as unknown;
				return typeof member === 'function' ? member.bind(service) : member;
			}
		});
	}
}

export interface SwitchableMigrationService extends MigrationService { }
