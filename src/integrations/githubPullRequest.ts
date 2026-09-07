import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { parsePatch } from 'diff';
import { Cache } from '@/primitives/cache';
import type { StructuredPatchHunk } from 'diff';
import type { PullRequestCheckItem, PullRequestCheckStatus, PullRequestDetail, PullRequestDiffFile, PullRequestDiffHunk, PullRequestDiffLine, PullRequestItem, PullRequestReviewThread } from '@/types/dashboard';

const execFileAsync = promisify(execFile);
const PULL_REQUEST_DETAIL_CACHE_TTL_SECONDS = 120;
const PULL_REQUEST_DETAIL_CACHE_KEY_VERSION = 2;

function pullRequestDetailCacheKey(repository: string, number: number): string {
	return `github:pull-request-detail:v${PULL_REQUEST_DETAIL_CACHE_KEY_VERSION}:${repository}#${number}`;
}

export async function getPullRequestDetail(repository: string, number: number): Promise<PullRequestDetail> {
	const cacheKey = pullRequestDetailCacheKey(repository, number);
	const cached = await Cache.get<PullRequestDetail>(cacheKey);
	if (cached) return cached;
	const detail = await fetchPullRequestDetail(repository, number);
	await Cache.set(cacheKey, detail, PULL_REQUEST_DETAIL_CACHE_TTL_SECONDS);
	return detail;
}

export async function invalidatePullRequestDetail(repository: string, number: number): Promise<void> {
	await Cache.delete(pullRequestDetailCacheKey(repository, number));
}

interface GhUser {
	login?: string;
	avatarUrl?: string;
	url?: string;
}

interface GhReview {
	id?: string;
	author?: GhUser | null;
	body?: string;
	submittedAt?: string;
	url?: string;
	state?: string;
}

interface GhComment {
	id?: string;
	author?: GhUser | null;
	body?: string;
	createdAt?: string;
	url?: string;
}

interface GhStatusCheck {
	__typename?: string;
	name?: string;
	context?: string;
	workflowName?: string;
	state?: string;
	conclusion?: string | null;
	status?: string | null;
	detailsUrl?: string;
	targetUrl?: string;
}

interface GhCommit {
	oid?: string;
	messageHeadline?: string;
	committedDate?: string;
	authors?: Array<{ login?: string; name?: string }>;
}

interface GhPullRequestDetail {
	id?: string;
	number: number;
	title: string;
	url: string;
	createdAt?: string;
	updatedAt?: string;
	state: string;
	isDraft?: boolean;
	author?: GhUser | null;
	body?: string;
	headRefName?: string;
	baseRefName?: string;
	additions?: number;
	deletions?: number;
	comments?: GhComment[];
	reviews?: GhReview[];
	statusCheckRollup?: GhStatusCheck[];
	reviewDecision?: string | null;
	mergeable?: string | null;
	mergeStateStatus?: string | null;
	commits?: GhCommit[];
}

interface GraphQLReviewThreadResponse {
	data?: {
		repository?: {
			pullRequest?: {
				reviewThreads?: {
					nodes?: Array<{
						id: string;
						isResolved: boolean;
						path?: string | null;
						line?: number | null;
						comments?: {
							nodes?: Array<{
								id: string;
								body?: string;
								createdAt?: string;
								url?: string;
								author?: { login?: string; avatarUrl?: string } | null;
							}>;
						};
					}>;
				};
			};
		};
	};
}

interface GraphQLTimelineResponse {
	data?: {
		repository?: {
			pullRequest?: {
				timelineItems?: {
					nodes?: Array<
						| { __typename: 'IssueComment'; id: string }
						| { __typename: 'PullRequestReview'; id: string }
						| { __typename: 'PullRequestReviewThread'; id: string }
						| { __typename: 'PullRequestCommit'; commit?: { oid?: string } | null }
					>;
				};
			};
		};
	};
}

async function fetchPullRequestDetail(repository: string, number: number): Promise<PullRequestDetail> {
	const [detailOutput, diffOutput, reviewThreads, timelineOrder] = await Promise.all([
		runGh([
			'pr',
			'view',
			String(number),
			'--repo',
			repository,
			'--json',
			'id,number,title,url,createdAt,updatedAt,state,isDraft,author,body,headRefName,baseRefName,additions,deletions,comments,reviews,statusCheckRollup,reviewDecision,mergeable,mergeStateStatus,commits',
		]),
		runGh(['pr', 'diff', String(number), '--repo', repository, '--color', 'never']),
		getReviewThreads(repository, number),
		getTimelineOrder(repository, number),
	]);
	const detail = JSON.parse(detailOutput || '{}') as GhPullRequestDetail;
	return normalizePullRequestDetail({ repository, detail, diffOutput, reviewThreads, timelineOrder });
}

interface PullRequestDetailContext {
	repository: string;
	detail: GhPullRequestDetail;
	diffOutput: string;
	reviewThreads: PullRequestReviewThread[];
	timelineOrder: Map<string, number>;
}

interface PullRequestDetailParts {
	author: string;
	checkRollup: GhStatusCheck[];
	comments: ReturnType<typeof normalizeComments>;
	files: PullRequestDiffFile[];
	threads: PullRequestReviewThread[];
	updatedAt: string;
}

function normalizePullRequestDetail(context: PullRequestDetailContext): PullRequestDetail {
	const { repository, detail, timelineOrder } = context;
	const parts = buildPullRequestDetailParts(context);

	return {
		...pullRequestIdentity(repository, detail),
		repository,
		author: parts.author,
		authorAvatarUrl: avatarUrl(parts.author, 80),
		state: normalizePullRequestState(detail.state, detail.isDraft),
		url: detail.url,
		createdAt: createdAt(detail, parts.updatedAt),
		updatedAt: parts.updatedAt,
		...pullRequestTextFields(detail),
		additions: additionCount(detail, parts.files),
		deletions: deletionCount(detail, parts.files),
		commentCount: parts.comments.length + countThreadComments(parts.threads),
		checkStatus: normalizeGhCheckStatus(parts.checkRollup),
		checks: normalizeChecks(parts.checkRollup),
		reviewDecision: detail.reviewDecision ?? null,
		mergeable: detail.mergeable ?? null,
		mergeStateStatus: detail.mergeStateStatus ?? null,
		reviewers: normalizeReviewers(detail.reviews ?? []),
		comments: parts.comments,
		threads: parts.threads,
		commits: normalizeCommits(repository, detail.commits ?? [], parts.updatedAt, timelineOrder),
		files: parts.files,
	};
}

function pullRequestIdentity(repository: string, detail: GhPullRequestDetail): Pick<PullRequestDetail, 'id' | 'number' | 'title'> {
	return {
		id: detail.id ?? `${repository}#${detail.number}`,
		number: detail.number,
		title: detail.title,
	};
}

function createdAt(detail: GhPullRequestDetail, fallbackDate: string): string {
	return detail.createdAt ?? fallbackDate;
}

function pullRequestTextFields(detail: GhPullRequestDetail): Pick<PullRequestDetail, 'baseRefName' | 'body' | 'headRefName'> {
	return {
		body: detail.body ?? '',
		headRefName: detail.headRefName ?? '',
		baseRefName: detail.baseRefName ?? '',
	};
}

function buildPullRequestDetailParts({ detail, diffOutput, reviewThreads, timelineOrder }: PullRequestDetailContext): PullRequestDetailParts {
	const updatedAt = detail.updatedAt ?? detail.createdAt ?? new Date().toISOString();
	const files = parseUnifiedDiff(diffOutput, detail.url);
	const comments = normalizeComments(detail.comments ?? [], detail.reviews ?? [], updatedAt, timelineOrder);
	const threads = addThreadTimelineIndexes(reviewThreads, timelineOrder);
	return {
		author: normalizeAuthorLogin(detail.author?.login),
		checkRollup: detail.statusCheckRollup ?? [],
		comments,
		files,
		threads,
		updatedAt,
	};
}

function additionCount(detail: GhPullRequestDetail, files: PullRequestDiffFile[]): number {
	return detail.additions ?? sumFileChanges(files, 'additions');
}

function deletionCount(detail: GhPullRequestDetail, files: PullRequestDiffFile[]): number {
	return detail.deletions ?? sumFileChanges(files, 'deletions');
}

function normalizeAuthorLogin(login?: string): string {
	return login ?? 'Unknown';
}

function avatarUrl(login: string, size: number): string | undefined {
	return login === 'Unknown' ? undefined : `https://github.com/${encodeURIComponent(login)}.png?size=${size}`;
}

function sumFileChanges(files: PullRequestDiffFile[], key: 'additions' | 'deletions'): number {
	return files.reduce((total, file) => total + file[key], 0);
}

function countThreadComments(threads: PullRequestReviewThread[]): number {
	return threads.reduce((total, thread) => total + thread.comments.length, 0);
}

function addThreadTimelineIndexes(threads: PullRequestReviewThread[], timelineOrder: Map<string, number>): PullRequestReviewThread[] {
	return threads.map(thread => ({ ...thread, timelineIndex: timelineOrder.get(`PullRequestReviewThread:${thread.id}`) }));
}

export async function resolveReviewThread(threadId: string): Promise<void> {
	await runGh(['api', 'graphql', '-f', `threadId=${threadId}`, '-f', 'query=mutation($threadId:ID!) { resolveReviewThread(input:{threadId:$threadId}) { thread { id isResolved } } }']);
}

export async function unresolveReviewThread(threadId: string): Promise<void> {
	await runGh(['api', 'graphql', '-f', `threadId=${threadId}`, '-f', 'query=mutation($threadId:ID!) { unresolveReviewThread(input:{threadId:$threadId}) { thread { id isResolved } } }']);
}

export async function convertPullRequestToDraft(repository: string, number: number): Promise<void> {
	await runGh([
		'pr',
		'ready',
		String(number),
		'--repo',
		repository,
		'--undo',
	]);
}

export async function markPullRequestReadyForReview(repository: string, number: number): Promise<void> {
	await runGh([
		'pr',
		'ready',
		String(number),
		'--repo',
		repository,
	]);
}

export async function replyToReviewThread(threadId: string, body: string): Promise<void> {
	await runGh([
		'api',
		'graphql',
		'-f',
		`threadId=${threadId}`,
		'-f',
		`body=${body}`,
		'-f',
		'query=mutation($threadId:ID!, $body:String!) { addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$threadId, body:$body}) { comment { id } } }',
	]);
}

async function runGh(args: string[]): Promise<string> {
	const { stdout } = await execFileAsync('gh', args, { timeout: 30000, maxBuffer: 30 * 1024 * 1024 });
	return stdout;
}

function normalizePullRequestState(state: string, isDraft?: boolean): PullRequestItem['state'] {
	if (isDraft) return 'draft';
	const rawState = state.toLowerCase();
	if (rawState === 'open') return 'open';
	if (rawState === 'merged') return 'merged';
	return 'closed';
}

function normalizeGhCheckStatus(checks: GhStatusCheck[]): PullRequestCheckStatus {
	if (checks.length === 0) return 'unknown';
	const states = checks.map(check => (check.conclusion ?? check.state ?? check.status ?? '').toUpperCase());
	if (states.some(state => ['FAILURE', 'FAILED', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(state))) return 'failure';
	if (states.some(state => ['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED', 'EXPECTED'].includes(state))) return 'pending';
	if (states.every(state => ['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'NEUTRAL', 'SKIPPED'].includes(state))) return 'success';
	return 'unknown';
}

function normalizeChecks(checks: GhStatusCheck[]): PullRequestCheckItem[] {
	return checks.map(check => ({
		name: check.name ?? check.context ?? check.workflowName ?? 'Check',
		workflowName: check.workflowName || undefined,
		status: check.status ?? check.state ?? 'UNKNOWN',
		conclusion: check.conclusion ?? null,
		detailsUrl: check.detailsUrl ?? check.targetUrl,
	}));
}

function normalizeReviewers(reviews: GhReview[]) {
	const reviewers = new Map<string, { login: string; avatarUrl?: string; state?: string }>();
	for (const review of reviews) {
		const login = review.author?.login;
		if (!login) continue;
		reviewers.set(login, {
			login,
			avatarUrl: `https://github.com/${encodeURIComponent(login)}.png?size=40`,
			state: review.state,
		});
	}
	return Array.from(reviewers.values()).sort((leftReviewer, rightReviewer) => leftReviewer.login.localeCompare(rightReviewer.login));
}

function normalizeComments(comments: GhComment[], reviews: GhReview[], fallbackDate: string, timelineOrder: Map<string, number>) {
	return [
		...comments.map((comment, index) => ({
			id: comment.id ?? `comment-${index}`,
			author: comment.author?.login ?? 'Unknown',
			authorAvatarUrl: comment.author?.login ? `https://github.com/${encodeURIComponent(comment.author.login)}.png?size=40` : undefined,
			body: comment.body ?? '',
			createdAt: comment.createdAt ?? fallbackDate,
			url: comment.url,
			timelineIndex: comment.id ? timelineOrder.get(`IssueComment:${comment.id}`) : undefined,
		})),
		...reviews
			.filter(review => review.body?.trim() || review.state)
			.map((review, index) => ({
				id: review.id ?? `review-${index}`,
				author: review.author?.login ?? 'Unknown',
				authorAvatarUrl: review.author?.login ? `https://github.com/${encodeURIComponent(review.author.login)}.png?size=40` : undefined,
				body: review.body ?? '',
				createdAt: review.submittedAt ?? fallbackDate,
				url: review.url,
				timelineIndex: review.id ? timelineOrder.get(`PullRequestReview:${review.id}`) : undefined,
				reviewState: review.state,
			})),
	].sort((leftComment, rightComment) => leftComment.createdAt.localeCompare(rightComment.createdAt));
}

function normalizeCommits(repository: string, commits: GhCommit[], fallbackDate: string, timelineOrder: Map<string, number>) {
	return commits.map((commit, index) => normalizeCommit({ repository, commit, index, fallbackDate, timelineOrder }));
}

interface NormalizeCommitContext {
	repository: string;
	commit: GhCommit;
	index: number;
	fallbackDate: string;
	timelineOrder: Map<string, number>;
}

function normalizeCommit({ repository, commit, index, fallbackDate, timelineOrder }: NormalizeCommitContext) {
	const author = normalizeCommitAuthor(commit);
	return {
		oid: commit.oid ?? String(index),
		messageHeadline: commit.messageHeadline ?? 'Commit',
		author: author.name,
		authorAvatarUrl: author.login ? `https://github.com/${encodeURIComponent(author.login)}.png?size=40` : undefined,
		url: commitUrl(repository, commit.oid),
		committedDate: commit.committedDate ?? fallbackDate,
		timelineIndex: commit.oid ? timelineOrder.get(`PullRequestCommit:${commit.oid}`) : undefined,
	};
}

function normalizeCommitAuthor(commit: GhCommit): { login?: string; name: string } {
	const author = commit.authors?.[0];
	return {
		login: author?.login,
		name: author?.login ?? author?.name ?? 'Unknown',
	};
}

function commitUrl(repository: string, oid?: string): string | undefined {
	return oid ? `https://github.com/${repository}/commit/${oid}` : undefined;
}

async function getReviewThreads(repository: string, number: number): Promise<PullRequestReviewThread[]> {
	const [owner, ...repoParts] = repository.split('/');
	const name = repoParts.join('/');
	if (!owner || !name) return [];
	const output = await runGh([
		'api',
		'graphql',
		'-f',
		`owner=${owner}`,
		'-f',
		`name=${name}`,
		'-F',
		`number=${number}`,
		'-f',
		'query=query($owner:String!, $name:String!, $number:Int!) { repository(owner:$owner, name:$name) { pullRequest(number:$number) { reviewThreads(first:100) { nodes { id isResolved path line comments(first:50) { nodes { id body createdAt url author { login avatarUrl } } } } } } } }',
	]);
	const result = JSON.parse(output || '{}') as GraphQLReviewThreadResponse;
	return (result.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []).map(thread => ({
		id: thread.id,
		isResolved: thread.isResolved,
		path: thread.path ?? null,
		line: thread.line ?? null,
		comments: (thread.comments?.nodes ?? []).map(comment => ({
			id: comment.id,
			author: comment.author?.login ?? 'Unknown',
			authorAvatarUrl: comment.author?.avatarUrl ?? (comment.author?.login ? `https://github.com/${encodeURIComponent(comment.author.login)}.png?size=40` : undefined),
			body: comment.body ?? '',
			createdAt: comment.createdAt ?? new Date().toISOString(),
			url: comment.url,
		})),
	}));
}

async function getTimelineOrder(repository: string, number: number): Promise<Map<string, number>> {
	const [owner, ...repoParts] = repository.split('/');
	const name = repoParts.join('/');
	const hasRepository = Boolean(owner && name);
	if (!hasRepository) return new Map();
	const output = await runGh(timelineOrderArgs(owner, name, number));
	const result = JSON.parse(output || '{}') as GraphQLTimelineResponse;
	return buildTimelineOrder(result.data?.repository?.pullRequest?.timelineItems?.nodes ?? []);
}

type TimelineItem = NonNullable<NonNullable<NonNullable<NonNullable<NonNullable<GraphQLTimelineResponse['data']>['repository']>['pullRequest']>['timelineItems']>['nodes']>[number];

function buildTimelineOrder(items: TimelineItem[]): Map<string, number> {
	const order = new Map<string, number>();
	for (const [index, item] of items.entries()) {
		const key = timelineItemKey(item);
		if (key) order.set(key, index + 1);
	}
	return order;
}

function timelineOrderArgs(owner: string, name: string, number: number): string[] {
	return [
		'api',
		'graphql',
		'-f',
		`owner=${owner}`,
		'-f',
		`name=${name}`,
		'-F',
		`number=${number}`,
		'-f',
		'query=query($owner:String!, $name:String!, $number:Int!) { repository(owner:$owner, name:$name) { pullRequest(number:$number) { timelineItems(first:100, itemTypes:[ISSUE_COMMENT, PULL_REQUEST_COMMIT, PULL_REQUEST_REVIEW, PULL_REQUEST_REVIEW_THREAD]) { nodes { __typename ... on IssueComment { id } ... on PullRequestReview { id } ... on PullRequestReviewThread { id } ... on PullRequestCommit { commit { oid } } } } } } }',
	];
}

function timelineItemKey(item: TimelineItem): string | null {
	if (item.__typename === 'PullRequestCommit') return item.commit?.oid ? `PullRequestCommit:${item.commit.oid}` : null;
	if (item.__typename === 'IssueComment') return `IssueComment:${item.id}`;
	if (item.__typename === 'PullRequestReview') return `PullRequestReview:${item.id}`;
	if (item.__typename === 'PullRequestReviewThread') return `PullRequestReviewThread:${item.id}`;
	return null;
}

function parseUnifiedDiff(diff: string, pullRequestUrl: string): PullRequestDiffFile[] {
	return parsePatch(diff)
		.map(file => {
			const path = normalizePatchPath(file.newFileName === '/dev/null' ? file.oldFileName : file.newFileName);
			const oldPath = normalizePatchPath(file.oldFileName === '/dev/null' ? undefined : file.oldFileName);
			const hunks = file.hunks.map(hunk => mapPatchHunk(hunk));
			const lines = hunks.flatMap(hunk => hunk.lines);
			return {
				path,
				oldPath: oldPath && oldPath !== path ? oldPath : undefined,
				url: githubDiffFileUrl(pullRequestUrl, path),
				additions: lines.filter(line => line.type === 'add').length,
				deletions: lines.filter(line => line.type === 'delete').length,
				hunks,
			};
		})
		.filter(file => file.path && file.hunks.length > 0);
}

function githubDiffFileUrl(pullRequestUrl: string, path: string): string {
	return `${pullRequestUrl}/files#diff-${createHash('sha256').update(path).digest('hex')}`;
}

function normalizePatchPath(path?: string): string {
	if (!path) return '';
	return path.replace(/^[ab]\//, '');
}

function mapPatchHunk(hunk: StructuredPatchHunk): PullRequestDiffHunk {
	let oldLine = hunk.oldStart;
	let newLine = hunk.newStart;
	const lines: PullRequestDiffLine[] = hunk.lines.map(rawLine => {
		const mappedLine = mapPatchLine(rawLine, oldLine, newLine);
		oldLine += mappedLine.oldStep;
		newLine += mappedLine.newStep;
		return mappedLine.line;
	});
	return {
		header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
		lines,
	};
}

function mapPatchLine(rawLine: string, oldLine: number, newLine: number): { line: PullRequestDiffLine; oldStep: number; newStep: number } {
	if (rawLine.startsWith('+')) {
		return { line: { type: 'add', oldLineNumber: null, newLineNumber: newLine, content: rawLine.slice(1) }, oldStep: 0, newStep: 1 };
	}
	if (rawLine.startsWith('-')) {
		return { line: { type: 'delete', oldLineNumber: oldLine, newLineNumber: null, content: rawLine.slice(1) }, oldStep: 1, newStep: 0 };
	}
	if (rawLine.startsWith('\\')) {
		return { line: { type: 'meta', oldLineNumber: null, newLineNumber: null, content: rawLine }, oldStep: 0, newStep: 0 };
	}
	return {
		line: { type: 'context', oldLineNumber: oldLine, newLineNumber: newLine, content: patchLineContent(rawLine) },
		oldStep: 1,
		newStep: 1,
	};
}

function patchLineContent(rawLine: string): string {
	return rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine;
}
