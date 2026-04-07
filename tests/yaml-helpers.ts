/**
 * Minimal YAML frontmatter parser for test mocks.
 * Handles: scalars, quoted strings, arrays (block-style with `  - item`), booleans.
 * NOT a general YAML parser — just enough for our frontmatter schema.
 */
export function parse(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    // Array item: `  - value`
    const arrayMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayMatch && currentKey) {
      if (!currentArray) currentArray = [];
      currentArray.push(arrayMatch[1]!.trim());
      continue;
    }

    // Flush previous array
    if (currentKey && currentArray) {
      result[currentKey] = currentArray;
      currentArray = null;
      currentKey = null;
    }

    // Key-value: `key: value`
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1]!;
    const rawValue = kvMatch[2]!.trim();

    if (rawValue === '') {
      // Start of array or empty value
      currentKey = key;
      currentArray = null;
      continue;
    }

    // Quoted string
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      result[key] = rawValue.slice(1, -1);
      currentKey = null;
      continue;
    }

    // Boolean
    if (rawValue === 'true') { result[key] = true; currentKey = null; continue; }
    if (rawValue === 'false') { result[key] = false; currentKey = null; continue; }

    // Number
    if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      result[key] = Number(rawValue);
      currentKey = null;
      continue;
    }

    // Plain string
    result[key] = rawValue;
    currentKey = null;
  }

  // Flush trailing array
  if (currentKey && currentArray) {
    result[currentKey] = currentArray;
  }

  return result;
}
