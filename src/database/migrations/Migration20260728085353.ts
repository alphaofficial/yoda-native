import { Migration } from '@mikro-orm/migrations';

export class Migration20260728085353 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`dashboard_settings\` add column \`dashboard_cache_ttl_seconds\` integer not null default 900;`);
    this.addSql(`alter table \`dashboard_settings\` add column \`github_repository_cache_ttl_seconds\` integer not null default 86400;`);
    this.addSql(`alter table \`dashboard_settings\` add column \`dashboard_request_timeout_ms\` integer not null default 5000;`);
    this.addSql(`alter table \`dashboard_settings\` add column \`dashboard_retry_count\` integer not null default 2;`);
  }

}
