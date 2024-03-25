'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var shopifyAppSessionStorage = require('@shopify/shopify-app-session-storage');

const migrationList = [new shopifyAppSessionStorage.MigrationOperation('migrateScopeFieldToVarchar1024', migrateScopeFieldToVarchar1024), new shopifyAppSessionStorage.MigrationOperation('migrateToCaseSensitivity', migrateToCaseSensitivity)];

// need change the size of the scope column from 255 to 1024 char
async function migrateScopeFieldToVarchar1024(connection) {
  await connection.query(`ALTER TABLE "${connection.sessionStorageIdentifier}"
    ALTER COLUMN "scope" TYPE varchar(1024)`);
}
async function migrateToCaseSensitivity(connection) {
  let queries = [];
  if (connection.sessionStorageIdentifier === connection.sessionStorageIdentifier.toLowerCase()) {
    // tablename is lowercase anyway, only need to rename the relevant columns (if not already renamed)
    const hasOldColumnsQuery = `
      SELECT EXISTS (
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name = '${connection.sessionStorageIdentifier}' AND column_name='isonline'
      )
    `;
    const rows = await connection.query(hasOldColumnsQuery);
    if (rows[0].exists) {
      queries = [`ALTER TABLE "${connection.sessionStorageIdentifier}" RENAME COLUMN "isonline" TO "isOnline"`, `ALTER TABLE "${connection.sessionStorageIdentifier}" RENAME COLUMN "onlineaccessinfo" TO "onlineAccessInfo"`, `ALTER TABLE "${connection.sessionStorageIdentifier}" RENAME COLUMN "accesstoken" TO "accessToken"`];
    }
  } else {
    // may need to migrate the data from the old table (if it exists) to the new one
    const hasOldSessionTable = await connection.hasTable(connection.sessionStorageIdentifier.toLowerCase());
    if (hasOldSessionTable) {
      queries = [
      // 1. copy the data from the old table to the new one
      `INSERT INTO "${connection.sessionStorageIdentifier}" (
          "id", "shop", "state", "isOnline", "scope", "expires", "onlineAccessInfo", "accessToken"
        )
        SELECT id, shop, state, isonline, scope, expires, onlineaccessinfo, accesstoken
        FROM "${connection.sessionStorageIdentifier.toLowerCase()}"`,
      // 2. drop the old table
      `DROP TABLE "${connection.sessionStorageIdentifier.toLowerCase()}"`];
    }
  }
  if (queries.length !== 0) {
    // wrap in a transaction
    queries.unshift(`BEGIN`);
    queries.push(`COMMIT`);
    await connection.transaction(queries);
  }
}

exports.migrateScopeFieldToVarchar1024 = migrateScopeFieldToVarchar1024;
exports.migrateToCaseSensitivity = migrateToCaseSensitivity;
exports.migrationList = migrationList;
