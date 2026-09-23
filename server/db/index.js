import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3Wasm from 'node-sqlite3-wasm';
import { config } from '../config/env.js';

// node-sqlite3-wasm is a pure WebAssembly build, so npm install runs no native
// compilation and the Render build needs no compiler.
const { Database } = sqlite3Wasm;

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.join(here, 'schema.sql');

let db = null;

export function initDatabase() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.database.file), { recursive: true });
  db = new Database(config.database.file);
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  return db;
}

export function getDatabase() {
  return db ?? initDatabase();
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

const COLUMNS = `
  id, user_id, project_name, prompt_title, prompt_version, prompt_text,
  response_summary, category, usefulness, reviewed, improved,
  screenshot_url, notes, created_at, updated_at
`;

// SQLite has no boolean type, so the API converts on the way out.
function toApiShape(row) {
  if (!row) return null;
  return { ...row, reviewed: row.reviewed === 1, improved: row.improved === 1 };
}

export function listCapsulesForUser(userId) {
  const rows = getDatabase().all(
    `SELECT ${COLUMNS} FROM capsules WHERE user_id = ? ORDER BY datetime(created_at) DESC, id DESC`,
    [userId],
  );
  return rows.map(toApiShape);
}

export function findCapsuleForUser(id, userId) {
  const row = getDatabase().get(
    `SELECT ${COLUMNS} FROM capsules WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return toApiShape(row);
}

export function createCapsule(userId, values) {
  const now = new Date().toISOString();
  const result = getDatabase().run(
    `INSERT INTO capsules (
       user_id, project_name, prompt_title, prompt_version, prompt_text,
       response_summary, category, usefulness, reviewed, improved,
       screenshot_url, notes, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      values.project_name,
      values.prompt_title,
      values.prompt_version,
      values.prompt_text,
      values.response_summary,
      values.category,
      values.usefulness,
      values.reviewed ? 1 : 0,
      values.improved ? 1 : 0,
      values.screenshot_url,
      values.notes,
      now,
      now,
    ],
  );
  return findCapsuleForUser(Number(result.lastInsertRowid), userId);
}

export function updateCapsule(id, userId, patch) {
  const assignments = [];
  const params = [];

  for (const [column, value] of Object.entries(patch)) {
    assignments.push(`${column} = ?`);
    params.push(column === 'reviewed' || column === 'improved' ? (value ? 1 : 0) : value);
  }

  assignments.push('updated_at = ?');
  params.push(new Date().toISOString(), id, userId);

  const result = getDatabase().run(
    `UPDATE capsules SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`,
    params,
  );

  return result.changes === 0 ? null : findCapsuleForUser(id, userId);
}

export function deleteCapsule(id, userId) {
  const result = getDatabase().run('DELETE FROM capsules WHERE id = ? AND user_id = ?', [
    id,
    userId,
  ]);
  return result.changes > 0;
}
