import { PoolClient } from 'pg';
import { Exception } from 'typesdk/errors';
import { Database as Postgres } from 'typesdk/database/postgres';

import type { DownMigrationContext, Migration, UpMigrationContext } from '../_internals/types';


export type PostgresMigration<UR = void, DR = void> = Migration<
  (context: UpMigrationContext<PoolClient>) => Promise<UR>,
  (context: DownMigrationContext<PoolClient>) => Promise<DR>
>;

export type PostgresMigratorExtensionProps = {
  user: string;
  host: string;
  database: string;
  password: string;
  port?: number;
  sslMode?: 'disable' | 'require' | 'verify-ca' | 'verify-full';
  tls?: never;
  tablePrefix?: string;
  connectionTimeoutMillis?: number;
  ttl?: number;
}

export type PostgresMigratorExtensionPropsWithoutConnection = Omit<PostgresMigratorExtensionProps,
  'user' | 'host' | 'database' | 'password' | 'port' | 'sslMode' | 'tls' | 'connectionTimeoutMillis' | 'ttl'>;


export class PostgresMigratorExtension {
  readonly #o: PostgresMigratorExtensionPropsWithoutConnection;
  readonly #c: URL;
  // readonly #m: Map<string, Migration> = new Map();
  #executedMigrations: string[] = [];
  #clientCache: Postgres | null = null;
  #modified: boolean = false;

  constructor(connectionString: string, options?: PostgresMigratorExtensionPropsWithoutConnection);
  constructor(props: PostgresMigratorExtensionProps);
  public constructor(connectionStringOrProps: string | PostgresMigratorExtensionProps, options?: PostgresMigratorExtensionPropsWithoutConnection) {
    if(typeof connectionStringOrProps === 'string') {
      this.#o = Object.assign({}, options);
      this.#c = new URL(connectionStringOrProps);
    } else {
      this.#o = Object.assign({}, connectionStringOrProps);
      this.#c = new URL(`postgres://${connectionStringOrProps.user}:${connectionStringOrProps.password}@${connectionStringOrProps.host}`);

      this.#c.port = `${connectionStringOrProps.port ?? 5432}`;
      this.#c.pathname = connectionStringOrProps.database;
    }

    if(!!this.#o.tablePrefix &&
      !/^[a-zA-Z_]+$/.test(this.#o.tablePrefix)) {
      throw new Exception(`Invalid table prefix: ${this.#o.tablePrefix}`);
    }
  }

  public async loadMigrationsFromDirectory(pathname: string): Promise<void> {
    return void pathname;
  }

  public __danger__resetDatabase(mode: string): Promise<void> {
    if(mode !== 'delete-all') {
      throw new Exception('By security reasons, you can only reset the database by deleting all tables and our data. If you are sure you want to do this, pass \'delete-all\' as the first argument.');
    }

    return this.#__DANGER__resetDatabase();
  }

  public getExecutedMigrationsNames(): Promise<readonly string[]> {
    return this.#getExecutedMigrations();
  }

  #getExecutedMigrations(): Promise<readonly string[]> {
    if(!this.#executedMigrations || this.#modified) return this.#retrieveExecutedMigrations();
    return Promise.resolve(Object.freeze(this.#executedMigrations ?? []));
  }

  async #retrieveExecutedMigrations(): Promise<readonly string[]> {
    const tableName = this.#o.tablePrefix ? 
      `${this.#o.tablePrefix.endsWith('_') ? this.#o.tablePrefix : `${this.#o.tablePrefix}_`}migrations` :
      'migrations';

    const database = await this.#connect();

    try {
      await database.transaction(async client => {
        await client.query({
          text: `CREATE TABLE IF NOT EXISTS ${tableName} (
            migration_id VARCHAR(128) NOT NULL UNIQUE PRIMARY KEY,
            migration_name VARCHAR(128) NOT NULL UNIQUE,
            text_content TEXT NOT NULL,
            executed_at TIMESTAMP WITH TIME ZONE NULL
          );`,
        });

        const { rows } = await client.query({
          text: `SELECT * FROM ${tableName} WHERE executed_at IS NOT NULL ORDER BY executed_at ASC`,
        });

        this.#executedMigrations = rows.map(row => row.migration_name);
      });

      return Object.freeze(this.#executedMigrations);
    } finally {
      await database.close();
    }
  }

  async #__DANGER__resetDatabase(): Promise<void> {
    const lookupQuery = `SELECT 
      table_name,
      column_name,
      data_type,
      constraint_type,
      constraint_name
    FROM 
      information_schema.columns
    LEFT JOIN 
      information_schema.key_column_usage 
      ON
        (information_schema.columns.table_name = information_schema.key_column_usage.table_name 
      AND
        information_schema.columns.column_name = information_schema.key_column_usage.column_name)
    LEFT JOIN 
      information_schema.table_constraints 
      ON (information_schema.key_column_usage.constraint_name = information_schema.table_constraints.constraint_name)
    WHERE 
      table_schema = 'public';`;

    const database = await this.#connect();

    try {
      await database.transaction(async client => {
        const { rows } = await client.query({ text: lookupQuery });
        console.log(rows);
      });
    } finally {
      await database.close();
    }
  }

  async #connect(): Promise<Postgres> {
    if(!this.#clientCache ||
      !(await this.#clientCache.isOnline())) {
      this.#clientCache = new Postgres(this.#c.toString());
    }

    return this.#clientCache;
  }
}
