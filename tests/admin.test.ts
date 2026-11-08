import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyEdit, applyEdits, type Edit } from '../scripts/admin-plugin';
import { ARMOUR, CHASSIS, DEFENSES, ENGINES, MELEE, POWER_SOURCES, WHEELS } from '../src/sim/data';

const source = readFileSync(new URL('../src/sim/data.ts', import.meta.url), 'utf8');
const lineOf = (text: string, start: string) => text.split(/\r?\n/).find((l) => l.trimStart().startsWith(start))!;

const TABLES = { CHASSIS, WHEELS, ENGINES, POWER_SOURCES, MELEE, DEFENSES } as const;

describe('parts editor', () => {
  it('finds every number and option already in the file, and leaves it alone when nothing changes', () => {
    const edits: Edit[] = [];
    for (const [table, rows] of Object.entries(TABLES)) {
      for (const [id, row] of Object.entries(rows)) {
        const line = lineOf(source, `${id}: `);
        for (const [field, value] of Object.entries(row)) {
          if ((typeof value === 'number' || typeof value === 'boolean') && new RegExp(`[{,] ${field}: `).test(line)) edits.push({ table: table as Edit['table'], id, field, value });
        }
      }
    }
    for (const [field, value] of Object.entries(ARMOUR)) edits.push({ table: 'ARMOUR', field, value });
    expect(edits.length).toBeGreaterThan(300);
    expect(applyEdits(source, edits)).toBe(source);
  });

  it('changes a value, adds a missing one, and takes one out', () => {
    const after = applyEdits(source, [
      { table: 'MELEE', id: 'drill', field: 'damage', value: 50 },
      { table: 'MELEE', id: 'chainsaw', field: 'pierce', value: 0.1 },
      { table: 'MELEE', id: 'dagger', field: 'passive', value: null },
      { table: 'ARMOUR', field: 'max', value: 175 },
    ]);
    expect(lineOf(after, 'drill: ')).toContain('damage: 50,');
    expect(lineOf(after, 'chainsaw: ')).toMatch(/damage: 28, pierce: 0.1 }\),$/);
    expect(lineOf(after, 'dagger: ')).not.toContain('passive');
    expect(lineOf(after, 'dagger: ')).toContain('damage: 22, pierce: 0.2');
    expect(lineOf(after, 'export const ARMOUR =')).toContain('max: 175,');
    // Only those lines changed.
    const diff = after.split('\n').filter((line, i) => line !== source.split('\n')[i]);
    expect(diff).toHaveLength(4);
  });

  it('only touches the part it was asked to, in the table it was asked to', () => {
    // Every table has a price, and the Force Field and Chainsaw are both free.
    const after = applyEdits(source, [{ table: 'DEFENSES', id: 'shield', field: 'price', value: 5 }]);
    expect(lineOf(after, 'shield: ')).toContain('price: 5,');
    expect(lineOf(after, 'chainsaw: ')).toContain('price: 0,');
  });

  it("never mistakes words in a blurb for a field", () => {
    const line = "  x: { name: 'A', blurb: 'Big, damage: 9 here', damage: 3 },";
    expect(applyEdit(line, 'damage', 4)).toBe("  x: { name: 'A', blurb: 'Big, damage: 9 here', damage: 4 },");
    expect(applyEdit(line, 'damage', null)).toBe("  x: { name: 'A', blurb: 'Big, damage: 9 here' },");
  });

  it('refuses text fields, odd field names, unknown parts and bad numbers', () => {
    expect(() => applyEdits(source, [{ table: 'MELEE', id: 'drill', field: 'name', value: 1 }])).toThrow();
    expect(() => applyEdits(source, [{ table: 'MELEE', id: 'drill', field: 'x: 1, y', value: 1 }])).toThrow();
    expect(() => applyEdits(source, [{ table: 'MELEE', id: 'nope', field: 'damage', value: 1 }])).toThrow();
    expect(() => applyEdits(source, [{ table: 'MELEE', id: 'drill', field: 'damage', value: Number.NaN }])).toThrow();
    expect(() => applyEdits(source, [{ table: 'MATCH' as Edit['table'], field: 'killTarget', value: 1 }])).toThrow();
  });
});
