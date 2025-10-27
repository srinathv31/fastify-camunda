import fp from 'fastify-plugin';

/**
 * A minimal MSSQL database plugin. This stub exposes a `query` method on
 * `app.db` that simply logs the SQL and returns an empty result set. It
 * should be replaced with a real implementation using a driver such as
 * `mssql` or an ORM like `typeorm`. A `close` method is also provided
 * and automatically invoked when the Fastify instance is shut down.
 */
type Db = {
  /**
   * Execute an SQL query. Replace this stub with your real MSSQL call.
   */
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
  /**
   * Close the database connection. Called on server shutdown.
   */
  close: () => Promise<void>;
};

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export default fp(async (app) => {
  const db: Db = {
    async query(sql: string, params?: unknown[]) {
      // In a real implementation you would use a connection pool here.
      app.log.debug({ sql, params }, 'db.query called (stub)');
      return { rows: [] };
    },
    async close() {
      app.log.info('db.close called (stub)');
    },
  };

  app.decorate('db', db);

  // Ensure that the database connection is closed when the server shuts down.
  app.addHook('onClose', async () => {
    await db.close();
  });
});