// The parts editor's back end. It only exists in the dev server, and writes edits straight into
// src/sim/data.ts, so a change goes live the same way as any other: commit, ship, deploy the server.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const DATA = fileURLToPath(new URL('../src/sim/data.ts', import.meta.url));

/** The tables the editor can change, by the name they're exported as. Every entry sits on one line. */
export const EDITABLE = ['CHASSIS', 'WHEELS', 'ENGINES', 'POWER_SOURCES', 'MELEE', 'DEFENSES', 'ARMOUR'] as const;
export type TableName = (typeof EDITABLE)[number];

export interface Edit {
  table: TableName;
  /** The part's key. Left out for a table that is one object, like ARMOUR. */
  id?: string;
  field: string;
  /** Null takes the field out, so the part goes back to the default. */
  value: number | boolean | null;
}

/** The line with the code on it, with everything inside quotes blanked out, so blurbs can't be mistaken for fields. */
function maskStrings(line: string): string {
  let quote = '';
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') { out += '  '; i++; continue; }
      if (c === quote) quote = '';
      out += quote ? ' ' : c;
    } else {
      if (c === "'" || c === '"' || c === '`') quote = c;
      out += c;
    }
  }
  return out;
}

/** Where a table's entry is: the line itself for a one-object table, otherwise the entry's line inside it. */
function findLine(lines: string[], table: TableName, id?: string): number {
  const start = lines.findIndex((l) => new RegExp(`^export const ${table}\\b`).test(l));
  if (start < 0) throw new Error(`No table ${table}`);
  if (!id) {
    if (!/};\s*$/.test(lines[start])) throw new Error(`${table} isn't on one line`);
    return start;
  }
  for (let i = start + 1; i < lines.length && !/^};/.test(lines[i]); i++) {
    if (new RegExp(`^\\s+${id}: `).test(lines[i])) return i;
  }
  throw new Error(`No ${id} in ${table}`);
}

const FIELD = /^[a-zA-Z]\w*$/;
const NAME_LIKE = new Set(['name', 'blurb', 'type', 'kind', 'role']);

/** One edit, applied to one line. Only number and true/false values are ever touched. */
export function applyEdit(line: string, field: string, value: Edit['value']): string {
  if (!FIELD.test(field) || NAME_LIKE.has(field)) throw new Error(`Can't edit ${field}`);
  if (value !== null && typeof value !== 'boolean' && !Number.isFinite(value)) throw new Error(`${field} needs a number`);
  const masked = maskStrings(line);
  const match = new RegExp(`([,{]\\s*)${field}: (-?[\\d.]+(?:e-?\\d+)?|true|false)(?=\\s*[,}])`).exec(masked);
  if (match) {
    const at = match.index;
    const end = at + match[0].length;
    if (value === null) {
      // Take ", field: 1" with it, or "field: 1, " when it comes first.
      return match[1].startsWith(',') ? line.slice(0, at) + line.slice(end) : line.slice(0, at + match[1].length) + line.slice(end).replace(/^,\s*/, '');
    }
    // The same value stays as it's written, so 3.0 isn't rewritten as 3.
    if (String(value) === match[2] || Number(match[2]) === value) return line;
    return line.slice(0, at) + `${match[1]}${field}: ${value}` + line.slice(end);
  }
  if (value === null) return line;
  const close = masked.lastIndexOf('}');
  if (close < 0) throw new Error('No closing brace');
  return `${line.slice(0, close).trimEnd()}, ${field}: ${value} ${line.slice(close)}`;
}

export function applyEdits(source: string, edits: Edit[]): string {
  const crlf = source.includes('\r\n');
  const lines = source.split(/\r?\n/);
  for (const edit of edits) {
    if (!EDITABLE.includes(edit.table)) throw new Error(`Can't edit ${edit.table}`);
    const i = findLine(lines, edit.table, edit.id);
    lines[i] = applyEdit(lines[i], edit.field, edit.value);
  }
  return lines.join(crlf ? '\r\n' : '\n');
}

export function adminPlugin(): Plugin {
  return {
    name: 'scrap-riot-admin',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__admin/save', (req, res) => {
        const reply = (status: number, body: object) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        // Only this PC, and only the editor's own page, so another site open in the browser can't post here.
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
        if (req.method !== 'POST' || !local || req.headers.origin !== `http://${req.headers.host}`) return reply(403, { error: 'Not allowed' });
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const { edits } = JSON.parse(body) as { edits: Edit[] };
            const before = readFileSync(DATA, 'utf8');
            const after = applyEdits(before, edits);
            if (after !== before) writeFileSync(DATA, after);
            reply(200, { saved: edits.length });
          } catch (error) {
            reply(400, { error: (error as Error).message });
          }
        });
      });
    },
  };
}
