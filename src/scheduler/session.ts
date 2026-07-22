import { cleanExpiredSessions } from '@/core/session';
import { CronExpression, Scheduler } from '@/primitives/scheduler';

export function registerSessionScheduler(): void {
	Scheduler.on(CronExpression.EVERY_HOUR, cleanExpiredSessions, {
		name: 'expired-session-cleanup',
		noOverlap: true,
	});
}
