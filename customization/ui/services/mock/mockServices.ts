import type { AnalysisResult } from '@/features/migration/analyze';
import type { MigrationService } from '../types';
import { ANALYZE_FIXTURE } from './fixtures/analyze';

/** Simulated latency so loading states are real. */
function delay<T>(value: T, ms: number): Promise<T> {
	return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

const ANALYZE_DURATION_MS = 9000;
const TICK_MS = 100;

/** Pipeline stand-in until the backend exists (later phases). */
export class MockMigrationService implements MigrationService {
	start() {
		return delay(undefined, 1800);
	}

	getAnalysis(): Promise<AnalysisResult> {
		return delay(ANALYZE_FIXTURE, 250);
	}

	runAnalysis(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return new Promise((resolve, reject) => {
			let progress = 0;
			const timer = setInterval(() => {
				progress = Math.min(1, progress + TICK_MS / ANALYZE_DURATION_MS);
				onProgress(progress);
				if (progress >= 1) {
					clearInterval(timer);
					signal.removeEventListener('abort', onAbort);
					resolve();
				}
			}, TICK_MS);
			const onAbort = () => {
				clearInterval(timer);
				reject(new DOMException('Analysis stopped', 'AbortError'));
			};
			if (signal.aborted) {
				onAbort();
			} else {
				signal.addEventListener('abort', onAbort, { once: true });
			}
		});
	}
}
