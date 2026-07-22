import type { DesktopApi } from '@/desktop/types';

declare global {
	interface Window {
		desktop?: DesktopApi;
	}
}

export {};
