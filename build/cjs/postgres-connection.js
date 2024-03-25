'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var pg = require('pg');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var pg__default = /*#__PURE__*/_interopDefaultLegacy(pg);

class PostgresConnection {
  constructor(dbUrl, sessionStorageIdentifier) {
    this.sessionStorageIdentifier = void 0;
    this.ready = void 0;
    this.pool = void 0;
    this.dbUrl = void 0;
    this.dbUrl = new URL(dbUrl);
    this.ready = this.init();
    this.sessionStorageIdentifier = sessionStorageIdentifier;
  }
  async query(query, params = []) {
    await this.ready;
    return (await this.pool.query(query, params)).rows;
  }

  /**
   * Runs a series of queries in a transaction - requires the use of a SINGLE client,
   * hence we can't use the query method above.
   *
   * @param queries an array of SQL queries to execute in a transaction
   */
  async transaction(queries) {
    await this.ready;

    // check if the first and last queries are BEGIN and COMMIT, if not, add them
    if (queries[0] !== 'BEGIN') {
      queries.unshift('BEGIN');
    }
    if (queries[queries.length - 1] !== 'COMMIT') {
      queries.push('COMMIT');
    }
    const client = await this.pool.connect();
    try {
      for (const query of queries) {
        await client.query(query);
      }
    } catch (error) {
      // rollback if any of the queries fail
      await client.query(`ROLLBACK`);
      throw error;
    } finally {
      client.release();
    }
  }
  async disconnect() {
    // Since no longer using individual client, use disconnect to reset the pool.
    await this.ready;
    await this.pool.end();
    this.ready = this.init();
  }
  async connect() {
    await this.ready;
  }
  getDatabase() {
    return decodeURIComponent(this.dbUrl.pathname.slice(1));
  }
  getSSL() {
    const ssl = this.dbUrl.searchParams.get('ssl');
    return ssl ? JSON.parse(ssl) : undefined;
  }
  async hasTable(tablename) {
    await this.ready;
    const query = `
      SELECT EXISTS (
        SELECT tablename FROM pg_catalog.pg_tables
          WHERE tablename = ${this.getArgumentPlaceholder(1)}
      )
  `;

    // Allow multiple apps to be on the same host with separate DB and querying the right
    // DB for the session table exisitence
    const rows = await this.query(query, [tablename]);
    return rows[0].exists;
  }
  getArgumentPlaceholder(position) {
    return `$${position}`;
  }
  async init() {
    this.pool = new pg__default["default"].Pool({
      host: this.dbUrl.hostname,
      user: decodeURIComponent(this.dbUrl.username),
      password: decodeURIComponent(this.dbUrl.password),
      database: this.getDatabase(),
      port: Number(this.dbUrl.port),
      ssl: this.getSSL()
    });
  }
}

exports.PostgresConnection = PostgresConnection;
