#!/usr/bin/env node
/**
 * Dashboard Studio — Multi-Database Read-Only Query Connector
 *
 * Default connector: Google BigQuery (via keyless gcloud ADC + BigQuery REST jobs.query API).
 * Additional connectors: PostgreSQL/Cloud SQL/AlloyDB, MySQL, DuckDB, and CSV.
 *
 * Security controls:
 * - Enforces read-only SELECT / WITH statements; rejects DDL/DML keywords.
 * - Uses parameterized BigQuery queryParameters (@param) — never string concatenation.
 * - Preserves local data/snapshot.json fallback cleanly when credentials are absent.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const FORBIDDEN_SQL_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE|MERGE|CALL|EXEC)\b/i;

function parseArgs(argv) {
  let projectDir = process.cwd();
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--project-dir' && argv[i + 1]) {
      projectDir = argv[++i];
    }
  }
  return { projectDir: fs.realpathSync(projectDir) };
}

function loadDotEnv(projectDir) {
  const envPath = path.join(projectDir, '.env');
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      out[key] = val;
    }
  }
  return out;
}

function assertReadOnlySql(sql) {
  const cleaned = String(sql || '').trim();
  if (!cleaned) throw new Error('Empty SQL query');
  if (!/^(SELECT|WITH)\b/i.test(cleaned)) {
    throw new Error('Only read-only SELECT or WITH queries are permitted');
  }
  if (FORBIDDEN_SQL_RE.test(cleaned)) {
    throw new Error('Query contains forbidden non-read-only SQL keyword');
  }
  if (cleaned.includes(';')) {
    throw new Error('Multi-statement SQL queries are not permitted');
  }
  return cleaned;
}

function getGcloudAccessToken() {
  const gcloudBin = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  const out = execFileSync(
    gcloudBin,
    ['auth', 'application-default', 'print-access-token'],
    { encoding: 'utf-8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  return out.trim();
}

function runBigQueryRest({ projectId, location, maxBytesBilled, sql, parameters, token }) {
  return new Promise((resolve, reject) => {
    const queryParameters = Object.entries(parameters || {}).map(([name, value]) => {
      const isInt = typeof value === 'number' && Number.isInteger(value);
      const isFloat = typeof value === 'number' && !Number.isInteger(value);
      return {
        name,
        parameterType: { type: isInt ? 'INT64' : isFloat ? 'FLOAT64' : 'STRING' },
        parameterValue: { value: String(value) },
      };
    });
    const payload = JSON.stringify({
      query: sql,
      useLegacySql: false,
      location: location || 'US',
      maximumBytesBilled: String(maxBytesBilled || 1073741824),
      parameterMode: 'NAMED',
      queryParameters,
    });

    const req = https.request(
      {
        hostname: 'bigquery.googleapis.com',
        path: `/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 20_000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            if (res.statusCode !== 200 || parsed.error) {
              reject(new Error('BigQuery query request returned non-200 status'));
              return;
            }
            const fields = parsed.schema?.fields || [];
            const rows = (parsed.rows || []).map((r) => {
              const obj = {};
              (r.f || []).forEach((cell, idx) => {
                const field = fields[idx];
                if (!field) return;
                const rawVal = cell?.v;
                if (rawVal === null || rawVal === undefined) {
                  obj[field.name] = null;
                } else if (['INTEGER', 'INT64', 'FLOAT', 'FLOAT64', 'NUMERIC', 'BIGNUMERIC'].includes(field.type)) {
                  obj[field.name] = Number(rawVal);
                } else {
                  obj[field.name] = String(rawVal);
                }
              });
              return obj;
            });
            resolve(rows);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function parseCsvContent(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const splitRow = (line) => {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  };
  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitRow(line);
    const obj = {};
    headers.forEach((h, idx) => {
      const v = vals[idx] ?? '';
      const num = Number(v);
      obj[h] = v !== '' && Number.isFinite(num) ? num : v;
    });
    return obj;
  });
}

async function main() {
  const { projectDir } = parseArgs(process.argv);
  const envCfg = { ...loadDotEnv(projectDir), ...process.env };
  const configPath = path.join(projectDir, 'dashboard.config.json');
  const snapPath = path.join(projectDir, 'data', 'snapshot.json');

  if (!fs.existsSync(configPath)) {
    console.error('dashboard.config.json not found in target project directory.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const existingSnap = fs.existsSync(snapPath)
    ? JSON.parse(fs.readFileSync(snapPath, 'utf-8'))
    : { sourceMode: 'snapshot', connector: 'bigquery', records: [], weeklyTimeline: [] };

  const connector = (envCfg.DASHBOARD_CONNECTOR || config.connector || 'bigquery').toLowerCase();

  if (connector === 'csv' && envCfg.CSV_PATH) {
    const resolvedCsv = path.resolve(projectDir, envCfg.CSV_PATH);
    if (resolvedCsv.startsWith(projectDir + path.sep) && fs.existsSync(resolvedCsv)) {
      const records = parseCsvContent(fs.readFileSync(resolvedCsv, 'utf-8'));
      const nextSnap = {
        ...existingSnap,
        sourceMode: 'live-csv',
        connector: 'csv',
        generatedAt: new Date().toISOString(),
        records,
      };
      fs.mkdirSync(path.dirname(snapPath), { recursive: true });
      fs.writeFileSync(snapPath, JSON.stringify(nextSnap, null, 2) + '\n', 'utf-8');
      console.log(`Loaded ${records.length} rows from CSV into data/snapshot.json.`);
      return;
    }
  }

  if (connector === 'duckdb' && envCfg.DUCKDB_PATH && config.queries?.records) {
    const resolvedDb = path.resolve(projectDir, envCfg.DUCKDB_PATH);
    if (resolvedDb.startsWith(projectDir + path.sep) && fs.existsSync(resolvedDb)) {
      const sql = assertReadOnlySql(config.queries.records.replace(/@\w+/g, "'All'"));
      try {
        const out = execFileSync('duckdb', ['-readonly', '-json', resolvedDb, sql], {
          encoding: 'utf-8',
          timeout: 15_000,
        });
        const records = JSON.parse(out);
        const nextSnap = {
          ...existingSnap,
          sourceMode: 'live-duckdb',
          connector: 'duckdb',
          generatedAt: new Date().toISOString(),
          records,
        };
        fs.writeFileSync(snapPath, JSON.stringify(nextSnap, null, 2) + '\n', 'utf-8');
        console.log(`Loaded ${records.length} rows from DuckDB into data/snapshot.json.`);
        return;
      } catch {
        console.log('DuckDB CLI unavailable or query skipped; retaining local snapshot.');
        return;
      }
    }
  }

  if (connector === 'postgres' && envCfg.PGHOST && envCfg.PGDATABASE && config.queries?.records) {
    try {
      const sql = assertReadOnlySql(config.queries.records.replace(/@\w+/g, "'All'"));
      const roQuery = `SET default_transaction_read_only = on; ${sql}`;
      const args = [
        '--csv',
        '--no-psqlrc',
        '--set=ON_ERROR_STOP=1',
        '-h',
        envCfg.PGHOST,
        '-p',
        String(envCfg.PGPORT || '5432'),
        '-d',
        envCfg.PGDATABASE,
      ];
      if (envCfg.PGUSER) args.push('-U', envCfg.PGUSER);
      args.push('-c', roQuery);
      const csvOut = execFileSync('psql', args, {
        encoding: 'utf-8',
        timeout: 15_000,
        env: { ...process.env, PGSSLMODE: envCfg.PGSSLMODE || 'prefer', PGPASSWORD: envCfg.PGPASSWORD || '' },
      });
      const records = parseCsvContent(csvOut);
      const nextSnap = {
        ...existingSnap,
        sourceMode: 'live-postgres',
        connector: 'postgres',
        generatedAt: new Date().toISOString(),
        records,
      };
      fs.mkdirSync(path.dirname(snapPath), { recursive: true });
      fs.writeFileSync(snapPath, JSON.stringify(nextSnap, null, 2) + '\n', 'utf-8');
      console.log(`Loaded ${records.length} rows from PostgreSQL into data/snapshot.json.`);
      return;
    } catch {
      console.log('PostgreSQL CLI/connection not active yet; serving bundled snapshot fallback.');
      return;
    }
  }

  if (connector === 'mysql' && envCfg.MYSQL_HOST && envCfg.MYSQL_DATABASE && config.queries?.records) {
    try {
      const sql = assertReadOnlySql(config.queries.records.replace(/@\w+/g, "'All'"));
      const args = [
        '--batch',
        '--raw',
        `--host=${envCfg.MYSQL_HOST}`,
        `--port=${String(envCfg.MYSQL_PORT || '3306')}`,
        `--database=${envCfg.MYSQL_DATABASE}`,
      ];
      if (envCfg.MYSQL_USER) args.push(`--user=${envCfg.MYSQL_USER}`);
      if (envCfg.MYSQL_HOST !== '127.0.0.1' && envCfg.MYSQL_HOST !== 'localhost') {
        args.push('--ssl-mode=REQUIRED');
      }
      args.push('-e', `SET SESSION TRANSACTION READ ONLY; ${sql}`);
      const tsvOut = execFileSync('mysql', args, {
        encoding: 'utf-8',
        timeout: 15_000,
        env: { ...process.env, MYSQL_PWD: envCfg.MYSQL_PASSWORD || '' },
      });
      const csvConverted = tsvOut
        .split(/\r?\n/)
        .map((line) => line.split('\t').map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const records = parseCsvContent(csvConverted);
      const nextSnap = {
        ...existingSnap,
        sourceMode: 'live-mysql',
        connector: 'mysql',
        generatedAt: new Date().toISOString(),
        records,
      };
      fs.mkdirSync(path.dirname(snapPath), { recursive: true });
      fs.writeFileSync(snapPath, JSON.stringify(nextSnap, null, 2) + '\n', 'utf-8');
      console.log(`Loaded ${records.length} rows from MySQL into data/snapshot.json.`);
      return;
    } catch {
      console.log('MySQL CLI/connection not active yet; serving bundled snapshot fallback.');
      return;
    }
  }

  if (connector === 'bigquery' && envCfg.GCP_PROJECT_ID && config.queries?.records) {
    try {
      const sql = assertReadOnlySql(config.queries.records);
      const token = getGcloudAccessToken();
      const defaultParams = { ...(config.queryParams || {}) };
      for (const f of config.filters || []) {
        if (f.field && !(f.field in defaultParams)) defaultParams[f.field] = 'All';
      }
      const records = await runBigQueryRest({
        projectId: envCfg.GCP_PROJECT_ID,
        location: envCfg.BQ_LOCATION || 'US',
        maxBytesBilled: envCfg.BQ_MAX_BYTES_BILLED || '1073741824',
        sql,
        parameters: defaultParams,
        token,
      });
      const nextSnap = {
        ...existingSnap,
        sourceMode: 'live-bigquery',
        connector: 'bigquery',
        generatedAt: new Date().toISOString(),
        records,
      };
      fs.mkdirSync(path.dirname(snapPath), { recursive: true });
      fs.writeFileSync(snapPath, JSON.stringify(nextSnap, null, 2) + '\n', 'utf-8');
      console.log(`Loaded ${records.length} live BigQuery rows into data/snapshot.json.`);
      return;
    } catch {
      console.log('Live BigQuery credentials/table not active yet; serving bundled snapshot fallback.');
      return;
    }
  }

  console.log(
    `Serving ready-to-use local ${connector} snapshot (set GCP_PROJECT_ID in .env to switch to live BigQuery).`
  );
}

main();
