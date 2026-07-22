import { Bus } from '@/primitives/bus';
import { onAuthRegistered } from '@/core/auth';

type AuthRegisteredPayload = {
	id: string;
	email: string;
};

export function registerAuthEvents(): void {
	Bus.on<AuthRegisteredPayload>('auth.registered', (ctx, payload) => onAuthRegistered(ctx, payload));
}
