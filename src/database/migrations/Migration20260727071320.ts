import { Migration } from '@mikro-orm/migrations';

export class Migration20260727071320 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`dashboard_settings\` add column \`pull_request_mode\` text not null default 'involved';`);
  }

}
