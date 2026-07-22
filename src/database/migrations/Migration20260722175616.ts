import { Migration } from '@mikro-orm/migrations';

export class Migration20260722175616 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`cache_entries\` (\`key\` text not null, \`value\` text not null, \`expires_at\` integer null, primary key (\`key\`));`);
    this.addSql(`create index \`cache_entries_expires_at_index\` on \`cache_entries\` (\`expires_at\`);`);

    this.addSql(`create table \`dashboard_settings\` (\`id\` text not null, \`display_name\` text not null, \`time_zone\` text not null, \`shortcut_limit\` integer not null default 8, \`pull_request_window_days\` integer not null default 7, \`backup_interval_hours\` integer not null default 24, \`backup_retention_days\` integer not null default 30, \`time_format\` text not null default '12', \`theme\` text not null default 'light', \`github_token\` text null, \`repositories\` text not null default '[]', \`pull_request_filters\` text not null default '{}', \`created_at\` datetime not null default CURRENT_TIMESTAMP, \`updated_at\` datetime not null default CURRENT_TIMESTAMP, primary key (\`id\`));`);

    this.addSql(`create table \`dashboard_shortcuts\` (\`id\` text not null, \`group_id\` text not null, \`group_label\` text not null, \`label\` text not null, \`url\` text not null, \`position\` integer not null, \`created_at\` datetime not null default CURRENT_TIMESTAMP, \`updated_at\` datetime not null default CURRENT_TIMESTAMP, primary key (\`id\`));`);
    this.addSql(`create index \`dashboard_shortcuts_group_position_index\` on \`dashboard_shortcuts\` (\`group_id\`, \`position\`);`);
  }

}
