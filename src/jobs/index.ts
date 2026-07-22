import { registerSendWelcomeEmailJob } from './sendWelcomeEmail';

export function registerJobs(): void {
	registerSendWelcomeEmailJob();
}
