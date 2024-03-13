export type Migration<
  UpCallback extends (...args: any[]) => Promise<unknown> = () => Promise<unknown>,
  DownCallback extends (...args: any[]) => Promise<unknown> = () => Promise<unknown>
> = {
  name: string;
  dependsOn?: string | string[];
  up: UpCallback;
  down: DownCallback;
}


export type MigrationContext<Client = any> = {
  readonly client: Client;
  readonly timestamp: number;
}

export type UpMigrationContext<Client = any> = MigrationContext<Client> & {};

export type DownMigrationContext<Client = any> = MigrationContext<Client> & {};
