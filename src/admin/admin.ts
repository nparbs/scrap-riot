// The parts editor, at /admin.html on the dev server only. Edits change the tables in memory, so the
// worked-out columns use the game's own sums, and Save writes them into src/sim/data.ts.
import {
  ARMOUR,
  batteryCost,
  buildProblem,
  buildStats,
  CHASSIS,
  classFor,
  DEFENSES,
  ENGINES,
  MELEE,
  payloadUsed,
  pointsUsed,
  POINT_BUDGET,
  POWER_SOURCES,
  WHEELS,
  type MeleeDef,
  type MeleeId,
  type PartsChoice,
} from '../sim/data';
import type { Edit, TableName } from '../../scripts/admin-plugin';

type Value = number | boolean | undefined;
type Row = Record<string, unknown>;

interface Derived {
  label: string;
  title: string;
  value: (id: string) => string;
}

interface Table {
  name: TableName;
  label: string;
  /** Keyed by part, or one object for a table like ARMOUR. */
  rows: Record<string, Row>;
  single?: boolean;
  derived?: Derived[];
}

const stock = (over: Partial<PartsChoice> = {}): PartsChoice => ({ chassis: 'brawler', melee: 'chainsaw', defense: 'shield', ...over });
const fits = (build: PartsChoice) => {
  const problem = buildProblem(build);
  return `${pointsUsed(build)} pts, ${payloadUsed(build)}/${CHASSIS[build.chassis].payload} kg${problem ? ` · too much ${problem}` : ''}`;
};
const speedOf = (build: PartsChoice) => buildStats(build).speed.toFixed(1);

const TABLES: Table[] = [
  {
    name: 'MELEE', label: 'Main weapons', rows: MELEE as unknown as Record<string, Row>,
    derived: [
      { label: 'Battery', title: 'Share of a basic battery per hit, per spin-up, or per second for held weapons', value: (id) => `${Math.round(batteryCost(MELEE[id as MeleeId] as MeleeDef) * 100)}%` },
      { label: 'Stock build', title: 'On the chassis it belongs on, with the free parts and default armor', value: (id) => `${CHASSIS[classFor(id as MeleeId)].name}: ${fits(stock({ chassis: classFor(id as MeleeId), melee: id as MeleeId }))}` },
    ],
  },
  {
    name: 'DEFENSES', label: 'Secondary weapons', rows: DEFENSES as unknown as Record<string, Row>,
    derived: [{ label: 'Stock build', title: 'On a Bruiser with a Chainsaw and the free parts', value: (id) => fits(stock({ defense: id as PartsChoice['defense'] })) }],
  },
  {
    name: 'CHASSIS', label: 'Chassis', rows: CHASSIS as unknown as Record<string, Row>,
    derived: [
      { label: 'Speed', title: 'Top speed with a Chainsaw, Force Field and the free parts', value: (id) => speedOf(stock({ chassis: id as PartsChoice['chassis'] })) },
      { label: 'Stock build', title: 'With a Chainsaw, Force Field and the free parts', value: (id) => fits(stock({ chassis: id as PartsChoice['chassis'] })) },
    ],
  },
  {
    name: 'WHEELS', label: 'Wheels', rows: WHEELS as unknown as Record<string, Row>,
    derived: [{ label: 'Speed', title: 'Top speed on a stock Bruiser', value: (id) => speedOf(stock({ wheels: id as PartsChoice['wheels'] })) }],
  },
  {
    name: 'ENGINES', label: 'Engines', rows: ENGINES as unknown as Record<string, Row>,
    derived: [{ label: 'Speed', title: 'Top speed on a stock Bruiser', value: (id) => speedOf(stock({ engine: id as PartsChoice['engine'] })) }],
  },
  { name: 'POWER_SOURCES', label: 'Power sources', rows: POWER_SOURCES as unknown as Record<string, Row> },
  { name: 'ARMOUR', label: 'Armor', rows: { armour: ARMOUR as unknown as Row }, single: true },
];

/** What a column means, where the name alone isn't clear. */
const HINTS: Record<string, string> = {
  price: 'Cost in the shop, in $',
  points: `Out of the ${POINT_BUDGET} points every robot gets`,
  weight: 'kg, carried out of the chassis payload',
  hp: 'Health',
  payload: 'kg it can carry',
  turn: 'Turn rate, or a multiplier on parts',
  radius: 'Size, for hits and collisions',
  speed: 'Multiplies top speed',
  accel: 'Multiplies acceleration',
  mass: 'Multiplies how hard it is to shove',
  power: 'Engine power against the robot\'s weight',
  regen: 'Multiplies how fast the battery recharges',
  capacity: 'Multiplies how much the battery holds',
  restart: 'How far a flat battery recharges before things work again',
  range: 'Reach',
  arc: 'Half-angle of the hit cone, in radians',
  damage: 'Per strike, or per second for held weapons. For plates, the share of damage let through',
  cooldown: 'Seconds before it can be used again',
  windup: 'Before a strike lands, spin-up time, or how long a grabber holds',
  stun: 'Seconds',
  knockback: 'How hard it throws',
  slow: 'Seconds of slowdown',
  launch: 'Seconds in the air',
  saw: 'Hammer saw blade damage per second',
  pierce: 'Share of each hit that goes through armor, 0 to 1',
  powerUse: 'Multiplies battery use, 0 for no motor',
  missReload: 'Reload after a miss',
  chain: 'Jumps to another robot within this distance',
  runTime: 'Seconds a held weapon runs before it cools down',
  battery: 'Share of a basic battery each use takes',
  duration: 'Seconds it lasts',
  min: 'Least armor', max: 'Most armor', step: 'Armor per click', default: 'Armor on a new robot',
  pointsPerStep: 'Points per step of armor', weightPerStep: 'kg per step of armor', wear: 'Armor lost per point of damage',
};

/** The values as the page loaded them, which is what's in the file. */
const original = new Map<string, Value>();
const key = (table: TableName, id: string, field: string) => `${table}|${id}|${field}`;

function columns(table: Table): { field: string; required: boolean; kind: 'number' | 'boolean' }[] {
  const rows = Object.values(table.rows);
  const seen = new Map<string, 'number' | 'boolean'>();
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if ((typeof value === 'number' || typeof value === 'boolean') && !seen.has(field)) seen.set(field, typeof value as 'number' | 'boolean');
    }
  }
  return [...seen].map(([field, kind]) => ({ field, kind, required: kind === 'number' && rows.every((row) => typeof row[field] === 'number') }));
}

for (const table of TABLES) {
  for (const [id, row] of Object.entries(table.rows)) {
    for (const { field } of columns(table)) original.set(key(table.name, id, field), row[field] as Value);
  }
}

let current = TABLES[0].name;
/** Set once a save goes through, so the reload after it doesn't ask about unsaved changes. */
let saved = false;
let message = sessionStorage.getItem('admin-message') ?? '';
sessionStorage.removeItem('admin-message');

function edits(): Edit[] {
  const out: Edit[] = [];
  for (const table of TABLES) {
    for (const [id, row] of Object.entries(table.rows)) {
      for (const { field, kind } of columns(table)) {
        const before = original.get(key(table.name, id, field));
        const now = row[field] as Value;
        if (now === before) continue;
        // An unticked option comes out of the file, rather than sitting there as false.
        const value = now === undefined || (kind === 'boolean' && now === false) ? null : now;
        out.push({ table: table.name, id: table.single ? undefined : id, field, value });
      }
    }
  }
  return out;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function render(): void {
  const table = TABLES.find((t) => t.name === current)!;
  const cols = columns(table);
  const head = `<tr><th class="name-col">Part</th>${cols.map((c) => `<th title="${escape(HINTS[c.field] ?? '')}">${c.field}</th>`).join('')}${(table.derived ?? []).map((d) => `<th class="derived" title="${escape(d.title)}">${d.label}</th>`).join('')}</tr>`;
  const body = Object.entries(table.rows).map(([id, row]) => {
    const cells = cols.map((c) => {
      const value = row[c.field] as Value;
      const attrs = `data-id="${id}" data-field="${c.field}" data-kind="${c.kind}"${c.required ? ' data-required' : ''}`;
      const input = c.kind === 'boolean'
        ? `<input type="checkbox" ${attrs} ${value ? 'checked' : ''} />`
        : `<input type="number" step="any" ${attrs} value="${value ?? ''}" placeholder="${c.required ? '' : '—'}" />`;
      return `<td>${input}</td>`;
    }).join('');
    const name = typeof row.name === 'string' ? row.name : table.label;
    const derived = (table.derived ?? []).map((_, i) => `<td class="derived" data-derived="${i}" data-id="${id}"></td>`).join('');
    return `<tr><th class="name-col" scope="row">${escape(name)}<small>${id}</small></th>${cells}${derived}</tr>`;
  }).join('');
  document.querySelector('#admin')!.innerHTML = `
    <header>
      <h1>Parts Editor</h1>
      <p>Changes save into <code>src/sim/data.ts</code>. They reach players when you ship, and online matches use them once the server is deployed too.</p>
      <div class="actions"></div>
    </header>
    <div class="message" role="status"></div>
    <nav></nav>
    <div class="scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <p class="hint">Hover a column name for what it means. Blank optional fields fall back to the default. The worked-out columns on the right use your unsaved values. Ctrl+S saves.</p>`;
  refresh();
}

/** Everything that follows from the values, without redrawing the inputs, so typing and tabbing carry on. */
function refresh(): void {
  const table = TABLES.find((t) => t.name === current)!;
  const pending = edits();
  const changedIn = (t: Table) => pending.filter((e) => e.table === t.name).length;
  document.querySelector('.actions')!.innerHTML = `
    <a href="/" target="_blank" rel="noopener">Open the game</a>
    <button data-revert ${pending.length ? '' : 'disabled'}>Revert</button>
    <button class="save" data-save ${pending.length ? '' : 'disabled'}>${pending.length ? `Save ${pending.length} change${pending.length === 1 ? '' : 's'}` : 'No changes'}</button>`;
  const note = document.querySelector<HTMLElement>('.message')!;
  note.textContent = message;
  note.hidden = !message;
  document.querySelector('nav')!.innerHTML = TABLES.map((t) => `<button data-table="${t.name}" class="${t.name === current ? 'on' : ''}">${t.label}${changedIn(t) ? ` <b>${changedIn(t)}</b>` : ''}</button>`).join('');
  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-field]')) {
    const { id, field } = input.dataset as { id: string; field: string };
    input.parentElement!.classList.toggle('changed', table.rows[id][field] !== original.get(key(table.name, id, field)));
  }
  for (const cell of document.querySelectorAll<HTMLElement>('td[data-derived]')) {
    cell.textContent = table.derived![Number(cell.dataset.derived)].value(cell.dataset.id!);
  }
}

function setValue(input: HTMLInputElement): void {
  const table = TABLES.find((t) => t.name === current)!;
  const { id, field, kind } = input.dataset as { id: string; field: string; kind: string };
  const row = table.rows[id];
  if (kind === 'boolean') row[field] = input.checked;
  else if (input.value.trim() === '') {
    if (input.dataset.required !== undefined) return;
    delete row[field];
  } else {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    row[field] = value;
  }
  message = '';
  refresh();
}

function revert(): void {
  for (const table of TABLES) {
    for (const [id, row] of Object.entries(table.rows)) {
      for (const { field } of columns(table)) {
        const before = original.get(key(table.name, id, field));
        if (before === undefined) delete row[field];
        else row[field] = before;
      }
    }
  }
  message = '';
  render();
}

async function save(): Promise<void> {
  const pending = edits();
  if (!pending.length) return;
  const response = await fetch('/__admin/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edits: pending }) }).catch(() => null);
  const result = response ? ((await response.json().catch(() => ({}))) as { saved?: number; error?: string }) : { error: 'The dev server isn\'t running.' };
  if (!response?.ok) {
    message = `Not saved: ${result.error ?? 'unknown error'}`;
    refresh();
    return;
  }
  sessionStorage.setItem('admin-message', `Saved ${pending.length} change${pending.length === 1 ? '' : 's'}. Run npm test before you ship, since some tests check balance numbers.`);
  saved = true;
  // The dev server reloads the page when data.ts changes, and this covers it if it doesn't.
  setTimeout(() => location.reload(), 1500);
}

document.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.matches('input[data-field]')) setValue(input);
});
document.addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest('button');
  if (!button) return;
  if (button.dataset.table) { current = button.dataset.table as TableName; render(); }
  else if (button.dataset.save !== undefined) void save();
  else if (button.dataset.revert !== undefined) revert();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    (document.activeElement as HTMLInputElement | null)?.blur();
    void save();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (!saved && edits().length) e.preventDefault();
});

render();
