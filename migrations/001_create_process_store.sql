-- Migration: Create process_store table for MSSQL-backed waitroom
-- This table stores process state for the polling-based waitroom pattern

-- Drop table if exists (for development/testing)
IF OBJECT_ID('dbo.process_store', 'U') IS NOT NULL
  DROP TABLE dbo.process_store;
GO

-- Create process_store table
CREATE TABLE dbo.process_store (
  correlation_id  VARCHAR(64) NOT NULL PRIMARY KEY,
  status          VARCHAR(16) NOT NULL,         -- 'PENDING'|'DONE'|'ERROR'
  payload_json    NVARCHAR(MAX) NULL,
  error_json      NVARCHAR(MAX) NULL,
  started_at      DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at      DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- Create index on status for efficient pending count queries
CREATE INDEX IX_ProcessStore_Status ON dbo.process_store(status);
GO

-- Create index on updated_at for cleanup/monitoring queries
CREATE INDEX IX_ProcessStore_UpdatedAt ON dbo.process_store(updated_at);
GO

PRINT 'process_store table created successfully';
GO

