import { PullRequestDetailSurface } from '@/views/pages/PullRequest/Show';
import type { PullRequestDetail } from '@/types/dashboard';

export default function PullRequestDetailPanel({ pullRequest, viewerLogin }: Readonly<{ pullRequest: PullRequestDetail; viewerLogin: string | null }>) {
	return (
		<section className="pr-side-detail" aria-label="Pull request details">
			<PullRequestDetailSurface pullRequest={pullRequest} viewerLogin={viewerLogin} />
		</section>
	);
}
