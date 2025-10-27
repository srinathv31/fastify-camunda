/**
 * A stub repository for user data. Use this file to encapsulate all
 * database queries related to users. In this scaffold no queries are
 * implemented; see `src/plugins/db.ts` for a stub implementation of
 * the database client.
 */
export const UserRepo = {
  async findById(_userId: string): Promise<Record<string, unknown> | null> {
    // TODO: implement a SELECT query against your MSSQL database
    return null;
  },
};