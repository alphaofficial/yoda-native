import { registerSessionScheduler } from './session';
import { registerBackupScheduler } from './backup';

export function registerSchedulerTasks(): void {
	registerSessionScheduler();
	registerBackupScheduler();
}
