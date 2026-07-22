import path from 'node:path';

export function applicationRoot(): string {
	return process.env.APPLICATION_ROOT
		? path.resolve(process.env.APPLICATION_ROOT)
		: process.cwd();
}

export function applicationDataRoot(): string {
	return process.env.APPLICATION_DATA_ROOT
		? path.resolve(process.env.APPLICATION_DATA_ROOT)
		: applicationRoot();
}

export function resolveApplicationPath(...segments: string[]): string {
	return path.resolve(applicationRoot(), ...segments);
}

export function resolveApplicationDataPath(...segments: string[]): string {
	return path.resolve(applicationDataRoot(), ...segments);
}

export function resolveWritablePath(filePath: string): string {
	return path.isAbsolute(filePath)
		? filePath
		: resolveApplicationDataPath(filePath);
}
