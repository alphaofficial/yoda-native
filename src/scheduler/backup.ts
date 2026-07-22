import { runScheduledDatabaseBackup } from '@/core/backup';
import { CronExpression, Scheduler } from '@/primitives/scheduler';

export function registerBackupScheduler(): void {
	Scheduler.on(CronExpression.EVERY_HOUR, runScheduledDatabaseBackup, {
		name: 'database-backup',
		noOverlap: true,
	});
}
