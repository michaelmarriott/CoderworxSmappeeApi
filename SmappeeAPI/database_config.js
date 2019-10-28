const config = {
    user: 'postgres', // env var: PGUSER
    database: 'MqqtDb', // env var: PGDATABASE
    password: 'R3dDr@g0nP', // env var: PGPASSWORD
    host: 'localhost', // Server hosting the postgres database
    port: 5432, // env var: PGPORT
    max: 10, // max number of clients in the pool
    idleTimeoutMillis: 30000 // how long a client is allowed to remain idle before being closed
  }
  exports.config = config;