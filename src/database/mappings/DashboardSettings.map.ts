import { EntitySchema } from '@mikro-orm/core';
import { DashboardSettings } from '@/models/DashboardSettings';

export const DashboardSettingsMapper = new EntitySchema<DashboardSettings>({
	class: DashboardSettings,
	tableName: 'dashboard_settings',
	properties: {
		id: { type: 'string', primary: true },
		displayName: { type: 'string', fieldName: 'display_name' },
		timeZone: { type: 'string', fieldName: 'time_zone' },
		shortcutLimit: { type: 'number', fieldName: 'shortcut_limit', default: 8 },
		pullRequestWindowDays: { type: 'number', fieldName: 'pull_request_window_days', default: 7 },
		backupIntervalHours: { type: 'number', fieldName: 'backup_interval_hours', default: 24 },
		backupRetentionDays: { type: 'number', fieldName: 'backup_retention_days', default: 30 },
		dashboardCacheTtlSeconds: { type: 'number', fieldName: 'dashboard_cache_ttl_seconds', default: 900 },
		githubRepositoryCacheTtlSeconds: { type: 'number', fieldName: 'github_repository_cache_ttl_seconds', default: 86400 },
		dashboardRequestTimeoutMs: { type: 'number', fieldName: 'dashboard_request_timeout_ms', default: 5000 },
		dashboardRetryCount: { type: 'number', fieldName: 'dashboard_retry_count', default: 2 },
		timeFormat: { type: 'string', fieldName: 'time_format', default: '12' },
		theme: { type: 'string', default: 'light' },
		soundsEnabled: { type: 'boolean', fieldName: 'sounds_enabled', default: false },
		githubToken: { type: 'string', fieldName: 'github_token', nullable: true },
		repositoryScopes: { type: 'string', fieldName: 'repositories', default: '[]' },
		pullRequestMode: { type: 'string', fieldName: 'pull_request_mode', default: 'involved' },
		pullRequestFilters: { type: 'string', fieldName: 'pull_request_filters', default: '{}' },
		createdAt: { type: 'Date', fieldName: 'created_at', defaultRaw: 'CURRENT_TIMESTAMP' },
		updatedAt: { type: 'Date', fieldName: 'updated_at', defaultRaw: 'CURRENT_TIMESTAMP', onUpdate: () => new Date() },
	},
});
