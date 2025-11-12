// Mock implementation of mssql module for testing
const mockRequest = {
  input: jest.fn().mockReturnThis(),
  query: jest.fn().mockResolvedValue({ recordset: [] }),
};

const mockTransaction = {
  begin: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  request: jest.fn().mockReturnValue(mockRequest),
};

const mockPool = {
  connect: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  request: jest.fn().mockReturnValue(mockRequest),
  transaction: jest.fn().mockReturnValue(mockTransaction),
};

class ConnectionPool {
  constructor(config: any) {
    return mockPool as any;
  }
}

// Export type constants that mssql provides
const sql = {
  ConnectionPool,
  NVarChar: { name: "NVarChar" },
  Int: { name: "Int" },
  BigInt: { name: "BigInt" },
  Float: { name: "Float" },
  Bit: { name: "Bit" },
  DateTime2: { name: "DateTime2" },
};

export default sql;
export { ConnectionPool };
