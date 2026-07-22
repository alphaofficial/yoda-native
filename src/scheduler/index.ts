import { registerSessionScheduler } from './session';

export function registerSchedulerTasks(): void {
	registerSessionScheduler();
}
