import { SendWelcomeEmailPayload, sendWelcomeEmail } from '@/core/mail';
import { Queue } from '@/primitives/queue';

export function registerSendWelcomeEmailJob(): void {
	Queue.on<SendWelcomeEmailPayload>('sendWelcomeEmail', (_ctx, payload) => sendWelcomeEmail(payload));
}
