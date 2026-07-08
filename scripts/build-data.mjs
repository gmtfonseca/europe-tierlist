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

const COUNTRY_EN = {
  'França': 'France',
  'Holanda': 'Netherlands',
  'Bélgica': 'Belgium',
  'Alemanha': 'Germany',
  'República Tcheca': 'Czech Republic',
  'Polônia': 'Poland',
  'Eslováquia': 'Slovakia',
  'Hungria': 'Hungary',
  'Áustria': 'Austria',
  'Eslovênia': 'Slovenia',
  'Itália': 'Italy',
  'Vaticano': 'Vatican City',
  'Suíça': 'Switzerland',
};

// Nomes em inglês quando diferem do português; ausente = mesmo nome.
const EN_NAMES = {
  'Haia': 'The Hague',
  'De Pier': 'Scheveningen Pier',
  'Gante': 'Ghent',
  'Bruxelas': 'Brussels',
  'Colônia': 'Cologne',
  'Hamburgo': 'Hamburg',
  'Berlim': 'Berlin',
  'Suíça Saxônica': 'Saxon Switzerland',
  'Munique': 'Munich',
  'Castelo de Neuschwanstein': 'Neuschwanstein Castle',
  'Castelo de Hohenschwangau': 'Hohenschwangau Castle',
  'Lago Alpsee': 'Lake Alpsee',
  'Praga': 'Prague',
  'Breslávia': 'Wrocław',
  'Cracóvia': 'Kraków',
  'Castelo de Devín': 'Devín Castle',
  'Budapeste': 'Budapest',
  'Viena': 'Vienna',
  'Salzburgo': 'Salzburg',
  'Liubliana': 'Ljubljana',
  'Lago Bled': 'Lake Bled',
  'Pompeia': 'Pompeii',
  'Nápoles': 'Naples',
  'Roma': 'Rome',
  'Milão': 'Milan',
  'Lago de Como': 'Lake Como',
  'Veneza': 'Venice',
  'Florença': 'Florence',
  'Siracusa': 'Syracuse',
  'Vaticano': 'Vatican City',
  'Zurique': 'Zurich',
  'Lucerna': 'Lucerne',
  'Trümmelbachfälle': 'Trümmelbach Falls',
  'Lago Brienz': 'Lake Brienz',
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
  places.push({
    id: slugify(line),
    name: line,
    nameEn: EN_NAMES[line] ?? line,
    country,
    countryEn: COUNTRY_EN[country],
    flag: COUNTRY_FLAGS[country],
  });
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
