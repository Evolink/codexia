// Validates every connector under registry/ against the vendored MCP
// server.json schema and the catalog rules in CONTRIBUTING.md. Exits non-zero on any problem.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const root = join(import.meta.dirname, '../registry');
const SCHEMA_URL = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';
const META_KEY = 'io.github.milisp.codexia';
const PUBLISHER_KEY = 'io.modelcontextprotocol.registry/publisher-provided';

const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(readJson('schema/server.schema.json'));

const index = readJson('index.json');
const categories = new Set(index.categories);
const files = readdirSync(join(root, 'servers')).filter((f) => f.endsWith('.json'));
const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);

// index.json and servers/ must list exactly the same entries.
const listed = new Set(index.servers);
if (listed.size !== index.servers.length) fail('index.json', 'servers contains duplicates');
for (const id of listed) {
  if (!files.includes(`${id}.json`)) fail('index.json', `"${id}" has no servers/${id}.json`);
}
for (const file of files) {
  if (!listed.has(file.slice(0, -5))) fail(`servers/${file}`, 'not listed in index.json servers');
}

for (const file of files) {
  const where = `servers/${file}`;
  const id = file.slice(0, -5);
  let server;
  try {
    server = readJson(where);
  } catch (error) {
    fail(where, `invalid JSON (${error.message})`);
    continue;
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail(where, 'file name must be lowercase kebab-case');
  if (!validateSchema(server)) {
    for (const e of validateSchema.errors) fail(where, `${e.instancePath || '/'} ${e.message}`);
  }
  if (server.$schema !== SCHEMA_URL) fail(where, `$schema must be ${SCHEMA_URL}`);
  if (server.name?.split('/').pop() !== id) fail(where, `name must end with "/${id}"`);
  if (!server.remotes?.length) fail(where, 'needs at least one entry in remotes');
  if (server.description?.length > 100) fail(where, 'description must be at most 100 characters');

  for (const remote of server.remotes ?? []) {
    if (!['streamable-http', 'sse'].includes(remote.type)) {
      fail(where, `remote type must be streamable-http or sse: ${remote.type}`);
    }
    if (URL.parse(remote.url ?? '')?.protocol !== 'https:') {
      fail(where, `remote URL must use https: ${remote.url}`);
    }
  }

  // Secrets are entered by the user at install time and never stored here.
  for (const input of (server.remotes ?? []).flatMap((r) => r.headers ?? [])) {
    if (input.isSecret && (input.value !== undefined || input.default !== undefined)) {
      fail(where, `secret input "${input.name}" must not have a value or default`);
    }
  }

  const meta = server._meta?.[PUBLISHER_KEY]?.[META_KEY];
  if (!meta) {
    fail(where, `missing _meta["${PUBLISHER_KEY}"]["${META_KEY}"]`);
    continue;
  }
  if (meta.configName !== id) fail(where, `configName must be "${id}"`);
  if (!categories.has(meta.category)) {
    fail(where, `category "${meta.category}" is not one of index.json categories`);
  }
  if (typeof meta.official !== 'boolean') fail(where, 'official must be true or false');
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log(`${files.length} servers OK.`);
