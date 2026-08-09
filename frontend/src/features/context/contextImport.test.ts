import { describe, expect, it } from 'vitest';
import { numeric, parseContextFile } from './contextImport';

describe('context import', () => {
  it('parses CSV with quoted values', () => {
    expect(parseContextFile('time,value,label\n100,3.5,"screen, main"')).toEqual([{ time: '100', value: '3.5', label: 'screen, main' }]);
  });
  it('parses JSONL and rejects non numeric mappings', () => {
    expect(parseContextFile('{"t":1,"v":2}\n{"t":2,"v":3}')).toHaveLength(2);
    expect(() => numeric('bad', 'v')).toThrow('coluna v');
  });
});
