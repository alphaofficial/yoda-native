import { play, setEnabled, type SoundName } from 'cuelume';

export function applySoundPreference(enabled: boolean) {
	setEnabled(enabled);
	document.documentElement.dataset.sounds = enabled ? 'enabled' : 'disabled';
}

export function playSound(name: SoundName) {
	play(name);
}
