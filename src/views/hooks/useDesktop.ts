import type { DesktopApi } from '@/desktop/types';

export function useDesktop(): DesktopApi | null {
	return window.desktop ?? null;
}
