import { createHash } from 'crypto';
import type { EntityManager } from '@mikro-orm/core';
import variables from '@/config/variables';
import { createGitHubClient, discoverGitHubPullRequestContext, discoverGitHubRepositories, discoverGitHubRepositoriesWithGh } from '@/integrations/github';
import { PinoLogger } from '@/logger/pinoLogger';
import { Cache } from '@/primitives/cache';
import { createDashboardRepository } from '@/repositories/DashboardRepository';
import type {
	AddShortcutInput,
	DashboardConfig,
	DashboardResponse,
	GitHubRepositoryCatalog,
	IntegrationHealth,
	PullRequestItem,
	ShortcutGroupConfig,
	ShortcutGroup,
} from '@/types/dashboard';

const PULL_REQUEST_CACHE_KEY = 'github:pull-requests';
const REPOSITORY_CATALOG_CACHE_KEY = 'github:repository-catalog';

interface CachedPullRequests {
	configurationHash: string;
	fetchedAt: string;
	viewerLogin: string | null;
	items: PullRequestItem[];
	error: string | null;
}

interface CachedRepositoryCatalog {
	source: string;
	catalog: GitHubRepositoryCatalog;
}

function calculatePrCounts(items: PullRequestItem[]): { open: number; draft: number; merged: number; closed: number } {
	const counts = { open: 0, draft: 0, merged: 0, closed: 0 };
	for (const item of items) counts[item.state]++;
	return counts;
}

function shortcutGroupsFromSettings(settings: DashboardConfig): ShortcutGroup[] {
	return settings.shortcutGroups.map(group => ({
		id: group.id,
		label: group.label,
		shortcuts: group.shortcuts.map(shortcut => ({
			id: shortcut.id,
			label: shortcut.label,
			url: shortcut.url,
		})),
	}));
}

function configurationHash(settings: DashboardConfig): string {
	return createHash('sha256')
		.update(JSON.stringify({
			source: settings.githubToken ? `token:${tokenFingerprint(settings.githubToken)}` : 'gh-cli',
			version: 5,
			repositoryScopes: settings.github.repositoryScopes,
			windowDays: settings.github.windowDays,
		}))
		.digest('hex');
}

function tokenFingerprint(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

async function getGitHubRepositoryCatalog(token: string, refresh: boolean): Promise<GitHubRepositoryCatalog> {
	const fingerprint = tokenFingerprint(token);
	const source = `token:${fingerprint}`;
	if (!refresh) {
		const cached = await Cache.get<CachedRepositoryCatalog>(REPOSITORY_CATALOG_CACHE_KEY);
		if (cached?.source === source && Array.isArray(cached.catalog.teams)) return cached.catalog;
	}

	const catalog = await discoverGitHubRepositories(token);
	await Cache.set(REPOSITORY_CATALOG_CACHE_KEY, {
		source,
		catalog,
	} satisfies CachedRepositoryCatalog, variables.GITHUB_REPOSITORY_CACHE_TTL_SECONDS);
	return catalog;
}

async function getGitHubRepositoryCatalogWithGh(refresh: boolean): Promise<GitHubRepositoryCatalog> {
	const source = 'gh-cli';
	if (!refresh) {
		const cached = await Cache.get<CachedRepositoryCatalog>(REPOSITORY_CATALOG_CACHE_KEY);
		if (cached?.source === source && Array.isArray(cached.catalog.teams)) return cached.catalog;
	}

	const catalog = await discoverGitHubRepositoriesWithGh();
	await Cache.set(REPOSITORY_CATALOG_CACHE_KEY, {
		source,
		catalog,
	} satisfies CachedRepositoryCatalog, variables.GITHUB_REPOSITORY_CACHE_TTL_SECONDS);
	return catalog;
}

async function fetchPullRequests(settings: DashboardConfig, currentDateTime: Date): Promise<CachedPullRequests> {
	const hash = configurationHash(settings);
	try {
		const result = await createGitHubClient({
			repositoryScopes: settings.github.repositoryScopes,
			windowDays: settings.github.windowDays ?? 7,
			requestedAt: currentDateTime,
		}).fetchPullRequests();
		return {
			configurationHash: hash,
			fetchedAt: currentDateTime.toISOString(),
			viewerLogin: result.viewerLogin,
			items: result.items,
			error: null,
		};
	} catch (error) {
		const message = (error instanceof Error ? error.message : 'Unknown error').slice(0, 200);
		PinoLogger.warn({ scope: 'dashboard', message: 'GitHub integration failed', error: message });
		return {
			configurationHash: hash,
			fetchedAt: currentDateTime.toISOString(),
			viewerLogin: null,
			items: [],
			error: message,
		};
	}
}

async function getPullRequests(settings: DashboardConfig, currentDateTime: Date, forceRefresh: boolean): Promise<CachedPullRequests | null> {
	if (!forceRefresh) {
		const cached = await Cache.get<CachedPullRequests>(PULL_REQUEST_CACHE_KEY);
		if (cached?.configurationHash === configurationHash(settings)
			&& cached.items.every(item => typeof item.involved === 'boolean')) return cached;
	}

	const fresh = await fetchPullRequests(settings, currentDateTime);
	await Cache.set(PULL_REQUEST_CACHE_KEY, fresh, variables.DASHBOARD_CACHE_TTL_SECONDS);
	return fresh;
}

function buildDashboard(settings: DashboardConfig, pullRequestData: CachedPullRequests | null, currentDateTime: Date): DashboardResponse {
	let githubHealth: IntegrationHealth;
	if (!settings.githubToken && !pullRequestData) {
		githubHealth = {
			state: 'unconfigured',
			lastSuccessAt: null,
			message: 'Install and authenticate GitHub CLI or add github configuration to enable this integration.',
		};
	} else if (pullRequestData?.error) {
		githubHealth = {
			state: 'error',
			lastSuccessAt: null,
			message: pullRequestData.error,
		};
	} else {
		githubHealth = {
			state: 'ok',
			lastSuccessAt: pullRequestData?.fetchedAt ?? null,
			message: null,
		};
	}

	const items = pullRequestData?.items ?? [];
	return {
		generatedAt: currentDateTime.toISOString(),
		lastRefreshAt: pullRequestData?.fetchedAt ?? null,
		stale: githubHealth.state === 'error',
		timeZone: settings.timeZone,
		timeFormat: settings.timeFormat ?? '12',
		theme: settings.theme ?? 'light',
		soundsEnabled: settings.soundsEnabled ?? false,
		displayName: settings.displayName,
		shortcutLimit: settings.shortcutLimit ?? 8,
		githubTokenConfigured: !!settings.githubToken,
		pullRequests: {
			windowDays: settings.github.windowDays ?? 7,
			viewerLogin: pullRequestData?.viewerLogin ?? null,
			counts: calculatePrCounts(items),
			items,
		},
		shortcutGroups: shortcutGroupsFromSettings(settings),
		integrations: { github: githubHealth },
	};
}

async function loadDashboard(db: EntityManager, currentDateTime: Date, forceRefresh: boolean): Promise<DashboardResponse> {
	const settings = await createDashboardRepository(db).getSettings();
	const pullRequests = await getPullRequests(settings, currentDateTime, forceRefresh);
	return buildDashboard(settings, pullRequests, currentDateTime);
}

async function get(db: EntityManager, currentDateTime: Date): Promise<DashboardResponse> {
	return loadDashboard(db, currentDateTime, false);
}

async function refreshPullRequests(db: EntityManager, currentDateTime: Date): Promise<DashboardResponse> {
	return loadDashboard(db, currentDateTime, true);
}

async function settings(db: EntityManager): Promise<DashboardConfig> {
	return createDashboardRepository(db).getSettings();
}

async function githubRepositories(db: EntityManager, refresh: boolean): Promise<GitHubRepositoryCatalog | null> {
	const config = await createDashboardRepository(db).getSettings();
	return config.githubToken ? getGitHubRepositoryCatalog(config.githubToken, refresh) : getGitHubRepositoryCatalogWithGh(refresh);
}

async function updateSettings(db: EntityManager, input: Parameters<ReturnType<typeof createDashboardRepository>['updateSettings']>[0] & { repositoryScopes?: string[] }): Promise<DashboardConfig> {
	const repository = createDashboardRepository(db);
	const updated = await repository.updateSettings(input);
	if (!Array.isArray(input.repositoryScopes)) return updated;
	await repository.setRepositoryScopes(input.repositoryScopes);
	return repository.getSettings();
}

async function addShortcut(db: EntityManager, input: AddShortcutInput) {
	return createDashboardRepository(db).addShortcut(input);
}

async function addShortcuts(db: EntityManager, inputs: AddShortcutInput[]) {
	return createDashboardRepository(db).addShortcuts(inputs);
}

async function updateShortcut(db: EntityManager, id: string, input: { label?: string; url?: string }) {
	return createDashboardRepository(db).updateShortcut(id, input);
}

async function deleteShortcut(db: EntityManager, id: string) {
	return createDashboardRepository(db).deleteShortcut(id);
}

async function reorderShortcuts(db: EntityManager, groupId: string, shortcutIds: string[]) {
	return createDashboardRepository(db).reorderShortcuts(groupId, shortcutIds);
}

async function importShortcuts(db: EntityManager, shortcutGroups: ShortcutGroupConfig[]) {
	return createDashboardRepository(db).importShortcuts(shortcutGroups);
}

export const dashboard = Object.freeze({
	get,
	refreshPullRequests,
	settings,
	githubRepositories,
	updateSettings,
	addShortcut,
	addShortcuts,
	updateShortcut,
	deleteShortcut,
	reorderShortcuts,
	importShortcuts,
});
