import { Migration } from '@mikro-orm/migrations';

export class Migration20260723110734 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`dashboard_settings\` add column \`sounds_enabled\` integer not null default false;`);
  }

}
