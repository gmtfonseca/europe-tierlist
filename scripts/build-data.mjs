#!/usr/bin/env node
// Parseia places.MD e gera data/places.js (window.PLACES = [...]).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const COUNTRY_FLAGS = {
  'França': '🇫🇷',
  'Holanda': '🇳🇱',
  'Bélgica': '🇧🇪',
  'Alemanha': '🇩🇪',
  'República Tcheca': '🇨🇿',
  'Polônia': '🇵🇱',
  'Eslováquia': '🇸🇰',
  'Hungria': '🇭🇺',
  'Áustria': '🇦🇹',
  'Eslovênia': '🇸🇮',
  'Itália': '🇮🇹',
  'Vaticano': '🇻🇦',
  'Suíça': '🇨🇭',
};

export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const lines = readFileSync(join(root, 'places.MD'), 'utf8').split('\n');
const places = [];
let country = null;

for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;
  // Uma linha igual ao país atual é um local homônimo (ex.: Vaticano), não um novo cabeçalho.
  if (COUNTRY_FLAGS[line] && line !== country) {
    country = line;
    continue;
  }
  if (!country) {
    console.error(`Local "${line}" apareceu antes de qualquer país — ignorando.`);
    continue;
  }
  places.push({ id: slugify(line), name: line, country, flag: COUNTRY_FLAGS[country] });
}

const dupes = places.map(p => p.id).filter((id, i, a) => a.indexOf(id) !== i);
if (dupes.length) {
  console.error(`IDs duplicados: ${dupes.join(', ')}`);
  process.exit(1);
}

mkdirSync(join(root, 'data'), { recursive: true });
const body = places.map(p => `  ${JSON.stringify(p)}`).join(',\n');
writeFileSync(join(root, 'data', 'places.js'), `window.PLACES = [\n${body}\n];\n`);

const countries = new Set(places.map(p => p.country));
console.log(`OK: ${places.length} locais em ${countries.size} países → data/places.js`);
