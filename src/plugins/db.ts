import fp from "fastify-plugin";
import sql, { config as MSSQLConfig, ConnectionPool, IResult } from "mssql";

declare module "fastify" {
  interface FastifyInstance {
    db: {
      query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
      withTransaction<T>(fn: (tx: sql.Transaction) => Promise<T>): Promise<T>;
    };
  }
}

type PluginOpts = {
  config: MSSQLConfig;
  paramPrefix?: string; // default '@p'
};

function inferType(v: unknown) {
  if (v === null || v === undefined) return sql.NVarChar; // nullable string fallback
  switch (typeof v) {
    case "number":
      if (Number.isInteger(v)) {
        // Int range: -2147483648 to 2147483647
        // Use BigInt for values outside this range to prevent overflow
        return (v as number) > 2147483647 || (v as number) < -2147483648
          ? sql.BigInt
          : sql.Int;
      }
      return sql.Float;
    case "bigint":
      return sql.BigInt;
    case "boolean":
      return sql.Bit;
    case "object":
      if (v instanceof Date) return sql.DateTime2;
      // default to JSON string
      return sql.NVarChar;
    default:
      return sql.NVarChar;
  }
}

export default fp<PluginOpts>(
  async (fastify, opts) => {
    const { config, paramPrefix = "@p" } = opts;

    const pool = new ConnectionPool(config);

    fastify.log.info("Connecting MSSQL pool…");
    await pool.connect();
    fastify.log.info("MSSQL connected.");

    // close cleanly on shutdown
    fastify.addHook("onClose", async () => {
      try {
        fastify.log.info("Closing MSSQL pool…");
        await pool.close();
        fastify.log.info("MSSQL pool closed.");
      } catch (err) {
        fastify.log.error({ err }, "Error closing MSSQL pool");
      }
    });

    async function query<T = any>(
      text: string,
      params: unknown[] = []
    ): Promise<T[]> {
      const start = Date.now();
      const request = pool.request();
      params.forEach((val, idx) => {
        const name = `p${idx + 1}`;
        request.input(name, inferType(val), val as any);
      });

      try {
        // Replace @p1, @p2… into the actual param names if you want a prefix control.
        // (Your SQL can keep using @p1, @p2, etc.; mssql Request maps by name.)
        const result: IResult<T> = await request.query(text);
        return result.recordset ?? [];
      } finally {
        const ms = Date.now() - start;
        fastify.log.debug({ sql: text, ms }, "mssql.query");
      }
    }

    async function withTransaction<T>(
      fn: (tx: sql.Transaction) => Promise<T>
    ): Promise<T> {
      const transaction = pool.transaction();
      await transaction.begin();

      try {
        const result = await fn(transaction);
        await transaction.commit();
        return result;
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    }

    fastify.decorate("db", { query, withTransaction });
  },
  {
    name: "db-plugin",
  }
);
