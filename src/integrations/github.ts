import { createHttpClient, IntegrationRequestError } from '@/integrations/http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GitHubPullRequestContext, GitHubRepository, GitHubRepositoryCatalog, PullRequestCheckStatus, PullRequestItem } from '@/types/dashboard';

const execFileAsync = promisify(execFile);

interface GitHubClientOptions {
	repositoryScopes: string[];
	windowDays: number;
	requestedAt: Date;
}

interface GitHubPullRequestResult {
	items: PullRequestItem[];
	unconfigured: boolean;
	viewerLogin: string | null;
}

interface RawRepository {
	id: number;
	name: string;
	full_name: string;
	private: boolean;
	archived: boolean;
	owner: { login: string; type: 'User' | 'Organization' };
}

interface RawTeam {
	slug: string;
	organization: { login: string };
}

interface RawOwner {
	login: string;
	type: 'User' | 'Organization';
}

interface RawPullRequest {
	__typename: 'PullRequest';
	id: string;
	number: number;
	title: string;
	url: string;
	createdAt: string;
	updatedAt: string;
	isDraft: boolean;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	mergedAt: string | null;
	author: { login: string } | null;
	repository: { nameWithOwner: string };
	labels: { nodes: Array<{ name: string }> };
}

interface SearchResponse {
	data?: {
		search?: {
			nodes: RawPullRequest[];
			pageInfo: { endCursor: string | null; hasNextPage: boolean };
		};
	};
	errors?: Array<{ message: string }>;
}

interface GhPullRequest {
	id: string;
	number: number;
	title: string;
	url: string;
	createdAt: string;
	updatedAt: string;
	isDraft: boolean;
	state: string;
	mergedAt?: string | null;
	author?: { login?: string; url?: string } | null;
	repository?: { nameWithOwner?: string } | null;
	labels?: Array<{ name: string }> | null;
	reviewDecision?: string | null;
	headRefName?: string | null;
	checkStatus?: PullRequestCheckStatus;
}

interface GhStatusCheck {
	__typename?: string;
	state?: string;
	conclusion?: string | null;
	status?: string | null;
}

interface GhRepository {
	name: string;
	nameWithOwner: string;
	isPrivate: boolean;
	isArchived: boolean;
	owner: { login: string; type?: 'User' | 'Organization' };
}

const GITHUB_HEADERS = {
	'Accept': 'application/vnd.github+json',
	'X-GitHub-Api-Version': '2022-11-28',
};
const GITHUB_BASE_URL = 'https://api.github.com';

export async function discoverGitHubRepositories(token: string): Promise<GitHubRepositoryCatalog> {
	const client = createHttpClient(GITHUB_BASE_URL);
	const headers = { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };
	const viewer = await client.get<{ login: string }>('/user', {
		headers,
	});

	const repositories: GitHubRepository[] = [];
	for (let page = 1; ; page++) {
		const result = await client.get<RawRepository[]>(`/user/repos?affiliation=owner%2Ccollaborator%2Corganization_member&visibility=all&sort=full_name&direction=asc&per_page=100&page=${page}`, {
			headers,
		});

		repositories.push(...result.map(repository => ({
			id: repository.id,
			name: repository.name,
			fullName: repository.full_name,
			owner: repository.owner.login,
			ownerType: repository.owner.type,
			private: repository.private,
			archived: repository.archived,
		})));

		if (result.length < 100) break;
	}
	const teams: string[] = [];
	for (let page = 1; ; page++) {
		const result = await client.get<RawTeam[]>(`/user/teams?per_page=100&page=${page}`, { headers });
		teams.push(...result.map(team => `${team.organization.login}/${team.slug}`));
		if (result.length < 100) break;
	}

	return {
		viewerLogin: viewer.login,
		repositories,
		defaultScopes: [`${viewer.login}/*`],
		teams: Array.from(new Set(teams)).sort((a, b) => a.localeCompare(b)),
	};
}

export async function discoverGitHubRepositoriesWithGh(): Promise<GitHubRepositoryCatalog> {
	const viewerLogin = await getGhViewerLogin();
	if (!viewerLogin) throw new Error('GitHub CLI is not authenticated. Run gh auth login.');
	const owners = [viewerLogin, ...await getGhOrganizations()];
	const repositoryLists = await Promise.all(owners.map(async owner => {
		try {
			const output = await runGh(['repo', 'list', owner, '--limit', '1000', '--json', 'name,nameWithOwner,owner,isPrivate,isArchived']);
			return JSON.parse(output || '[]') as GhRepository[];
		} catch {
			return [];
		}
	}));
	const repositoriesByFullName = new Map<string, GhRepository>();
	for (const repository of repositoryLists.flat()) repositoriesByFullName.set(repository.nameWithOwner.toLowerCase(), repository);
	const repositories = Array.from(repositoriesByFullName.values()).sort((a, b) => a.nameWithOwner.localeCompare(b.nameWithOwner)).map((repository, index) => ({
		id: index + 1,
		name: repository.name,
		fullName: repository.nameWithOwner,
		owner: repository.owner.login,
		ownerType: repository.owner.type ?? 'User',
		private: repository.isPrivate,
		archived: repository.isArchived,
	} satisfies GitHubRepository));
	const teams = await getGhTeams();
	return {
		viewerLogin,
		repositories,
		defaultScopes: [`${viewerLogin}/*`],
		teams,
	};
}

export async function discoverGitHubPullRequestContext(token: string, repositoryScopes: string[]): Promise<GitHubPullRequestContext> {
	const client = createHttpClient(GITHUB_BASE_URL);
	const headers = { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };
	const wildcardOwners = Array.from(new Set(repositoryScopes
		.filter(scope => scope.endsWith('/*'))
		.map(scope => scope.slice(0, -2).toLowerCase())));

	const teamsPromise = (async () => {
		const teams: string[] = [];
		for (let page = 1; ; page++) {
			const result = await client.get<RawTeam[]>(`/user/teams?per_page=100&page=${page}`, { headers });
			teams.push(...result.map(team => `${team.organization.login}/${team.slug}`));
			if (result.length < 100) return Array.from(new Set(teams)).sort((a, b) => a.localeCompare(b));
		}
	})();
	const [viewer, teams, owners] = await Promise.all([
		client.get<{ login: string }>('/user', { headers }),
		teamsPromise,
		Promise.all(wildcardOwners.map(owner => client.get<RawOwner>(`/users/${encodeURIComponent(owner)}`, { headers }))),
	]);

	return {
		viewerLogin: viewer.login,
		teams,
		ownerTypes: Object.fromEntries(owners.map(owner => [owner.login.toLowerCase(), owner.type])),
	};
}

export function createGitHubClient(options: GitHubClientOptions) {
	const { repositoryScopes, windowDays, requestedAt } = options;
	const client = createHttpClient(GITHUB_BASE_URL);

	async function fetchPullRequests(): Promise<GitHubPullRequestResult> {
		return fetchPullRequestsWithGh(repositoryScopes, windowDays, requestedAt);
	}

	return { fetchPullRequests };
}

async function fetchPullRequestsWithGh(repositoryScopes: string[], windowDays: number, requestedAt: Date): Promise<GitHubPullRequestResult> {
	const boundedWindowDays = Math.max(1, Math.min(30, Math.trunc(windowDays)));
	const cutoff = requestedAt.getTime() - boundedWindowDays * 24 * 60 * 60 * 1000;
	const cutoffDate = new Date(cutoff).toISOString().slice(0, 10);
	return getGhSearchPullRequests(repositoryScopes, cutoffDate);
}

async function getGhSearchPullRequests(repositoryScopes: string[], cutoffDate: string): Promise<GitHubPullRequestResult> {
	const viewerLogin = await getGhViewerLogin();
	const scopes = repositoryScopes.filter(scope => scope.trim().length > 0);
	const searchScopes = scopes.length > 0 ? scopes : [null];

	const [outputsWithInvolves, outputsWithoutInvolves] = await Promise.all([
		Promise.all(searchScopes.map(scope => runGh(buildGhPullRequestSearchArgs(cutoffDate, viewerLogin, scope, true)))),
		Promise.all(searchScopes.map(scope => runGh(buildGhPullRequestSearchArgs(cutoffDate, viewerLogin, scope, false)))),
	]);

	const pullRequestsById = new Map<string, GhPullRequest>();
	const involvedIds = new Set<string>();

	for (const output of outputsWithInvolves) {
		for (const pullRequest of JSON.parse(output || '[]') as GhPullRequest[]) {
			const id = pullRequest.id || `${pullRequest.repository?.nameWithOwner ?? ''}#${pullRequest.number}`;
			pullRequestsById.set(id, pullRequest);
			involvedIds.add(id);
		}
	}

	for (const output of outputsWithoutInvolves) {
		for (const pullRequest of JSON.parse(output || '[]') as GhPullRequest[]) {
			const id = pullRequest.id || `${pullRequest.repository?.nameWithOwner ?? ''}#${pullRequest.number}`;
			if (!involvedIds.has(id)) {
				pullRequestsById.set(id, pullRequest);
			}
		}
	}

	const pullRequests = await enrichGhPullRequests(Array.from(pullRequestsById.values()));
	return {
		items: pullRequests.map(pullRequest => {
			const id = pullRequest.id || `${pullRequest.repository?.nameWithOwner ?? ''}#${pullRequest.number}`;
			return normalizeGhPullRequest(pullRequest.repository?.nameWithOwner ?? '', pullRequest, !involvedIds.has(id));
		}).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
		unconfigured: false,
		viewerLogin,
	};
}

function buildGhPullRequestSearchArgs(cutoffDate: string, viewerLogin: string | null, scope: string | null, includeInvolves = true): string[] {
	const args = ['search', 'prs', '--updated', `>=${cutoffDate}`, '--limit', '100', '--json', 'id,number,title,url,createdAt,updatedAt,state,author,labels,repository'];
	if (includeInvolves) {
		args.push('--involves', viewerLogin ?? '@me');
	}
	if (!scope) return args;
	if (scope.endsWith('/*')) args.push('--owner', scope.slice(0, -2));
	else args.push('--repo', scope);
	return args;
}

async function enrichGhPullRequests(pullRequests: GhPullRequest[]): Promise<GhPullRequest[]> {
	return Promise.all(pullRequests.map(async pullRequest => {
		const repository = pullRequest.repository?.nameWithOwner;
		if (!repository) return pullRequest;
		try {
			const output = await runGh(['pr', 'view', String(pullRequest.number), '--repo', repository, '--json', 'headRefName,author,statusCheckRollup']);
			const detail = JSON.parse(output || '{}') as { headRefName?: string; author?: { login?: string; url?: string } | null; statusCheckRollup?: GhStatusCheck[] };
			return { ...pullRequest, headRefName: detail.headRefName ?? null, author: detail.author ?? pullRequest.author, checkStatus: normalizeGhCheckStatus(detail.statusCheckRollup ?? []) };
		} catch {
			return pullRequest;
		}
	}));
}

function normalizeGhCheckStatus(checks: GhStatusCheck[]): PullRequestCheckStatus {
	if (checks.length === 0) return 'unknown';
	const states = checks.map(check => (check.conclusion ?? check.state ?? check.status ?? '').toUpperCase());
	if (states.some(state => ['FAILURE', 'FAILED', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(state))) return 'failure';
	if (states.some(state => ['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED', 'EXPECTED'].includes(state))) return 'pending';
	if (states.every(state => ['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'NEUTRAL', 'SKIPPED'].includes(state))) return 'success';
	return 'unknown';
}

async function getGhViewerLogin(): Promise<string | null> {
	try {
		return (await runGh(['api', 'user', '--jq', '.login'])).trim() || null;
	} catch {
		return null;
	}
}

async function getGhOrganizations(): Promise<string[]> {
	try {
		const output = await runGh(['api', 'user/orgs', '--paginate', '--jq', '.[].login']);
		return Array.from(new Set(output.split('\n').map(organization => organization.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}

async function getGhTeams(): Promise<string[]> {
	try {
		const output = await runGh(['api', 'user/teams', '--paginate', '--jq', '.[] | "\(.organization.login)/\(.slug)"']);
		return Array.from(new Set(output.split('\n').map(team => team.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}

async function runGh(args: string[]): Promise<string> {
	const { stdout } = await execFileAsync('gh', args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
	return stdout;
}

function buildRepositorySearchQualifiers(scopes: string[], context: GitHubPullRequestContext): string[] {
	const qualifiers = new Set<string>();
	for (const scope of scopes) {
		if (scope.endsWith('/*')) {
			const owner = scope.slice(0, -2);
			const ownerType = owner.toLowerCase() === context.viewerLogin.toLowerCase()
				? 'User'
				: context.ownerTypes[owner.toLowerCase()];
			if (ownerType) qualifiers.add(`${ownerType === 'Organization' ? 'org' : 'user'}:${owner}`);
		} else {
			qualifiers.add(`repo:${scope}`);
		}
	}
	return Array.from(qualifiers).sort((a, b) => a.localeCompare(b));
}

function buildSearchQuery(cutoff: string, qualifiers: string[]): string {
	return `is:pr updated:>=${cutoff} ${qualifiers.join(' ')}`;
}

function buildPullRequestSearchQueries(cutoff: string, requestedDate: string, qualifiers: string[]): string[] {
	const queries: string[] = [];
	const finalDate = new Date(`${requestedDate}T00:00:00.000Z`);
	let rangeStart = new Date(`${cutoff}T00:00:00.000Z`);

	while (rangeStart <= finalDate) {
		const rangeEnd = new Date(Math.min(rangeStart.getTime() + 24 * 60 * 60 * 1000, finalDate.getTime()));
		const start = rangeStart.toISOString().slice(0, 10);
		const end = rangeEnd.toISOString().slice(0, 10);
		const updatedRange = start === end ? start : `${start}..${end}`;
		queries.push(`is:pr updated:${updatedRange} ${qualifiers.join(' ')}`);
		rangeStart = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);
	}

	return queries;
}

function buildInvolvementSearchQueries(cutoff: string, qualifiers: string[], context: GitHubPullRequestContext): string[] {
	const viewer = context.viewerLogin;
	const baseQuery = buildSearchQuery(cutoff, qualifiers);
	return [
		`${baseQuery} involves:${viewer}`,
		`${baseQuery} review-requested:${viewer}`,
		`${baseQuery} reviewed-by:${viewer}`,
		...context.teams.map(team => `${baseQuery} team-review-requested:${team}`),
	];
}

function buildSearchGraphQLQuery(): string {
	return `query($query: String!, $cursor: String) {
		search(query: $query, type: ISSUE, first: 100, after: $cursor) {
			nodes {
				__typename
				... on PullRequest {
					id
					number
					title
					url
					createdAt
					updatedAt
					isDraft
					state
					mergedAt
					author { login }
					repository { nameWithOwner }
					labels(first: 20) { nodes { name } }
				}
			}
			pageInfo { endCursor hasNextPage }
		}
	}`;
}

function normalizePullRequest(pullRequest: RawPullRequest): PullRequestItem {
	let state: PullRequestItem['state'];
	const rawState = pullRequest.state.toLowerCase();
	if (pullRequest.isDraft) state = 'draft';
	else if (rawState === 'open') state = 'open';
	else if (rawState === 'merged' || pullRequest.mergedAt) state = 'merged';
	else state = 'closed';

	return {
		id: pullRequest.id,
		repository: pullRequest.repository.nameWithOwner,
		number: pullRequest.number,
		title: pullRequest.title,
		author: pullRequest.author?.login ?? 'Unknown',
		involved: false,
		state,
		createdAt: pullRequest.createdAt,
		updatedAt: pullRequest.updatedAt,
		url: pullRequest.url,
		labels: pullRequest.labels.nodes.map(label => label.name).sort().slice(0, 20),
	};
}

function normalizeGhPullRequest(repository: string, pullRequest: GhPullRequest, involved = true): PullRequestItem {
	let state: PullRequestItem['state'];
	const rawState = pullRequest.state.toLowerCase();
	if (pullRequest.isDraft) state = 'draft';
	else if (rawState === 'open') state = 'open';
	else if (rawState === 'merged' || pullRequest.mergedAt) state = 'merged';
	else state = 'closed';

	return {
		id: pullRequest.id || `${repository}#${pullRequest.number}`,
		repository: pullRequest.repository?.nameWithOwner ?? repository,
		number: pullRequest.number,
		title: pullRequest.title,
		author: pullRequest.author?.login ?? 'Unknown',
		authorAvatarUrl: pullRequest.author?.login ? `https://github.com/${encodeURIComponent(pullRequest.author.login)}.png?size=40` : undefined,
		branchName: pullRequest.headRefName ?? undefined,
		checkStatus: pullRequest.checkStatus ?? 'unknown',
		involved,
		state,
		createdAt: pullRequest.createdAt ?? pullRequest.updatedAt,
		updatedAt: pullRequest.updatedAt,
		url: pullRequest.url,
		labels: (pullRequest.labels ?? []).map(label => label.name).sort().slice(0, 20),
	};
}

function groupSearchQualifiers(qualifiers: string[], cutoff: string, context: GitHubPullRequestContext): string[][] {
	const ownerGroups = qualifiers
		.filter(qualifier => !qualifier.startsWith('repo:'))
		.map(qualifier => [qualifier]);
	const repositoryChunks: string[][] = [];
	let current: string[] = [];
	for (const qualifier of qualifiers.filter(candidate => candidate.startsWith('repo:'))) {
		const candidate = [...current, qualifier];
		if (current.length > 0 && Math.max(...buildInvolvementSearchQueries(cutoff, candidate, context).map(query => query.length)) > 240) {
			repositoryChunks.push(current);
			current = [qualifier];
		} else {
			current = candidate;
		}
	}
	if (current.length > 0) repositoryChunks.push(current);
	return [...ownerGroups, ...repositoryChunks];
}
