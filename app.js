/* global Sortable, PLACES */
(() => {
  'use strict';

  const STORAGE_KEY = 'europe-tierlist:v1';
  const TIERS = [
    { key: 'S', color: '#ff7f7e' },
    { key: 'A', color: '#ffbf7f' },
    { key: 'B', color: '#ffdf80' },
    { key: 'C', color: '#7fff7f' },
    { key: 'D', color: '#7fbfff' },
    { key: 'F', color: '#bf7fbf' },
  ];
  const TIER_KEYS = TIERS.map(t => t.key);

  const placesById = new Map(PLACES.map(p => [p.id, p]));
  const countryHue = new Map(
    [...new Set(PLACES.map(p => p.country))].map((c, i) => [c, (i * 137) % 360])
  );

  let state = loadState();
  let activeTab = 0; // 0 | 1 | 'compare'
  let sortables = [];

  // ---------- Estado ----------

  function emptyTiers() {
    return Object.fromEntries(TIER_KEYS.map(k => [k, []]));
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function defaultState() {
    return {
      profiles: [
        { name: 'Gustavo', tiers: emptyTiers() },
        { name: 'Caroline', tiers: emptyTiers() },
      ],
      poolOrder: shuffle(PLACES.map(p => p.id)),
    };
  }

  // Valida e normaliza um estado vindo do localStorage ou de um import.
  function sanitizeState(raw) {
    if (!raw || !Array.isArray(raw.profiles) || raw.profiles.length !== 2) return null;
    const profiles = raw.profiles.map((p, i) => {
      const tiers = emptyTiers();
      const seen = new Set();
      for (const key of TIER_KEYS) {
        const ids = Array.isArray(p?.tiers?.[key]) ? p.tiers[key] : [];
        for (const id of ids) {
          if (placesById.has(id) && !seen.has(id)) {
            seen.add(id);
            tiers[key].push(id);
          }
        }
      }
      return { name: String(p?.name || (i === 0 ? 'Gustavo' : 'Caroline')).slice(0, 40), tiers };
    });
    const poolOrder = (Array.isArray(raw.poolOrder) ? raw.poolOrder : []).filter(
      (id, i, a) => placesById.has(id) && a.indexOf(id) === i
    );
    // Locais novos (adicionados depois) entram no fim, embaralhados.
    const known = new Set(poolOrder);
    const missing = shuffle(PLACES.map(p => p.id).filter(id => !known.has(id)));
    return { profiles, poolOrder: [...poolOrder, ...missing] };
  }

  function loadState() {
    try {
      const parsed = sanitizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
      if (parsed) return parsed;
    } catch { /* estado corrompido → recomeça */ }
    const fresh = defaultState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function rankedIds(profile) {
    return new Set(TIER_KEYS.flatMap(k => profile.tiers[k]));
  }

  function rankedCount(profile) {
    return TIER_KEYS.reduce((n, k) => n + profile.tiers[k].length, 0);
  }

  function tierIndexMap(profile) {
    const map = new Map();
    TIER_KEYS.forEach((k, i) => profile.tiers[k].forEach(id => map.set(id, i)));
    return map;
  }

  // ---------- Cards ----------

  function cardEl(id) {
    const place = placesById.get(id);
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = id;
    el.style.setProperty('--hue', countryHue.get(place.country));
    el.title = `${place.name} (${place.country})`;

    const img = document.createElement('img');
    img.src = `images/${id}.jpg`;
    img.alt = '';
    img.draggable = false;
    img.onerror = () => { img.remove(); el.classList.add('no-img'); };
    el.appendChild(img);

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `${place.flag} ${place.name}`;
    el.appendChild(label);
    return el;
  }

  // ---------- Board (perfil ativo) ----------

  function renderBoard(profileIdx) {
    const view = document.getElementById('view');
    view.innerHTML = '';
    destroySortables();

    const profile = state.profiles[profileIdx];
    const board = document.createElement('div');

    for (const tier of TIERS) {
      const row = document.createElement('div');
      row.className = 'tier-row';
      const label = document.createElement('div');
      label.className = 'tier-label';
      label.style.background = tier.color;
      label.textContent = tier.key;
      const drop = document.createElement('div');
      drop.className = 'tier-drop';
      drop.dataset.tier = tier.key;
      for (const id of profile.tiers[tier.key]) drop.appendChild(cardEl(id));
      row.append(label, drop);
      board.appendChild(row);
    }
    view.appendChild(board);

    const poolSection = document.createElement('section');
    poolSection.className = 'pool-section';
    const h2 = document.createElement('h2');
    const pool = document.createElement('div');
    pool.className = 'pool';
    pool.dataset.pool = '1';
    const ranked = rankedIds(profile);
    const poolIds = state.poolOrder.filter(id => !ranked.has(id));
    h2.textContent = `Não rankeados (${poolIds.length})`;
    for (const id of poolIds) pool.appendChild(cardEl(id));
    poolSection.append(h2, pool);
    view.appendChild(poolSection);

    for (const zone of view.querySelectorAll('.tier-drop, .pool')) {
      sortables.push(
        new Sortable(zone, {
          group: 'tierlist',
          animation: 150,
          onEnd: () => syncFromDom(profileIdx),
        })
      );
    }
  }

  function destroySortables() {
    for (const s of sortables) s.destroy();
    sortables = [];
  }

  // Depois de cada drop, o DOM é a fonte da verdade: relê tiers e ordem do pool.
  function syncFromDom(profileIdx) {
    const view = document.getElementById('view');
    const profile = state.profiles[profileIdx];
    for (const zone of view.querySelectorAll('.tier-drop')) {
      profile.tiers[zone.dataset.tier] = [...zone.children].map(el => el.dataset.id);
    }
    const poolZone = view.querySelector('.pool');
    const poolIds = [...poolZone.children].map(el => el.dataset.id);
    const inPool = new Set(poolIds);
    // Mantém a ordem visível do pool; ids rankeados preservam a ordem anterior no fim.
    state.poolOrder = [...poolIds, ...state.poolOrder.filter(id => !inPool.has(id))];
    save();
    const h2 = view.querySelector('.pool-section h2');
    h2.textContent = `Não rankeados (${poolIds.length})`;
  }

  // ---------- Comparação ----------

  function miniBoard(tiers) {
    const board = document.createElement('div');
    board.className = 'mini';
    for (const tier of TIERS) {
      const row = document.createElement('div');
      row.className = 'tier-row';
      const label = document.createElement('div');
      label.className = 'tier-label';
      label.style.background = tier.color;
      label.textContent = tier.key;
      const drop = document.createElement('div');
      drop.className = 'tier-drop';
      for (const id of tiers[tier.key]) drop.appendChild(cardEl(id));
      row.append(label, drop);
      board.appendChild(row);
    }
    return board;
  }

  function tierBadge(tierIdx) {
    const badge = document.createElement('span');
    badge.className = 'tier-badge';
    badge.style.background = TIERS[tierIdx].color;
    badge.textContent = TIER_KEYS[tierIdx];
    return badge;
  }

  function renderCompare() {
    const view = document.getElementById('view');
    view.innerHTML = '';
    destroySortables();

    const [p0, p1] = state.profiles;
    const idx0 = tierIndexMap(p0);
    const idx1 = tierIndexMap(p1);

    const counts = document.createElement('p');
    counts.className = 'compare-counts';
    counts.textContent =
      `Ainda não rankeados — ${p0.name}: ${PLACES.length - idx0.size} · ` +
      `${p1.name}: ${PLACES.length - idx1.size}`;
    view.appendChild(counts);

    // 1. Lado a lado
    const columns = document.createElement('div');
    columns.className = 'compare-columns';
    for (const p of [p0, p1]) {
      const col = document.createElement('div');
      const h2 = document.createElement('h2');
      h2.textContent = p.name;
      col.append(h2, miniBoard(p.tiers));
      columns.appendChild(col);
    }
    view.appendChild(columns);

    // 2. Discordâncias
    const both = [...idx0.keys()].filter(id => idx1.has(id));
    const disagreements = both
      .map(id => ({ id, a: idx0.get(id), b: idx1.get(id), diff: Math.abs(idx0.get(id) - idx1.get(id)) }))
      .filter(d => d.diff >= 1)
      .sort((x, y) => y.diff - x.diff);

    const disSection = document.createElement('section');
    disSection.className = 'compare-section';
    const disH2 = document.createElement('h2');
    disH2.textContent = 'Maiores discordâncias';
    disSection.appendChild(disH2);
    if (!disagreements.length) {
      const note = document.createElement('p');
      note.className = 'empty-note';
      note.textContent = both.length
        ? 'Nenhuma discordância — vocês concordam em tudo! 🎉'
        : 'Nenhum local rankeado pelos dois ainda.';
      disSection.appendChild(note);
    } else {
      const list = document.createElement('div');
      list.className = 'disagreements';
      for (const d of disagreements) {
        const row = document.createElement('div');
        row.className = 'disagreement' + (d.diff >= 2 ? ' strong' : '');
        row.appendChild(cardEl(d.id));
        row.classList.add('mini');
        const vs = document.createElement('div');
        vs.className = 'vs';
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.textContent = '↔';
        vs.append(tierBadge(d.a), arrow, tierBadge(d.b));
        const who = document.createElement('div');
        who.className = 'who';
        who.textContent = `${p0.name}: ${TIER_KEYS[d.a]} · ${p1.name}: ${TIER_KEYS[d.b]}`;
        row.append(vs, who);
        list.appendChild(row);
      }
      disSection.appendChild(list);
    }
    view.appendChild(disSection);

    // 3. Tierlist do casal (média arredondada, só locais rankeados pelos dois)
    const coupleTiers = emptyTiers();
    for (const id of both) {
      const avg = Math.round((idx0.get(id) + idx1.get(id)) / 2);
      coupleTiers[TIER_KEYS[avg]].push(id);
    }
    const coupleSection = document.createElement('section');
    coupleSection.className = 'compare-section';
    const coupleH2 = document.createElement('h2');
    coupleH2.textContent = `Tierlist do casal (${both.length} locais rankeados pelos dois)`;
    coupleSection.append(coupleH2, miniBoard(coupleTiers));
    view.appendChild(coupleSection);
  }

  // ---------- Header / abas ----------

  function renderTabs() {
    const tabs = document.getElementById('tabs');
    tabs.innerHTML = '';
    state.profiles.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (activeTab === i ? ' active' : '');
      btn.textContent = p.name;
      btn.addEventListener('click', () => { if (activeTab !== i) { activeTab = i; render(); } });
      btn.addEventListener('dblclick', () => startRename(btn, i));
      tabs.appendChild(btn);
    });
    const cmp = document.createElement('button');
    cmp.className = 'tab' + (activeTab === 'compare' ? ' active' : '');
    cmp.textContent = 'Comparação';
    cmp.addEventListener('click', () => { if (activeTab !== 'compare') { activeTab = 'compare'; render(); } });
    tabs.appendChild(cmp);
  }

  function startRename(btn, profileIdx) {
    const input = document.createElement('input');
    input.value = state.profiles[profileIdx].name;
    input.maxLength = 40;
    btn.textContent = '';
    btn.appendChild(input);
    input.focus();
    input.select();
    const commit = () => {
      const name = input.value.trim();
      if (name) state.profiles[profileIdx].name = name;
      save();
      render();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = state.profiles[profileIdx].name; input.blur(); }
    });
  }

  function render() {
    renderTabs();
    if (activeTab === 'compare') renderCompare();
    else renderBoard(activeTab);
  }

  // ---------- Exportar / Importar / Resetar ----------

  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'europe-tierlist.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const importFile = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    importFile.value = '';
    if (!file) return;
    try {
      const incoming = sanitizeState(JSON.parse(await file.text()));
      if (!incoming) throw new Error('estrutura inválida');
      const hasLocal = state.profiles.some(p => rankedCount(p) > 0);
      if (
        hasLocal &&
        confirm(
          'Mesclar com as tierlists atuais?\n\n' +
            'OK = mesclar: para cada perfil, vale a versão com mais locais rankeados ' +
            '(ideal para importar a tierlist da outra pessoa sem perder a sua).\n' +
            'Cancelar = substituir tudo pelo arquivo.'
        )
      ) {
        state.profiles = state.profiles.map((local, i) =>
          rankedCount(incoming.profiles[i]) > rankedCount(local) ? incoming.profiles[i] : local
        );
      } else {
        state = incoming;
      }
      save();
      activeTab = 0;
      render();
    } catch (err) {
      alert(`Não foi possível importar: ${err.message}`);
    }
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Apagar as duas tierlists e recomeçar do zero?')) return;
    state = defaultState();
    save();
    activeTab = 0;
    render();
  });

  render();
})();
