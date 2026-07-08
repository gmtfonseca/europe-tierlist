# Europe Tierlist — Site pessoal de ranking de locais

## Contexto

Gustavo e a esposa visitaram ~120 locais em 14 países da Europa (listados em `places.MD`) e querem rankeá-los em uma tierlist. Em vez de usar um site pronto (tiermaker etc.), o objetivo é um site próprio que:

1. Busque automaticamente uma imagem representativa de cada local (via Wikipedia).
2. Mostre o nome sobreposto na imagem (faixa com gradiente escuro na base do card).
3. Permita que **cada um monte sua própria tierlist** (dois perfis) e depois veja uma **comparação lado a lado com destaques de discordância + tierlist média do casal**.

Decisões confirmadas com o usuário:
- Tiers clássicos **S, A, B, C, D, F** (cores clássicas de tiermaker).
- Pool de não-rankeados em **lista única embaralhada** (sem agrupamento por país).
- **Site estático local**, progresso salvo em `localStorage`, com exportar/importar JSON.
- Imagens buscadas por **script da Wikipedia** (uma vez, salvas no repo; substituíveis manualmente).

## Stack

Site estático **sem build**: `index.html` + CSS + JS vanilla + [SortableJS](https://github.com/SortableJS/Sortable) vendorado (arquivo único em `vendor/Sortable.min.js`, para drag-and-drop entre listas — funciona offline). Scripts de dados em **Node.js sem dependências** (usa `https` nativo). Serve com `python3 -m http.server` ou `npx serve`; deployável em GitHub Pages depois sem mudanças.

## Estrutura de arquivos

```
europe-tierlist/
├── places.MD                  # fonte (já existe)
├── scripts/
│   ├── build-data.mjs         # parseia places.MD → data/places.json
│   ├── wiki-overrides.json    # nome do local → título exato na Wikipedia (desambiguação)
│   └── fetch-images.mjs       # baixa thumbnail da Wikipedia p/ cada local → images/<slug>.jpg
├── data/
│   └── places.js              # gerado: window.PLACES = [{id, name, country, flag}] (JS, não JSON, p/ funcionar via file://)
├── images/                    # <slug>.jpg (~640px de largura)
├── vendor/
│   └── Sortable.min.js
├── index.html
├── styles.css
└── app.js
```

## Etapa 1 — Dados (`scripts/build-data.mjs`)

- Parseia `places.MD`: linhas de país são os cabeçalhos (França, Holanda, ...), linhas seguintes são locais.
- Gera `data/places.js` com `window.PLACES = [{ id: "etretat", name: "Étretat", country: "França", flag: "🇫🇷" }, ...]`. `id` = slug do nome (sem acentos/espaços). Mapa fixo país → emoji de bandeira no script.
- Usar `.js` com variável global em vez de `.json` + fetch para o site abrir até via `file://`.

## Etapa 2 — Imagens (`scripts/fetch-images.mjs`)

- Para cada local, resolve o título da Wikipedia: primeiro consulta `scripts/wiki-overrides.json` (mapa manual), senão tenta a API de busca da Wikipedia em pt (fallback en) com `"<nome> <país>"`.
- Baixa o thumbnail via REST API (`/api/rest_v1/page/summary/<título>` → `thumbnail.source`, ajustando a URL para ~640px) e salva em `images/<slug>.jpg`.
- **Pré-preencher `wiki-overrides.json`** com os casos ambíguos óbvios: De Pier (→ Scheveningen Pier), Haia, Suíça Saxônica, Blankenese/Othmarschen/Altona/Reeperbahn/Wedel (bairros de Hamburgo), Auschwitz I / Auschwitz II (Birkenau), Castelo de Devín, Lago Alpsee, Phantasialand, Trümmelbachfälle, Männlichen, etc.
- Ao final imprime relatório: locais sem imagem encontrada (para ajuste manual do override e re-execução). O script pula imagens já baixadas, então trocar uma foto manualmente = sobrescrever o arquivo `images/<slug>.jpg`.

## Etapa 3 — O site (`index.html`, `styles.css`, `app.js`)

**Layout:**
- Header: título + abas de perfil (dois perfis com nomes editáveis, padrão "Gustavo" e "Esposa" — clique duplo renomeia) + aba "Comparação" + botões Exportar/Importar JSON e Resetar.
- Board: 6 linhas de tier (S vermelho `#ff7f7e`, A laranja `#ffbf7f`, B amarelo `#ffdf80`, C verde `#7fff7f`, D azul `#7fbfff`, F roxo `#bf7fbf`), rótulo colorido à esquerda, área de drop que quebra linha à direita.
- Pool "Não rankeados" abaixo, grid com todos os cards em **ordem embaralhada** (embaralha no primeiro uso e persiste a ordem no estado, para ficar estável entre reloads).

**Card:** ~110×110px, imagem de fundo `cover`, gradiente escuro na base com o nome em branco + emoji da bandeira. Fallback sem imagem: fundo colorido pelo país com o nome centralizado.

**Drag-and-drop:** SortableJS com `group` compartilhado entre os 6 tiers e o pool; salva estado a cada drop.

**Estado (`localStorage`, chave `europe-tierlist:v1`):**
```json
{
  "profiles": [
    { "name": "Gustavo", "tiers": { "S": ["roma"], "A": [], "B": [], "C": [], "D": [], "F": [] } },
    { "name": "Esposa",  "tiers": { ... } }
  ],
  "poolOrder": ["id1", "id2", ...]
}
```
- Locais não presentes em nenhum tier do perfil ativo ficam no pool (deriva-se, não se armazena o pool por perfil).
- Exportar = download desse JSON; Importar = file input que valida e substitui.

## Etapa 4 — Visão de comparação

Aba read-only que mostra:
1. **As duas tierlists lado a lado** (duas colunas, mesma escala de cards menores ~70px).
2. **Maiores discordâncias:** lista de locais rankeados por ambos, ordenada por `|tierIndex_A − tierIndex_B|` (≥ 2 tiers de diferença = destaque), mostrando card + "S ↔ C".
3. **Tierlist do casal:** média arredondada dos índices de tier (só locais rankeados pelos dois).
4. Contador de locais ainda não rankeados por cada um.

## Verificação

1. `node scripts/build-data.mjs` → conferir que `data/places.js` tem ~120 locais e 14 países corretos.
2. `node scripts/fetch-images.mjs` → conferir relatório; meta: ≥ 95% dos locais com imagem; ajustar `wiki-overrides.json` para os que faltarem e re-rodar.
3. `python3 -m http.server` + abrir no navegador: arrastar cards para tiers, recarregar a página e confirmar persistência; trocar de perfil e confirmar rankings independentes; renomear perfil.
4. Ranquear alguns locais nos dois perfis com diferenças propositais → abrir Comparação e conferir lado a lado, destaques de discordância e tierlist média.
5. Exportar JSON, resetar, importar de volta → estado restaurado.
