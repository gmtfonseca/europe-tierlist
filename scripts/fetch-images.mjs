#!/usr/bin/env node
// Baixa uma imagem representativa para cada local em data/places.js → images/<slug>.jpg
//
// Estratégia, por local:
//   1. Resolve o artigo da Wikipedia: override manual → título direto (pt, depois en) → busca (pt, depois en).
//   2. Prefere a imagem P18 do Wikidata (foto representativa curada — evita brasões, bandeiras,
//      mapas e logos que os artigos pt usam como imagem de capa).
//   3. Senão, usa o thumbnail do resumo, rejeitando nomes de arquivo suspeitos (brasão/flag/map/logo/svg).
//
// Overrides em scripts/wiki-overrides.json: "Nome do local": "Título na Wikipedia" ou "lang:Título".
// Pula imagens já existentes — para trocar uma foto, apague/sobrescreva images/<slug>.jpg e re-rode.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'europe-tierlist/1.0 (personal tierlist site; gfonseca@paciolan.com)';
// upload.wikimedia.org só aceita larguras de bucket pré-geradas; 500px serve p/ cards de 110px em retina.
const THUMB_WIDTH = 500;
const BAD_FILENAME = /coat|arms|wappen|escudo|bras[aã]o|flag|bandeira|logo|locat|position|mapa?[_.\-%]|\.svg/i;

const placesSrc = readFileSync(join(root, 'data', 'places.js'), 'utf8');
const places = JSON.parse(placesSrc.replace(/^window\.PLACES\s*=\s*/, '').replace(/;\s*$/, ''));
const overrides = JSON.parse(readFileSync(join(root, 'scripts', 'wiki-overrides.json'), 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getOnce(url, binary) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, Accept: binary ? '*/*' : 'application/json' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(getOnce(new URL(res.headers.location, url).href, binary));
      }
      if (res.statusCode !== 200) {
        res.resume();
        const err = new Error(`HTTP ${res.statusCode}`);
        err.status = res.statusCode;
        err.retryAfter = Number(res.headers['retry-after']) || null;
        return reject(err);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(binary ? Buffer.concat(chunks) : JSON.parse(Buffer.concat(chunks).toString('utf8'))));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function get(url, { binary = false, tries = 4 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await getOnce(url, binary);
    } catch (err) {
      const retriable = err.status === 429 || err.status >= 500 || err.code === 'ECONNRESET';
      if (!retriable || attempt >= tries) throw err;
      const wait = err.retryAfter ? err.retryAfter * 1000 : attempt * 2000;
      console.log(`  … HTTP ${err.status ?? err.code}, tentando de novo em ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

async function summary(lang, title) {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  try {
    const json = await get(url);
    return json.type === 'standard' ? { lang, title: json.title, json } : null;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function searchTitle(lang, query) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
  const json = await get(url);
  return json?.query?.search?.[0]?.title ?? null;
}

// Artigos candidatos, do mais ao menos confiável.
async function resolvePages(place) {
  const override = overrides[place.name];
  if (override) {
    const m = override.match(/^([a-z]{2}):(.+)$/);
    const page = m ? await summary(m[1], m[2]) : await summary('pt', override);
    return page ? [page] : [];
  }
  const pages = [];
  for (const lang of ['pt', 'en']) {
    const direct = await summary(lang, place.name);
    if (direct) pages.push(direct);
  }
  for (const lang of ['pt', 'en']) {
    const title = await searchTitle(lang, `${place.name} ${place.country}`) ?? await searchTitle(lang, place.name);
    if (title && !pages.some(p => p.lang === lang && p.title === title)) {
      const page = await summary(lang, title);
      if (page) pages.push(page);
    }
  }
  return pages;
}

async function wikidataImage(qid) {
  if (!qid) return null;
  const url = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=P18&format=json`;
  const json = await get(url).catch(() => null);
  const file = json?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file || BAD_FILENAME.test(file)) return null;
  const base = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
  return [`${base}?width=${THUMB_WIDTH}`, base];
}

function summaryThumbs(json) {
  const thumb = json.thumbnail?.source;
  if (!thumb || BAD_FILENAME.test(decodeURIComponent(thumb))) return null;
  const resized = thumb.replace(/\/(\d+)px-/, `/${THUMB_WIDTH}px-`);
  return resized !== thumb ? [resized, thumb] : [thumb];
}

async function download(candidates, dest) {
  for (const src of candidates) {
    try {
      writeFileSync(dest, await get(src, { binary: true }));
      return true;
    } catch (err) {
      if (err.status !== 400 && err.status !== 404) throw err;
    }
  }
  return false;
}

mkdirSync(join(root, 'images'), { recursive: true });
const missing = [];
let downloaded = 0, skipped = 0;

for (const place of places) {
  const dest = join(root, 'images', `${place.id}.jpg`);
  if (existsSync(dest)) { skipped++; continue; }
  try {
    let ok = false;
    for (const page of await resolvePages(place)) {
      const p18 = await wikidataImage(page.json.wikibase_item);
      if (p18 && await download(p18, dest)) {
        console.log(`✓ ${place.name} ← ${page.lang}:${page.title} (wikidata)`);
        ok = true;
        break;
      }
      const thumbs = summaryThumbs(page.json);
      if (thumbs && await download(thumbs, dest)) {
        console.log(`✓ ${place.name} ← ${page.lang}:${page.title} (thumbnail)`);
        ok = true;
        break;
      }
    }
    if (ok) downloaded++;
    else { missing.push(place.name); console.log(`✗ ${place.name}: nenhuma imagem encontrada`); }
  } catch (err) {
    missing.push(place.name);
    console.log(`✗ ${place.name}: ${err.message}`);
  }
  await sleep(150);
}

console.log(`\n${downloaded} baixadas, ${skipped} já existiam, ${missing.length} sem imagem.`);
if (missing.length) {
  console.log('Sem imagem (adicione em scripts/wiki-overrides.json e re-rode):');
  for (const name of missing) console.log(`  - ${name}`);
}
