export type AudioCaptureStatus = 'idle' | 'capturing';
export type DesktopThemeSource = 'light' | 'dark' | 'system';

export type DesktopApi = {
	system: {
		getPlatform(): Promise<NodeJS.Platform>;
	};
	app: {
		restart(): Promise<void>;
	};
	theme: {
		setSource(theme: DesktopThemeSource): Promise<void>;
	};
	audio: {
		getStatus(): Promise<AudioCaptureStatus>;
		start(): Promise<void>;
		stop(): Promise<void>;
	};
};
