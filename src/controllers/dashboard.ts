import { type Request, type Response } from 'express';
import { dashboard } from '@/core/dashboard';
import { redirectToSettings } from '@/controllers/settingsRedirect';
import { convertPullRequestToDraft, getPullRequestDetail, invalidatePullRequestDetail, markPullRequestReadyForReview, replyToReviewThread, resolveReviewThread, unresolveReviewThread } from '@/integrations/githubPullRequest';
import { ShortcutValidationError } from '@/types/dashboard';

const PULL_REQUEST_FILTER_COOKIE = 'yoda_pull_request_filters';

interface PullRequestRouteParams {
	owner: string;
	repo: string;
	number: number;
}

function getCookie(req: Request, name: string): string | null {
	const entry = req.headers.cookie?.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith(`${name}=`));
	if (!entry) return null;
	try {
		return decodeURIComponent(entry.slice(name.length + 1)).slice(0, 4000);
	} catch {
		return null;
	}
}

function getPullRequestRouteParams(req: Request): PullRequestRouteParams | null {
	const owner = typeof req.params.owner === 'string' ? req.params.owner : '';
	const repo = typeof req.params.repo === 'string' ? req.params.repo : '';
	const number = Number(req.params.number);
	const hasValidPullRequest = Boolean(owner && repo && Number.isInteger(number) && number > 0);
	if (!hasValidPullRequest) return null;
	return { owner, repo, number };
}

function getThreadId(req: Request): string {
	return typeof req.params.threadId === 'string' ? req.params.threadId : '';
}

function pullRequestRedirectPath({ owner, repo, number }: PullRequestRouteParams): string {
	return `/pull-requests/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}`;
}

export async function dashboardIndex(req: Request, res: Response) {
	const dashboardData = await dashboard.get(req.ctx.db, new Date());
	return res.render('Home', {
		theme: dashboardData.theme ?? 'light',
		dashboard: dashboardData,
		pullRequestFilterState: getCookie(req, PULL_REQUEST_FILTER_COOKIE),
	});
}

export async function refreshPullRequests(req: Request, res: Response) {
	await dashboard.refreshPullRequests(req.ctx.db, new Date());
	return res.redirect(303, '/');
}

export async function pullRequestShow(req: Request, res: Response) {
	const params = getPullRequestRouteParams(req);
	if (!params) {
		return res.status(404).render('Error', { status: 404, message: 'Pull request not found' });
	}

	const [settings, viewerLogin, pullRequest] = await Promise.all([
		dashboard.settings(req.ctx.db),
		dashboard.pullRequestViewerLogin(req.ctx.db, new Date()),
		getPullRequestDetail(`${params.owner}/${params.repo}`, params.number),
	]);

	return res.render('PullRequest/Show', {
		theme: settings.theme ?? 'light',
		soundsEnabled: settings.soundsEnabled ?? false,
		viewerLogin,
		pullRequest,
	});
}

export async function resolvePullRequestThread(req: Request, res: Response) {
	const params = getPullRequestRouteParams(req);
	const threadId = getThreadId(req);
	if (!params || !threadId) return res.redirect(303, '/');
	await resolveReviewThread(threadId);
	await invalidatePullRequestDetail(`${params.owner}/${params.repo}`, params.number);
	return res.redirect(303, pullRequestRedirectPath(params));
}

export async function unresolvePullRequestThread(req: Request, res: Response) {
	const params = getPullRequestRouteParams(req);
	const threadId = getThreadId(req);
	if (!params || !threadId) return res.redirect(303, '/');
	await unresolveReviewThread(threadId);
	await invalidatePullRequestDetail(`${params.owner}/${params.repo}`, params.number);
	return res.redirect(303, pullRequestRedirectPath(params));
}

export async function setPullRequestDraftStatus(req: Request, res: Response) {
	const params = getPullRequestRouteParams(req);
	if (!params) return res.status(404).render('Error', { status: 404, message: 'Pull request not found' });
	const intent = typeof req.body.intent === 'string' ? req.body.intent : '';
	const repository = `${params.owner}/${params.repo}`;
	if (intent === 'ready') {
		await markPullRequestReadyForReview(repository, params.number);
	} else if (intent === 'draft') {
		await convertPullRequestToDraft(repository, params.number);
	} else {
		return res.status(400).render('Error', { status: 400, message: 'Unknown draft status intent' });
	}
	await invalidatePullRequestDetail(repository, params.number);
	return res.redirect(303, pullRequestRedirectPath(params));
}

export async function replyPullRequestThread(req: Request, res: Response) {
	const params = getPullRequestRouteParams(req);
	const threadId = getThreadId(req);
	const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
	if (!params) return res.redirect(303, '/');
	if (!threadId || !body) return res.redirect(303, pullRequestRedirectPath(params));
	await replyToReviewThread(threadId, body.slice(0, 10000));
	await invalidatePullRequestDetail(`${params.owner}/${params.repo}`, params.number);
	return res.redirect(303, pullRequestRedirectPath(params));
}

export async function createShortcut(req: Request, res: Response) {
	try {
		await dashboard.addShortcut(req.ctx.db, req.body);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Quick link added.' });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}

export async function importBookmarkShortcuts(req: Request, res: Response) {
	try {
		const groupId = typeof req.body.groupId === 'string' ? req.body.groupId : '';
		const shortcuts = Array.isArray(req.body.shortcuts)
			? req.body.shortcuts.map((shortcut: { label?: unknown; url?: unknown }) => ({
				groupId,
				label: typeof shortcut.label === 'string' ? shortcut.label : '',
				url: typeof shortcut.url === 'string' ? shortcut.url : '',
			}))
			: [];
		if (shortcuts.length === 0) {
			throw new ShortcutValidationError('Choose at least one bookmark');
		}
		const importedCount = await dashboard.addShortcuts(req.ctx.db, shortcuts);
		const message = importedCount === 0
			? 'Those bookmarks are already quick links.'
			: `${importedCount} bookmark${importedCount === 1 ? '' : 's'} imported.`;
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}

export async function updateShortcut(req: Request, res: Response) {
	try {
		const shortcutId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		await dashboard.updateShortcut(req.ctx.db, shortcutId, req.body);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Quick link updated.' });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}

export async function deleteShortcut(req: Request, res: Response) {
	try {
		const shortcutId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		await dashboard.deleteShortcut(req.ctx.db, shortcutId);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Quick link removed.' });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}

export async function reorderShortcuts(req: Request, res: Response) {
	try {
		const groupId = typeof req.body.groupId === 'string' ? req.body.groupId : '';
		const shortcutIds = Array.isArray(req.body.shortcutIds)
			? req.body.shortcutIds.filter((id: unknown): id is string => typeof id === 'string')
			: [];
		await dashboard.reorderShortcuts(req.ctx.db, groupId, shortcutIds);
		return redirectToSettings(req, res, 'shortcuts', { type: 'success', message: 'Quick link order saved.' });
	} catch (err) {
		if (err instanceof ShortcutValidationError) {
			return redirectToSettings(req, res, 'shortcuts', { type: 'error', message: err.message });
		}
		throw err;
	}
}
