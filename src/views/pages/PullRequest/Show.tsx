import { Head, Link, router, usePage } from '@inertiajs/react';
import { GitMergeIcon, GitPullRequestClosedIcon, GitPullRequestDraftIcon, GitPullRequestIcon } from '@primer/octicons-react';
import { ArrowLeft, ArrowUp, CheckCircle2, ChevronDown, Clock3, ExternalLink, GitBranch, GitCommitHorizontal, MessageCircle, MoreHorizontal, Pencil, Plus, Reply, Rows3, UserCircle2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/views/components/ui/button';
import { Textarea } from '@/views/components/ui/textarea';
import { applySoundPreference } from '@/views/lib/sounds';
import type { PullRequestCheckItem, PullRequestDetail, PullRequestDiffFile, PullRequestDiffLine, PullRequestReviewThread } from '@/types/dashboard';
import type { PageProps as InertiaPageProps } from '@inertiajs/core';

interface PageProps extends InertiaPageProps {
	applicationName: string;
	theme: 'light' | 'dark' | 'system';
	soundsEnabled: boolean;
	viewerLogin: string | null;
	pullRequest: PullRequestDetail;
}

function resolveTheme(theme: PageProps['theme']): 'light' | 'dark' {
	if (theme === 'dark') return 'dark';
	if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	return 'light';
}

function applyTheme(theme: PageProps['theme']) {
	const resolvedTheme = resolveTheme(theme);
	document.documentElement.classList.add('theme-changing');
	document.documentElement.dataset.theme = theme ?? 'light';
	document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
	window.setTimeout(() => document.documentElement.classList.remove('theme-changing'), 450);
}

function formatRelativeAge(isoString: string): string {
	const date = new Date(isoString);
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.floor(diffMs / (1000 * 60));
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const months = Math.floor(days / 30);
	if (minutes < 60) return `${Math.max(1, minutes)}m`;
	if (hours < 24) return `${hours}h`;
	if (days < 30) return `${days}d`;
	return `${months}mo`;
}

function stateLabel(pullRequest: PullRequestDetail): string {
	if (pullRequest.state === 'draft') return 'Draft';
	if (pullRequest.state === 'merged') return 'Merged';
	if (pullRequest.state === 'closed') return 'Closed';
	return 'Ready for review';
}

function checksLabel(pullRequest: PullRequestDetail): string {
	if (pullRequest.checkStatus === 'success') return 'Checks passing';
	if (pullRequest.checkStatus === 'pending') return 'Checks pending';
	if (pullRequest.checkStatus === 'failure') return 'Checks failing';
	return 'No CI checks';
}

function checkResultLabel(check: PullRequestCheckItem): string {
	const value = (check.conclusion ?? check.status ?? '').toUpperCase();
	if (['SUCCESS', 'COMPLETED'].includes(value)) return 'Passed';
	if (['FAILURE', 'FAILED', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(value)) return 'Failed';
	if (['PENDING', 'QUEUED', 'IN_PROGRESS', 'REQUESTED'].includes(value)) return 'Pending';
	return value ? value.toLowerCase() : 'Unknown';
}

function mergeConflictLabel(pullRequest: PullRequestDetail): string {
	const mergeable = (pullRequest.mergeable ?? '').toUpperCase();
	const mergeState = (pullRequest.mergeStateStatus ?? '').toUpperCase();
	if (mergeable === 'CONFLICTING' || mergeState === 'DIRTY') return 'Conflicts must be resolved';
	if (mergeable === 'MERGEABLE' || ['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(mergeState)) return 'No merge conflicts';
	if (pullRequest.state !== 'open') return 'Not applicable';
	return 'Unknown';
}

function pullRequestPath(pullRequest: PullRequestDetail) {
	const [owner, ...repoParts] = pullRequest.repository.split('/');
	return `/pull-requests/${encodeURIComponent(owner)}/${encodeURIComponent(repoParts.join('/'))}/${pullRequest.number}`;
}

function PullRequestIconForState({ state }: Readonly<{ state: PullRequestDetail['state'] }>) {
	const props = { size: 21, 'aria-hidden': true } as const;
	if (state === 'draft') return <GitPullRequestDraftIcon {...props} className="text-[var(--github-pr-draft)]" />;
	if (state === 'merged') return <GitMergeIcon {...props} className="text-[var(--github-pr-merged)]" />;
	if (state === 'closed') return <GitPullRequestClosedIcon {...props} className="text-[var(--github-pr-closed)]" />;
	return <GitPullRequestIcon {...props} className="text-[var(--github-pr-open)]" />;
}

function CheckIcon({ status }: Readonly<{ status: PullRequestDetail['checkStatus'] }>) {
	if (status === 'success') return <CheckCircle2 className="size-5 text-[var(--github-pr-open)]" aria-hidden="true" />;
	if (status === 'failure') return <XCircle className="size-5 text-[var(--github-pr-closed)]" aria-hidden="true" />;
	return <Clock3 className="size-5 text-muted-foreground" aria-hidden="true" />;
}

function MarkdownText({ value }: Readonly<{ value: string }>) {
	const blocks = useMemo(() => parseMarkdownBlocks(value), [value]);
	if (blocks.length === 0) return <p className="text-muted-foreground">No description provided.</p>;
	return (
		<div className="pr-markdown">
			{blocks.map((block, index) => renderMarkdownBlock(block, index))}
		</div>
	);
}

type MarkdownBlock =
	| { type: 'heading'; level: number; text: string }
	| { type: 'paragraph'; text: string }
	| { type: 'quote'; text: string }
	| { type: 'list'; items: string[] }
	| { type: 'code'; text: string };

function renderMarkdownBlock(block: MarkdownBlock, index: number): ReactNode {
	if (block.type === 'heading') {
		const Heading = (`h${Math.min(block.level + 1, 4)}`) as 'h2' | 'h3' | 'h4';
		return <Heading key={index}>{renderInlineMarkdown(block.text)}</Heading>;
	}
	if (block.type === 'list') {
		return (
			<ul key={index}>
				{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}
			</ul>
		);
	}
	if (block.type === 'quote') return <blockquote key={index}>{renderInlineMarkdown(block.text)}</blockquote>;
	if (block.type === 'code') return <pre key={index}><code>{block.text}</code></pre>;
	return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
}

function parseMarkdownBlocks(value: string): MarkdownBlock[] {
	const lines = value.replaceAll('\r\n', '\n').split('\n');
	const state: MarkdownParseState = { blocks: [], code: null, list: [], paragraph: [], quote: [] };
	for (const line of lines) {
		processMarkdownLine(state, line);
	}
	flushMarkdownText(state);
	if (state.code) state.blocks.push({ type: 'code', text: state.code.join('\n') });
	return state.blocks;
}

interface MarkdownParseState {
	blocks: MarkdownBlock[];
	code: string[] | null;
	list: string[];
	paragraph: string[];
	quote: string[];
}

function processMarkdownLine(state: MarkdownParseState, line: string): void {
	const trimmed = line.trim();
	if (trimmed.startsWith('```')) {
		toggleCodeBlock(state);
		return;
	}
	if (state.code) {
		state.code.push(line);
		return;
	}
	processMarkdownTextLine(state, trimmed);
}

function processMarkdownTextLine(state: MarkdownParseState, trimmed: string): void {
	if (!trimmed) {
		flushMarkdownText(state);
		return;
	}
	if (isQuoteLine(trimmed)) {
		addQuoteLine(state, trimmed);
		return;
	}
	const heading = parseHeadingLine(trimmed);
	if (heading) {
		addHeadingLine(state, heading);
		return;
	}
	const listItem = parseListItem(trimmed);
	if (listItem) {
		addListItem(state, listItem);
		return;
	}
	addParagraphLine(state, trimmed);
}

function toggleCodeBlock(state: MarkdownParseState): void {
	flushMarkdownText(state);
	if (state.code) {
		state.blocks.push({ type: 'code', text: state.code.join('\n') });
		state.code = null;
		return;
	}
	state.code = [];
}

function flushMarkdownText(state: MarkdownParseState): void {
	flushParagraph(state);
	flushList(state);
	flushQuote(state);
}

function flushParagraph(state: MarkdownParseState): void {
	if (state.paragraph.length > 0) state.blocks.push({ type: 'paragraph', text: state.paragraph.join(' ') });
	state.paragraph = [];
}

function flushList(state: MarkdownParseState): void {
	if (state.list.length > 0) state.blocks.push({ type: 'list', items: state.list });
	state.list = [];
}

function flushQuote(state: MarkdownParseState): void {
	if (state.quote.length > 0) state.blocks.push({ type: 'quote', text: state.quote.join(' ') });
	state.quote = [];
}

function addQuoteLine(state: MarkdownParseState, trimmed: string): void {
	flushParagraph(state);
	flushList(state);
	state.quote.push(trimmed.slice(trimmed.startsWith('> ') ? 2 : 1));
}

function addHeadingLine(state: MarkdownParseState, heading: MarkdownBlock): void {
	flushMarkdownText(state);
	state.blocks.push(heading);
}

function addListItem(state: MarkdownParseState, item: string): void {
	flushParagraph(state);
	flushQuote(state);
	state.list.push(item);
}

function addParagraphLine(state: MarkdownParseState, trimmed: string): void {
	flushList(state);
	flushQuote(state);
	state.paragraph.push(trimmed);
}

function isQuoteLine(line: string): boolean {
	return line.startsWith('>');
}

function parseHeadingLine(line: string): MarkdownBlock | null {
	let level = 0;
	while (level < 4 && line[level] === '#') level += 1;
	if (level === 0 || line[level] !== ' ') return null;
	return { type: 'heading', level, text: line.slice(level + 1) };
}

function parseListItem(line: string): string | null {
	if (!line.startsWith('- ') && !line.startsWith('* ')) return null;
	return line.slice(2);
}

function renderInlineMarkdown(value: string) {
	const nodes: ReactNode[] = [];
	let remaining = value.replaceAll('**', '').replaceAll('`', '');
	let key = 0;
	while (remaining) {
		const match = findNextLink(remaining);
		if (!match) {
			nodes.push(remaining);
			break;
		}
		if (match.start > 0) nodes.push(remaining.slice(0, match.start));
		nodes.push(<a key={key++} href={match.href} target="_blank" rel="noreferrer">{match.label}</a>);
		remaining = remaining.slice(match.end);
	}
	return nodes;
}

interface InlineLinkMatch {
	start: number;
	end: number;
	href: string;
	label: string;
}

function findNextLink(value: string): InlineLinkMatch | null {
	const markdownLink = findMarkdownLink(value);
	const plainLink = findPlainUrl(value);
	if (!markdownLink) return plainLink;
	if (!plainLink) return markdownLink;
	return markdownLink.start <= plainLink.start ? markdownLink : plainLink;
}

function findMarkdownLink(value: string): InlineLinkMatch | null {
	const labelStart = value.indexOf('[');
	if (labelStart < 0) return null;
	const labelEnd = value.indexOf('](', labelStart);
	if (labelEnd < 0) return null;
	const hrefStart = labelEnd + 2;
	if (!value.startsWith('http://', hrefStart) && !value.startsWith('https://', hrefStart)) return null;
	const hrefEnd = value.indexOf(')', hrefStart);
	if (hrefEnd < 0) return null;
	return {
		start: labelStart,
		end: hrefEnd + 1,
		href: value.slice(hrefStart, hrefEnd),
		label: value.slice(labelStart + 1, labelEnd),
	};
}

function findPlainUrl(value: string): InlineLinkMatch | null {
	const start = firstUrlIndex(value);
	if (start < 0) return null;
	const end = nextWhitespaceIndex(value, start);
	const href = value.slice(start, end);
	return { start, end, href, label: href };
}

function firstUrlIndex(value: string): number {
	const secureIndex = value.indexOf('https://');
	const insecureIndex = value.indexOf('http://');
	if (secureIndex < 0) return insecureIndex;
	if (insecureIndex < 0) return secureIndex;
	return Math.min(secureIndex, insecureIndex);
}

function nextWhitespaceIndex(value: string, start: number): number {
	for (let index = start; index < value.length; index += 1) {
		if (value[index]?.trim() === '') return index;
	}
	return value.length;
}

function TopBar({ tab, setTab, pullRequest, viewerLogin }: Readonly<{ tab: 'summary' | 'code'; setTab: (tab: 'summary' | 'code') => void; pullRequest: PullRequestDetail; viewerLogin?: string | null }>) {
	const isAuthor = Boolean(viewerLogin && pullRequest.author.toLowerCase() === viewerLogin.toLowerCase());
	return (
		<header className="pr-topbar">
			<div className="flex min-w-0 items-center gap-3">
				<div className="relative flex size-6 shrink-0 items-center justify-center">
					<PullRequestIconForState state={pullRequest.state} />
					<span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-[var(--github-pr-open)] ring-2 ring-background" aria-hidden="true" />
				</div>
				<nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Pull request view">
					<button type="button" data-active={tab === 'summary'} onClick={() => setTab('summary')} className="pr-tab">Summary</button>
					<button type="button" data-active={tab === 'code'} onClick={() => setTab('code')} className="pr-tab">Code</button>
				</nav>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<a href={pullRequest.url} target="_blank" rel="noreferrer" aria-label="Open on GitHub" title="Open on GitHub" className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
					<ExternalLink aria-hidden="true" />
				</a>
				{isAuthor ? (
					<>
						<Button type="button" variant="secondary" size="sm" className="rounded-md">Auto-merge</Button>
						<Button type="button" size="sm" className="rounded-md">Merge</Button>
					</>
				) : (
					<>
						<Button type="button" variant="secondary" size="sm" className="rounded-md">Comment</Button>
						<Button type="button" variant="secondary" size="sm" className="rounded-md">Request changes</Button>
						<Button type="button" size="sm" className="rounded-md">Approve</Button>
					</>
				)}
			</div>
		</header>
	);
}

function SummaryView({ pullRequest, viewerLogin }: Readonly<{ pullRequest: PullRequestDetail; viewerLogin?: string | null }>) {
	const canEdit = Boolean(viewerLogin && pullRequest.author.toLowerCase() === viewerLogin.toLowerCase());
	const [descriptionOpen, setDescriptionOpen] = useState(true);
	const [activityOpen, setActivityOpen] = useState(true);
	const [displayStatus, setDisplayStatus] = useState(stateLabel(pullRequest));
	const draftPath = `${pullRequestPath(pullRequest)}/draft`;
	const updateDraftStatus = (intent: 'ready' | 'draft') => {
		router.post(draftPath, { intent }, { preserveScroll: true });
	};
	return (
		<div className="pr-summary">
			<PullRequestOverview pullRequest={pullRequest} canEdit={canEdit} displayStatus={displayStatus} setDisplayStatus={setDisplayStatus} onChangeDraftStatus={canEdit ? updateDraftStatus : undefined} />
			<PullRequestDescription pullRequest={pullRequest} canEdit={canEdit} open={descriptionOpen} setOpen={setDescriptionOpen} />
			<ChecksSection pullRequest={pullRequest} />
			<section className="pr-section">
				<div className="flex items-center justify-between pb-3">
					<h2 className="display-heading text-base leading-snug">Merge conflicts</h2>
					<span className="text-sm text-muted-foreground">{mergeConflictLabel(pullRequest)}</span>
				</div>
			</section>
			<ActivitySection pullRequest={pullRequest} open={activityOpen} setOpen={setActivityOpen} />
			<CommentComposer pullRequest={pullRequest} viewerLogin={viewerLogin} />
		</div>
	);
}

function PullRequestOverview({ pullRequest, canEdit, displayStatus, setDisplayStatus, onChangeDraftStatus }: Readonly<{ pullRequest: PullRequestDetail; canEdit: boolean; displayStatus: string; setDisplayStatus: (status: string) => void; onChangeDraftStatus?: (intent: 'ready' | 'draft') => void }>) {
	return (
		<section className="pr-overview">
			<div className="flex min-w-0 items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="pr-title">{pullRequest.title}</h1>
					<AuthorMeta pullRequest={pullRequest} />
				</div>
				{canEdit && <IconEditButton label="Edit pull request title" title="Edit title" />}
			</div>
			<PullRequestFacts pullRequest={pullRequest} canEdit={canEdit} displayStatus={displayStatus} setDisplayStatus={setDisplayStatus} onChangeDraftStatus={onChangeDraftStatus} />
		</section>
	);
}

function AuthorMeta({ pullRequest }: Readonly<{ pullRequest: PullRequestDetail }>) {
	return (
		<div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
			{pullRequest.authorAvatarUrl ? <img src={pullRequest.authorAvatarUrl} alt="" className="size-5 rounded-full" /> : <span className="size-5 rounded-full bg-muted" aria-hidden="true" />}
			<span>{pullRequest.author}</span>
			<span aria-hidden="true">·</span>
			<span>{formatRelativeAge(pullRequest.updatedAt)}</span>
		</div>
	);
}

function IconEditButton({ label, title }: Readonly<{ label: string; title: string }>) {
	return (
		<Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={title}>
			<Pencil aria-hidden="true" />
		</Button>
	);
}

function PullRequestFacts({ pullRequest, canEdit, displayStatus, setDisplayStatus, onChangeDraftStatus }: Readonly<{ pullRequest: PullRequestDetail; canEdit: boolean; displayStatus: string; setDisplayStatus: (status: string) => void; onChangeDraftStatus?: (intent: 'ready' | 'draft') => void }>) {
	return (
		<div className="pr-facts">
			<BranchFact pullRequest={pullRequest} />
			<ReviewersFact pullRequest={pullRequest} canEdit={canEdit} />
			<Fact icon={<MessageCircle />} label="Comments">
				<span>{pullRequest.commentCount} {pullRequest.commentCount === 1 ? 'comment' : 'comments'}</span>
			</Fact>
			<Fact icon={<CheckIcon status={pullRequest.checkStatus} />} label="Checks">
				<span>{checksLabel(pullRequest)}</span>
			</Fact>
			<StatusFact canEdit={canEdit} displayStatus={displayStatus} setDisplayStatus={setDisplayStatus} onChangeDraftStatus={onChangeDraftStatus} />
		</div>
	);
}

function BranchFact({ pullRequest }: Readonly<{ pullRequest: PullRequestDetail }>) {
	return (
		<Fact icon={<GitBranch />} label="Branch">
			<span className="truncate">{pullRequest.headRefName}</span>
			<span className="text-muted-foreground">›</span>
			<span className="truncate">{pullRequest.baseRefName}</span>
			<span className="font-medium text-[var(--github-pr-open)]">+{pullRequest.additions}</span>
			<span className="font-medium text-[var(--github-pr-closed)]">-{pullRequest.deletions}</span>
		</Fact>
	);
}

function ReviewersFact({ pullRequest, canEdit }: Readonly<{ pullRequest: PullRequestDetail; canEdit: boolean }>) {
	return (
		<Fact icon={<UserCircle2 />} label="Reviewers">
			{pullRequest.reviewers.length === 0 ? <span className="text-muted-foreground">No reviewers</span> : <ReviewerAvatars pullRequest={pullRequest} />}
			{canEdit && (
				<Button type="button" variant="secondary" size="icon-sm" aria-label="Add reviewer">
					<Plus aria-hidden="true" />
				</Button>
			)}
		</Fact>
	);
}

function ReviewerAvatars({ pullRequest }: Readonly<{ pullRequest: PullRequestDetail }>) {
	return (
		<div className="flex items-center -space-x-1">
			{pullRequest.reviewers.slice(0, 5).map(reviewer => (
				<img key={reviewer.login} src={reviewer.avatarUrl} alt={reviewer.login} title={reviewer.login} className="size-5 rounded-full ring-2 ring-background" />
			))}
		</div>
	);
}

function StatusFact({ canEdit, displayStatus, setDisplayStatus, onChangeDraftStatus }: Readonly<{ canEdit: boolean; displayStatus: string; setDisplayStatus: (status: string) => void; onChangeDraftStatus?: (intent: 'ready' | 'draft') => void }>) {
	return (
		<Fact icon={<GitPullRequestIcon size={20} />} label="Status">
			{canEdit && onChangeDraftStatus ? (
				<select
					value={displayStatus}
					onChange={event => {
						setDisplayStatus(event.target.value);
						onChangeDraftStatus(event.target.value === 'Draft' ? 'draft' : 'ready');
					}}
					className="pr-status-select"
				>
					<option>Ready for review</option>
					<option>Draft</option>
				</select>
			) : (
				<span>{displayStatus}</span>
			)}
		</Fact>
	);
}

function PullRequestDescription({ pullRequest, canEdit, open, setOpen }: Readonly<{ pullRequest: PullRequestDetail; canEdit: boolean; open: boolean; setOpen: (open: boolean | ((open: boolean) => boolean)) => void }>) {
	return (
		<section className="pr-description">
			<div className="flex items-center justify-between pb-5">
				<button type="button" onClick={() => setOpen(value => !value)} className="display-heading flex items-center gap-2 text-base leading-snug">
					Description
					<ChevronDown className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
				</button>
				{canEdit && <IconEditButton label="Edit pull request description" title="Edit description" />}
			</div>
			{open && (
				<div className="pt-4">
					<MarkdownText value={pullRequest.body} />
				</div>
			)}
		</section>
	);
}

function ActivitySection({ pullRequest, open, setOpen }: Readonly<{ pullRequest: PullRequestDetail; open: boolean; setOpen: (open: boolean | ((open: boolean) => boolean)) => void }>) {
	const activityEvents = useMemo(() => buildActivityEvents(pullRequest), [pullRequest]);
	const unresolvedThreads = pullRequest.threads.filter(thread => !thread.isResolved).length;
	return (
		<section className="pr-section">
			<div className="flex items-center gap-2 pb-3">
				<button type="button" onClick={() => setOpen(value => !value)} className="display-heading flex items-center gap-2 text-base leading-snug">
					Activity
					<ChevronDown className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
				</button>
				<span className="text-sm text-muted-foreground">{activityEvents.length}</span>
				{unresolvedThreads > 0 && <span className="ml-auto text-sm text-[var(--github-pr-closed)]">{unresolvedThreads} unresolved</span>}
			</div>
			{open && <ActivityList pullRequest={pullRequest} events={activityEvents} />}
		</section>
	);
}

function ActivityList({ pullRequest, events }: Readonly<{ pullRequest: PullRequestDetail; events: PullRequestActivityEvent[] }>) {
	return (
		<div className="grid gap-2 pt-4">
			{events.map(event => renderActivityEvent(pullRequest, event))}
		</div>
	);
}

function renderActivityEvent(pullRequest: PullRequestDetail, event: PullRequestActivityEvent): ReactNode {
	if (event.type === 'opened') return <OpenedActivity key={event.id} pullRequest={pullRequest} />;
	if (event.type === 'commit') return <CommitActivity key={event.id} commit={event.commit} />;
	if (event.type === 'comment') return <CommentCard key={event.id} comment={event.comment} />;
	return <ReviewThreadCard key={event.id} pullRequest={pullRequest} thread={event.thread} />;
}

function OpenedActivity({ pullRequest }: Readonly<{ pullRequest: PullRequestDetail }>) {
	return (
		<ActivityRow
			icon={<GitPullRequestIcon size={16} />}
			primary={(
				<span className="flex min-w-0 items-center gap-2">
					{pullRequest.authorAvatarUrl ? <img src={pullRequest.authorAvatarUrl} alt="" className="size-5 rounded-full" loading="lazy" decoding="async" /> : <span className="size-5 rounded-full bg-muted" aria-hidden="true" />}
					<span className="min-w-0 truncate">{pullRequest.author} opened this pull request</span>
				</span>
			)}
			secondary={formatRelativeAge(pullRequest.createdAt)}
		/>
	);
}

function CommitActivity({ commit }: Readonly<{ commit: PullRequestDetail['commits'][number] }>) {
	return (
		<ActivityRow
			icon={<GitCommitHorizontal />}
			primary={commit.messageHeadline}
			secondary={<CommitMeta commit={commit} />}
		/>
	);
}

function CommitMeta({ commit }: Readonly<{ commit: PullRequestDetail['commits'][number] }>) {
	return (
		<span className="pr-commit-meta">
			{commit.authorAvatarUrl ? <img src={commit.authorAvatarUrl} alt={commit.author} title={commit.author} className="size-5 rounded-full" loading="lazy" decoding="async" /> : <span className="size-5 rounded-full bg-muted" title={commit.author} aria-label={commit.author} />}
			{commit.url ? (
				<a href={commit.url} target="_blank" rel="noreferrer" className="pr-activity-link">{commit.oid.slice(0, 7)}</a>
			) : (
				<span>{commit.oid.slice(0, 7)}</span>
			)}
			<span aria-hidden="true">·</span>
			<span>{formatRelativeAge(commit.committedDate)}</span>
		</span>
	);
}

function ChecksSection({ pullRequest }: Readonly<{ pullRequest: PullRequestDetail }>) {
	const [open, setOpen] = useState(true);
	return (
		<section className="pr-section">
			<div className="flex items-center justify-between pb-3">
				<button type="button" onClick={() => setOpen(value => !value)} className="display-heading flex items-center gap-2 text-base leading-snug">
					Checks
					<ChevronDown className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
				</button>
				<span className="text-sm text-muted-foreground">{checksLabel(pullRequest)}</span>
			</div>
			{open && (
				<div className="grid gap-2 pt-4">
					{pullRequest.checks.length === 0 ? (
						<p className="text-sm text-muted-foreground">No CI checks</p>
					) : pullRequest.checks.map(check => (
						<a key={`${check.workflowName ?? ''}:${check.name}`} href={check.detailsUrl ?? pullRequest.url} target="_blank" rel="noreferrer" className="pr-activity-row">
							<CheckIcon status={checkIconStatus(check)} />
							<span className="min-w-0 flex-1 truncate font-medium">{check.workflowName ? `${check.workflowName}/${check.name}` : check.name}</span>
							<span className="shrink-0 text-muted-foreground">{checkResultLabel(check)}</span>
						</a>
					))}
				</div>
			)}
		</section>
	);
}

function checkIconStatus(check: PullRequestCheckItem): PullRequestDetail['checkStatus'] {
	const label = checkResultLabel(check);
	if (label === 'Passed') return 'success';
	if (label === 'Failed') return 'failure';
	return 'pending';
}

function ActivityRow({ icon, primary, secondary }: Readonly<{ icon: ReactNode; primary: ReactNode; secondary?: ReactNode }>) {
	return (
		<div className="pr-activity-row">
			<span className="flex size-5 items-center justify-center text-muted-foreground [&_svg]:size-4" aria-hidden="true">{icon}</span>
			<span className="min-w-0 flex-1 truncate">{primary}</span>
			{secondary && <span className="shrink-0 text-muted-foreground">{secondary}</span>}
		</div>
	);
}

type PullRequestActivityEvent =
	| { id: string; timelineIndex?: number; timestamp: string; type: 'opened' }
	| { id: string; timelineIndex?: number; timestamp: string; type: 'commit'; commit: PullRequestDetail['commits'][number] }
	| { id: string; timelineIndex?: number; timestamp: string; type: 'comment'; comment: PullRequestDetail['comments'][number] }
	| { id: string; timelineIndex?: number; timestamp: string; type: 'thread'; thread: PullRequestReviewThread };

function buildActivityEvents(pullRequest: PullRequestDetail): PullRequestActivityEvent[] {
	// `opened` is the chronologically earliest event, so we anchor it at timelineIndex 0 — every
	// other event has timelineIndex >= 1 (assigned from the GraphQL response, oldest = largest
	// after the buildTimelineOrder reversal), keeping the opened card at the top.
	return [
		{ id: 'opened', timelineIndex: 0, timestamp: pullRequest.createdAt, type: 'opened' },
		...pullRequest.commits.map(commit => ({ id: `commit:${commit.oid}`, timelineIndex: commit.timelineIndex, timestamp: commit.committedDate, type: 'commit' as const, commit })),
		...pullRequest.comments.map(comment => ({ id: `comment:${comment.id}`, timelineIndex: comment.timelineIndex, timestamp: comment.createdAt, type: 'comment' as const, comment })),
		...pullRequest.threads.map(thread => ({ id: `thread:${thread.id}`, timelineIndex: thread.timelineIndex, timestamp: thread.comments[0]?.createdAt ?? pullRequest.createdAt, type: 'thread' as const, thread })),
	].sort(compareActivityEvents);
}

function compareActivityEvents(leftEvent: PullRequestActivityEvent, rightEvent: PullRequestActivityEvent): number {
	if (leftEvent.timelineIndex !== undefined && rightEvent.timelineIndex !== undefined) return leftEvent.timelineIndex - rightEvent.timelineIndex;
	if (leftEvent.timelineIndex !== undefined) return -1;
	if (rightEvent.timelineIndex !== undefined) return 1;
	return new Date(leftEvent.timestamp).getTime() - new Date(rightEvent.timestamp).getTime();
}

function reviewStateLabel(state: PullRequestDetail['comments'][number]['reviewState']): { label: string; className: string } | null {
	if (!state) return null;
	switch (state) {
		case 'APPROVED':
			return { label: 'Approved', className: 'bg-[var(--github-pr-open)] text-white' };
		case 'CHANGES_REQUESTED':
			return { label: 'Requested changes', className: 'bg-[var(--github-pr-closed)] text-white' };
		case 'COMMENTED':
			return { label: 'Left a review', className: 'bg-muted text-foreground' };
		case 'DISMISSED':
			return { label: 'Review dismissed', className: 'bg-muted text-muted-foreground' };
		default:
			return { label: state.toLowerCase().replace(/_/g, ' '), className: 'bg-muted text-foreground' };
	}
}

function CommentCard({ comment }: Readonly<{ comment: PullRequestDetail['comments'][number] }>) {
	const reviewState = reviewStateLabel(comment.reviewState);
	return (
		<article className="pr-thread-card">
			<div className="flex items-center gap-2 text-sm">
				{comment.authorAvatarUrl ? <img src={comment.authorAvatarUrl} alt="" className="size-5 rounded-full" /> : <span className="size-5 rounded-full bg-muted" aria-hidden="true" />}
				<span className="font-medium">{comment.author}</span>
				{reviewState && (
					<span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${reviewState.className}`}>{reviewState.label}</span>
				)}
				<span className="ml-auto text-muted-foreground">{formatRelativeAge(comment.createdAt)}</span>
			</div>
			{comment.body.trim().length > 0 && (
				<div className="pt-2">
					<MarkdownText value={comment.body} />
				</div>
			)}
		</article>
	);
}

function ReviewThreadCard({ pullRequest, thread }: Readonly<{ pullRequest: PullRequestDetail; thread: PullRequestReviewThread }>) {
	const [replyOpen, setReplyOpen] = useState(false);
	const [body, setBody] = useState('');
	const threadPath = `${pullRequestPath(pullRequest)}/threads/${encodeURIComponent(thread.id)}`;
	const threadUrl = thread.comments.find(comment => comment.url)?.url ?? `${pullRequest.url}/files`;
	const threadFileLabel = thread.path ? compactPath(thread.path) : 'Pull request files';
	const submitReply = () => {
		const value = body.trim();
		if (!value) return;
		router.post(`${threadPath}/reply`, { body: value }, {
			preserveScroll: true,
			onSuccess: () => {
				setBody('');
				setReplyOpen(false);
			},
		});
	};

	return (
		<article className="pr-thread-card">
			<div className="pr-thread-header">
				<div className="min-w-0">
					<a href={threadUrl} target="_blank" rel="noreferrer" className="pr-thread-file-link">
						{threadFileLabel}{thread.line ? ` · Line ${thread.line}` : ''}
					</a>
				</div>
			</div>
			<div className="pr-thread-comments">
				{thread.comments.map((comment, index) => (
					<div key={comment.id} className="pr-thread-comment" data-reply={index > 0 ? 'true' : undefined}>
						{comment.authorAvatarUrl ? <img src={comment.authorAvatarUrl} alt="" className="pr-thread-comment-avatar" /> : <span className="pr-thread-comment-avatar bg-muted" aria-hidden="true" />}
						<div className="min-w-0">
							<div className="flex items-center gap-2 text-sm">
								<span className="font-medium">{comment.author}</span>
								<span className="ml-auto text-muted-foreground">{formatRelativeAge(comment.createdAt)}</span>
							</div>
							<MarkdownText value={comment.body} />
						</div>
					</div>
				))}
			</div>
			<div className="mt-3 flex items-center gap-2">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onClick={() => router.post(`${threadPath}/${thread.isResolved ? 'unresolve' : 'resolve'}`, {}, { preserveScroll: true })}
				>
					{thread.isResolved ? 'Unresolve' : 'Resolve'}
				</Button>
				<Button type="button" variant="secondary" size="sm" onClick={() => setReplyOpen(open => !open)}>
					<Reply aria-hidden="true" /> Reply
				</Button>
			</div>
			{replyOpen && (
				<div className="mt-3 grid gap-2">
					<Textarea value={body} onChange={event => setBody(event.target.value)} placeholder="Reply to thread" className="min-h-20 text-sm" />
					<div>
						<Button type="button" size="sm" onClick={submitReply}>Reply</Button>
					</div>
				</div>
			)}
		</article>
	);
}

function Fact({ icon, label, children }: Readonly<{ icon: ReactNode; label: string; children: ReactNode }>) {
	return (
		<div className="pr-fact-row">
			<span className="flex size-6 items-center justify-center text-muted-foreground [&_svg]:size-4" aria-hidden="true">{icon}</span>
			<span className="text-muted-foreground">{label}</span>
			<div className="flex min-w-0 flex-1 items-center gap-3 text-sm text-foreground">{children}</div>
		</div>
	);
}

function CommentComposer({ pullRequest, viewerLogin }: Readonly<{ pullRequest: PullRequestDetail; viewerLogin?: string | null }>) {
	const reviewerAvatarUrl = viewerLogin
		? pullRequest.reviewers.find(reviewer => reviewer.login.toLowerCase() === viewerLogin.toLowerCase())?.avatarUrl
		: undefined;
	const composerAvatarUrl = reviewerAvatarUrl ?? pullRequest.reviewers.find(reviewer => reviewer.avatarUrl)?.avatarUrl ?? pullRequest.authorAvatarUrl;
	return (
		<form className="pr-comment-composer">
			<Textarea placeholder="Leave a comment" aria-label={`Leave a comment on ${pullRequest.title}`} className="min-h-12 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" />
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{composerAvatarUrl ? (
						<img src={composerAvatarUrl} alt="" className="size-5 rounded-full" loading="lazy" decoding="async" />
					) : (
						<span className="size-5 rounded-full bg-muted" aria-hidden="true" />
					)}
				</div>
				<Button type="button" size="icon-lg" aria-label="Submit comment" className="bg-muted-foreground text-background hover:bg-foreground">
					<ArrowUp aria-hidden="true" />
				</Button>
			</div>
		</form>
	);
}

function CodeView({ pullRequest }: Readonly<{ pullRequest: PullRequestDetail }>) {
	const [actionsOpen, setActionsOpen] = useState(false);
	const [filesExpanded, setFilesExpanded] = useState(true);
	const copyPullRequestUrl = () => {
		void navigator.clipboard?.writeText(pullRequest.url);
		setActionsOpen(false);
	};

	return (
		<div className="pr-code">
			<div className="pr-code-branchbar">
				<div className="flex min-w-0 items-center gap-4 text-sm text-muted-foreground">
					<span className="truncate">{pullRequest.headRefName}</span>
					<span aria-hidden="true">›</span>
					<span className="truncate">{pullRequest.baseRefName}</span>
				</div>
				<div className="flex items-center gap-3 text-muted-foreground">
					<div className="pr-code-actions">
						<Button type="button" variant="ghost" size="icon-sm" aria-label="More code actions" aria-haspopup="menu" aria-expanded={actionsOpen} onClick={() => setActionsOpen(open => !open)}><MoreHorizontal /></Button>
						{actionsOpen && (
							<div className="pr-code-menu" role="menu">
								<a href={`${pullRequest.url}/files`} target="_blank" rel="noreferrer" role="menuitem" onClick={() => setActionsOpen(false)}>Open files on GitHub</a>
								<button type="button" role="menuitem" onClick={copyPullRequestUrl}>Copy pull request link</button>
							</div>
						)}
					</div>
					<Button type="button" variant="ghost" size="icon-sm" aria-label={filesExpanded ? 'Collapse all files' : 'Expand all files'} aria-pressed={filesExpanded} onClick={() => setFilesExpanded(expanded => !expanded)}><Rows3 /></Button>
				</div>
			</div>
			{pullRequest.files.length === 0 ? (
				<div className="flex min-h-72 items-center justify-center text-muted-foreground">No file changes in this pull request</div>
			) : (
				<div className="grid gap-8">
					{pullRequest.files.map(file => <DiffFile key={file.path} file={file} prUrl={pullRequest.url} expanded={filesExpanded} />)}
				</div>
			)}
		</div>
	);
}

function DiffFile({ file, prUrl, expanded }: Readonly<{ file: PullRequestDiffFile; prUrl: string; expanded: boolean }>) {
	const [open, setOpen] = useState(expanded);
	const [commentLine, setCommentLine] = useState<number | null>(null);
	const fileUrl = file.url ?? `${prUrl}/files`;
	useEffect(() => setOpen(expanded), [expanded]);
	return (
		<section className="pr-diff-file">
			<div className="pr-diff-file-header">
				<button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${file.path}`} className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
					<ChevronDown className={`size-5 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
				</button>
				<a href={fileUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate text-inherit no-underline hover:underline">
					{compactPath(file.path)}
				</a>
				<span className="ml-auto shrink-0 text-[var(--github-pr-open)]">+{file.additions}</span>
				<span className="shrink-0 text-[var(--github-pr-closed)]">-{file.deletions}</span>
			</div>
			{open && (
				<div className="pr-diff-body">
					{file.hunks.map((hunk, index) => (
						<div key={`${hunk.header}-${index}`}>
							<div className="pr-diff-hunk">{hunk.header}</div>
							{hunk.lines.map((line, lineIndex) => (
								<DiffLine
									key={lineIndex}
									line={line}
									commentOpen={commentLine === lineIndex}
									onComment={() => setCommentLine(commentLine === lineIndex ? null : lineIndex)}
									onCancelComment={() => setCommentLine(null)}
								/>
							))}
						</div>
					))}
				</div>
			)}
		</section>
	);
}

function compactPath(path: string): string {
	if (path.length <= 86) return path;
	const parts = path.split('/');
	if (parts.length <= 2) return `...${path.slice(-83)}`;
	return `.../${parts.slice(-3).join('/')}`;
}

function DiffLine({ line, commentOpen, onComment, onCancelComment }: Readonly<{ line: PullRequestDiffLine; commentOpen: boolean; onComment: () => void; onCancelComment: () => void }>) {
	const canComment = line.type === 'add' || line.type === 'delete' || line.type === 'context';
	return (
		<>
			<div data-line-type={line.type} className="pr-diff-line">
				<span className="pr-line-action">
					{canComment && (
						<button type="button" className="pr-line-comment-button" aria-label="Add line comment" onClick={onComment}>
							<Plus aria-hidden="true" />
						</button>
					)}
				</span>
				<span className="pr-line-number">{line.oldLineNumber ?? ''}</span>
				<span className="pr-line-number">{line.newLineNumber ?? ''}</span>
				<code>{diffLinePrefix(line)}{line.content}</code>
			</div>
			{commentOpen && (
				<form className="pr-line-comment-editor">
					<Textarea placeholder="Leave a comment" aria-label="Leave a line comment" className="min-h-24 resize-none text-sm" />
					<div className="flex justify-end gap-2">
						<Button type="button" variant="secondary" size="sm" onClick={onCancelComment}>Cancel</Button>
						<Button type="button" size="sm">Comment</Button>
					</div>
				</form>
			)}
		</>
	);
}

function diffLinePrefix(line: PullRequestDiffLine): string {
	if (line.type === 'add') return '+';
	if (line.type === 'delete') return '-';
	return ' ';
}

export function PullRequestDetailSurface({ pullRequest, showBackLink = false, viewerLogin = null }: Readonly<{ pullRequest: PullRequestDetail; showBackLink?: boolean; viewerLogin?: string | null }>) {
	const [tab, setTab] = useState<'summary' | 'code'>('summary');

	return (
		<main className="pr-shell">
			{showBackLink && (
				<div className="pr-page-header">
					<Button variant="ghost" className="-ml-6" render={<Link href="/" prefetch="hover" />}>
						<ArrowLeft aria-hidden="true" />
						Pull requests
					</Button>
				</div>
			)}
			<TopBar tab={tab} setTab={setTab} pullRequest={pullRequest} viewerLogin={viewerLogin} />
			<div className="pb-10 pt-6">
				{tab === 'summary' ? <SummaryView pullRequest={pullRequest} viewerLogin={viewerLogin} /> : <CodeView pullRequest={pullRequest} />}
			</div>
		</main>
	);
}

export default function PullRequestShow() {
	const { props } = usePage<PageProps>();
	const { applicationName, theme, soundsEnabled, pullRequest, viewerLogin } = props;

	useEffect(() => {
		applySoundPreference(soundsEnabled);
	}, [soundsEnabled]);

	useEffect(() => {
		applyTheme(theme);
		if (theme !== 'system') return;
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const updateTheme = () => applyTheme(theme);
		media.addEventListener('change', updateTheme);
		return () => media.removeEventListener('change', updateTheme);
	}, [theme]);

	return (
		<>
			<Head title={`${pullRequest.title} - ${applicationName}`} />
			<div className="min-h-screen bg-background text-foreground antialiased">
				<PullRequestDetailSurface pullRequest={pullRequest} showBackLink viewerLogin={viewerLogin} />
			</div>
		</>
	);
}
