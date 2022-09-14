require('dotenv').config()
const {
  PGHOST,
  PGUSER,
  PGDATABASE,
  PGPASSWORD,
  PGPORT,
  NODE_ENV
} = process.env

const knex = require('knex')({
  client: 'pg',
  connection: {
    host: PGHOST,
    port: parseInt(PGPORT),
    user: PGUSER,
    password: PGPASSWORD,
    database: PGDATABASE
  },
  pool: {
    min: 0,
    max: 7
  },
  debug: NODE_ENV === 'development'
})

module.exports = knex
