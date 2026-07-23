import { Head, usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import GreetingHeader from '@/views/components/dashboard/GreetingHeader';
import PullRequestPanel from '@/views/components/dashboard/PullRequestPanel';
import ShortcutPanel from '@/views/components/dashboard/ShortcutPanel';
import { applySoundPreference } from '@/views/lib/sounds';
import type { DashboardResponse } from '@/types/dashboard';
import type { PageProps as InertiaPageProps } from '@inertiajs/core';

function resolveTheme(theme: DashboardResponse['theme']): 'light' | 'dark' {
	if (theme === 'dark') return 'dark';
	if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	return 'light';
}

function applyTheme(theme: DashboardResponse['theme']) {
	const resolvedTheme = resolveTheme(theme);
	document.documentElement.classList.add('theme-changing');
	document.documentElement.dataset.theme = theme ?? 'light';
	document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
	window.setTimeout(() => document.documentElement.classList.remove('theme-changing'), 450);
}

interface PageProps extends InertiaPageProps {
	applicationName: string;
	dashboard: DashboardResponse;
	pullRequestFilterState: string | null;
}

export default function Home() {
	const { props } = usePage<PageProps>();
	const { applicationName, dashboard, pullRequestFilterState } = props;

	useEffect(() => {
		applySoundPreference(dashboard.soundsEnabled ?? false);
	}, [dashboard.soundsEnabled]);

	useEffect(() => {
		applyTheme(dashboard.theme);
		if (dashboard.theme !== 'system') return;
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const updateTheme = () => applyTheme(dashboard.theme);
		media.addEventListener('change', updateTheme);
		return () => media.removeEventListener('change', updateTheme);
	}, [dashboard.theme]);

	return (
		<>
			<Head title={`${applicationName} Dashboard`} />
			<div className="min-h-[calc(100vh-38px)] bg-background text-foreground antialiased">
				<main className="dashboard-shell">
					<GreetingHeader dashboard={dashboard} />

					<div className="dashboard-grid">
						<section
							className="dashboard-main"
							aria-label="Dashboard content"
						>
							<PullRequestPanel pullRequests={dashboard.pullRequests} persistedFilterState={pullRequestFilterState} />
						</section>
						<aside
							className="dashboard-sidebar"
							aria-label="Sidebar"
						>
							<ShortcutPanel
								shortcutGroups={dashboard.shortcutGroups}
								limit={dashboard.shortcutLimit ?? 8}
							/>
						</aside>
					</div>
				</main>
			</div>
		</>
	);
}
