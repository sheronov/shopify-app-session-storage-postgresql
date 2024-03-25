'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var shopifyApi = require('@shopify/shopify-api');
var migrations = require('./migrations.js');
var postgresConnection = require('./postgres-connection.js');
var postgresMigrator = require('./postgres-migrator.js');

const defaultPostgreSQLSessionStorageOptions = {
  sessionTableName: 'shopify_sessions',
  port: 3211,
  migratorOptions: {
    migrationDBIdentifier: 'shopify_sessions_migrations',
    migrationNameColumnName: 'migration_name'
  }
};
class PostgreSQLSessionStorage {
  static withCredentials(host, dbName, username, password, opts) {
    return new PostgreSQLSessionStorage(new URL(`postgres://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}/${encodeURIComponent(dbName)}`), opts);
  }
  constructor(dbUrl, opts = {}) {
    this.ready = void 0;
    this.internalInit = void 0;
    this.options = void 0;
    this.client = void 0;
    this.migrator = void 0;
    this.options = {
      ...defaultPostgreSQLSessionStorageOptions,
      ...opts
    };
    this.internalInit = this.init(typeof dbUrl === 'string' ? dbUrl : dbUrl.toString());
    this.migrator = new postgresMigrator.PostgresSessionStorageMigrator(this.client, this.options.migratorOptions, migrations.migrationList);
    this.ready = this.migrator.applyMigrations(this.internalInit);
  }
  async storeSession(session) {
    await this.ready;

    // Note milliseconds to seconds conversion for `expires` property
    const entries = session.toPropertyArray().map(([key, value]) => key === 'expires' ? [key, Math.floor(value / 1000)] : [key, value]);
    const query = `
      INSERT INTO "${this.options.sessionTableName}"
      (${entries.map(([key]) => `"${key}"`).join(', ')})
      VALUES (${entries.map((_, i) => `${this.client.getArgumentPlaceholder(i + 1)}`).join(', ')})
      ON CONFLICT ("id") DO UPDATE SET ${entries.map(([key]) => `"${key}" = Excluded."${key}"`).join(', ')};
    `;
    await this.client.query(query, entries.map(([_key, value]) => value));
    return true;
  }
  async loadSession(id) {
    await this.ready;
    const query = `
      SELECT * FROM "${this.options.sessionTableName}"
      WHERE "id" = ${this.client.getArgumentPlaceholder(1)};
    `;
    const rows = await this.client.query(query, [id]);
    if (!Array.isArray(rows) || (rows === null || rows === void 0 ? void 0 : rows.length) !== 1) return undefined;
    const rawResult = rows[0];
    return this.databaseRowToSession(rawResult);
  }
  async deleteSession(id) {
    await this.ready;
    const query = `
      DELETE FROM "${this.options.sessionTableName}"
      WHERE "id" = ${this.client.getArgumentPlaceholder(1)};
    `;
    await this.client.query(query, [id]);
    return true;
  }
  async deleteSessions(ids) {
    await this.ready;
    const query = `
      DELETE FROM "${this.options.sessionTableName}"
      WHERE "id" IN (${ids.map((_, i) => `${this.client.getArgumentPlaceholder(i + 1)}`).join(', ')});
    `;
    await this.client.query(query, ids);
    return true;
  }
  async findSessionsByShop(shop) {
    await this.ready;
    const query = `
      SELECT * FROM "${this.options.sessionTableName}"
      WHERE "shop" = ${this.client.getArgumentPlaceholder(1)};
    `;
    const rows = await this.client.query(query, [shop]);
    if (!Array.isArray(rows) || (rows === null || rows === void 0 ? void 0 : rows.length) === 0) return [];
    const results = rows.map(row => {
      return this.databaseRowToSession(row);
    });
    return results;
  }
  disconnect() {
    return this.client.disconnect();
  }
  async init(dbUrl) {
    this.client = new postgresConnection.PostgresConnection(dbUrl, this.options.sessionTableName);
    await this.connectClient();
    await this.createTable();
  }
  async connectClient() {
    await this.client.connect();
  }
  async createTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS "${this.options.sessionTableName}" (
          "id" varchar(255) NOT NULL PRIMARY KEY,
          "shop" varchar(255) NOT NULL,
          "state" varchar(255) NOT NULL,
          "isOnline" boolean NOT NULL,
          "scope" varchar(255),
          "expires" integer,
          "onlineAccessInfo" varchar(255),
          "accessToken" varchar(255)
        )
      `;
    await this.client.query(query);
  }
  databaseRowToSession(row) {
    // convert seconds to milliseconds prior to creating Session object
    if (row.expires) row.expires *= 1000;
    return shopifyApi.Session.fromPropertyArray(Object.entries(row));
  }
}

exports.PostgreSQLSessionStorage = PostgreSQLSessionStorage;
