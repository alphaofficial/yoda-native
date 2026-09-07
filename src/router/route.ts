import { Router } from 'express';
import { createShortcut, dashboardIndex, deleteShortcut, importBookmarkShortcuts, pullRequestShow, refreshPullRequests, reorderShortcuts, replyPullRequestThread, resolvePullRequestThread, setPullRequestDraftStatus, unresolvePullRequestThread, updateShortcut } from '@/controllers/dashboard';
import { applyBackup, createBackup, exportShortcuts, importShortcuts, settingsIndex, updateSettings } from '@/controllers/settings';
import { applyInertia } from '@/middleware/inertia';

const route = Router();

route.use(applyInertia);

route.get('/', dashboardIndex);
route.post('/pull-requests/refresh', refreshPullRequests);
route.get('/pull-requests/:owner/:repo/:number', pullRequestShow);
route.post('/pull-requests/:owner/:repo/:number/threads/:threadId/resolve', resolvePullRequestThread);
route.post('/pull-requests/:owner/:repo/:number/threads/:threadId/unresolve', unresolvePullRequestThread);
route.post('/pull-requests/:owner/:repo/:number/threads/:threadId/reply', replyPullRequestThread);
route.post('/pull-requests/:owner/:repo/:number/draft', setPullRequestDraftStatus);
route.get('/settings', settingsIndex);
route.patch('/settings', updateSettings);
route.post('/settings/backups', createBackup);
route.post('/settings/backups/apply', applyBackup);
route.get('/settings/shortcuts/export', exportShortcuts);
route.post('/settings/shortcuts/import', importShortcuts);
route.post('/settings/shortcuts', createShortcut);
route.post('/settings/shortcuts/bookmarks', importBookmarkShortcuts);
route.patch('/settings/shortcuts/:id', updateShortcut);
route.delete('/settings/shortcuts/:id', deleteShortcut);
route.put('/settings/shortcuts/reorder', reorderShortcuts);

export default route;
