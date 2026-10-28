-- Runs once, the first time the Postgres container starts with an empty volume.
-- Enables pgvector in the dev database and creates a separate database for tests.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE DATABASE fitwork_test;
\c fitwork_test
CREATE EXTENSION IF NOT EXISTS vector;
