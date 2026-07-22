export type AudioCaptureStatus = 'idle' | 'capturing';

export type DesktopApi = {
	system: {
		getPlatform(): Promise<NodeJS.Platform>;
	};
	audio: {
		getStatus(): Promise<AudioCaptureStatus>;
		start(): Promise<void>;
		stop(): Promise<void>;
	};
};
