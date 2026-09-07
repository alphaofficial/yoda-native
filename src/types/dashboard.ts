export type IntegrationState = 'ok' | 'error' | 'unconfigured';
export type PullRequestCheckStatus = 'success' | 'pending' | 'failure' | 'unknown';
export type PullRequestMode = 'involved' | 'selected';
export type TimeFormat = '12' | '24';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface DashboardResponse {
	generatedAt: string;
	lastRefreshAt: string | null;
	stale: boolean;
	timeZone: string;
	timeFormat?: TimeFormat;
	theme?: ThemePreference;
	soundsEnabled?: boolean;
	displayName: string;
	shortcutLimit?: number;
	githubTokenConfigured?: boolean;
	pullRequests: {
		windowDays: number;
		viewerLogin: string | null;
		counts: { open: number; draft: number; merged: number; closed: number };
		items: PullRequestItem[];
	};
	shortcutGroups: ShortcutGroup[];
	integrations: {
		github: IntegrationHealth;
	};
}

export interface IntegrationHealth {
	state: IntegrationState;
	lastSuccessAt: string | null;
	message: string | null;
}

export interface PullRequestItem {
	id: string;
	repository: string;
	number: number;
	title: string;
	author: string;
	authorAvatarUrl?: string;
	branchName?: string;
	checkStatus?: PullRequestCheckStatus;
	involved: boolean;
	state: 'open' | 'draft' | 'merged' | 'closed';
	createdAt: string;
	updatedAt: string;
	url: string;
	labels: string[];
}

export interface PullRequestReviewParticipant {
	login: string;
	avatarUrl?: string;
	state?: string;
}

export interface PullRequestCommentItem {
	id: string;
	author: string;
	authorAvatarUrl?: string;
	body: string;
	createdAt: string;
	url?: string;
	timelineIndex?: number;
	reviewState?: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | string;
}

export interface PullRequestCheckItem {
	name: string;
	workflowName?: string;
	status: string;
	conclusion: string | null;
	detailsUrl?: string;
}

export interface PullRequestCommitItem {
	oid: string;
	messageHeadline: string;
	author: string;
	authorAvatarUrl?: string;
	url?: string;
	committedDate: string;
	timelineIndex?: number;
}

export interface PullRequestThreadComment {
	id: string;
	author: string;
	authorAvatarUrl?: string;
	body: string;
	createdAt: string;
	url?: string;
}

export interface PullRequestReviewThread {
	id: string;
	isResolved: boolean;
	path: string | null;
	line: number | null;
	comments: PullRequestThreadComment[];
	timelineIndex?: number;
}

export interface PullRequestDiffLine {
	type: 'context' | 'add' | 'delete' | 'meta';
	oldLineNumber: number | null;
	newLineNumber: number | null;
	content: string;
}

export interface PullRequestDiffHunk {
	header: string;
	lines: PullRequestDiffLine[];
}

export interface PullRequestDiffFile {
	path: string;
	oldPath?: string;
	url?: string;
	additions: number;
	deletions: number;
	hunks: PullRequestDiffHunk[];
}

export interface PullRequestDetail {
	id: string;
	repository: string;
	number: number;
	title: string;
	author: string;
	authorAvatarUrl?: string;
	state: PullRequestItem['state'];
	url: string;
	createdAt: string;
	updatedAt: string;
	body: string;
	headRefName: string;
	baseRefName: string;
	additions: number;
	deletions: number;
	commentCount: number;
	checkStatus: PullRequestCheckStatus;
	checks: PullRequestCheckItem[];
	reviewDecision: string | null;
	mergeable: string | null;
	mergeStateStatus: string | null;
	reviewers: PullRequestReviewParticipant[];
	comments: PullRequestCommentItem[];
	threads: PullRequestReviewThread[];
	commits: PullRequestCommitItem[];
	files: PullRequestDiffFile[];
}

export interface GitHubRepository {
	id: number;
	name: string;
	fullName: string;
	owner: string;
	ownerType: 'User' | 'Organization';
	private: boolean;
	archived: boolean;
}

export interface GitHubRepositoryCatalog {
	viewerLogin: string;
	repositories: GitHubRepository[];
	defaultScopes: string[];
	teams: string[];
}

export interface GitHubPullRequestContext {
	viewerLogin: string;
	teams: string[];
	ownerTypes: Record<string, 'User' | 'Organization'>;
}

export interface ShortcutGroup {
	id: string;
	label: string;
	shortcuts: ShortcutItem[];
}

export interface ShortcutItem {
	id: string;
	label: string;
	url: string;
}

export interface ShortcutGroupConfig {
	id: string;
	label: string;
	shortcuts: ShortcutConfig[];
}

export interface ShortcutConfig {
	id: string;
	label: string;
	url: string;
}

export interface DashboardConfig {
	displayName: string;
	timeZone: string;
	timeFormat?: TimeFormat;
	theme?: ThemePreference;
	soundsEnabled?: boolean;
	shortcutLimit?: number;
	backupIntervalHours?: number;
	backupRetentionDays?: number;
	dashboardCacheTtlSeconds?: number;
	githubRepositoryCacheTtlSeconds?: number;
	dashboardRequestTimeoutMs?: number;
	dashboardRetryCount?: number;
	githubToken?: string | null;
	github: {
		repositoryScopes: string[];
		windowDays: number;
		pullRequestMode: PullRequestMode;
	};
	shortcutGroups: ShortcutGroupConfig[];
}

export interface ShortcutSettingsExport {
	version: 1;
	exportedAt: string;
	shortcutGroups: ShortcutGroupConfig[];
}

export interface AddShortcutInput {
	groupId: string;
	label: string;
	url: string;
	position?: number;
}

export class DashboardConfigError extends Error {
	constructor(
		message: string,
		public readonly fields?: Record<string, string>
	) {
		super(message);
		this.name = 'DashboardConfigError';
	}
}

export class ShortcutValidationError extends Error {
	constructor(
		message: string,
		public readonly fields?: Record<string, string>
	) {
		super(message);
		this.name = 'ShortcutValidationError';
	}
}
