# Retomada no Windows (checkpoint de 2026-10-25)

**Para quem:** a próxima sessão do Claude Code, no Windows do Rafael, e o Rafael na preparação.
**Por que existe:** o Mac reiniciou por falta de memória no meio do trabalho. Tudo que estava só no Mac (trabalho em andamento dos agentes, skill pessoal, memória, briefings) foi salvo no GitHub e nesta pasta.
**Fonte de verdade:** o repositório. Se este arquivo divergir de `docs/roadmap-v2/STATUS.md` ou do `git log`, vale o repositório (D-30).

## 1. Onde está cada coisa

| Ramo | Ponta | O que é | Próximo passo |
| --- | --- | --- | --- |
| `v2/f00` | `a65f733` (este checkpoint), sobre o registro `ddff79a` (candidato `98879db`) | F00: 23 de 25 etapas validadas; E09 aceita por decisão do Rafael (H36, D-32); E19 com a correção 11 esperando validação | Lançar a rodada 10 (seção 4). O CI completo do registro passou (run 40203288208). A rodada NÃO chegou a começar |
| `v2/f01` | `e483a22` | F01: as 22 etapas implementadas, revisor Opus APROVADO com as correções aplicadas, 13 dívidas do G01 pagas, CI verde | Validar a F01 só depois do G00 (o G00 é dependência de entrada das etapas) |
| `v2/f02` | `a643bff` | F02: lote 0 feito (módulos vazios do shared); texto do /progresso atualizado; CI verde | Retomar o lote 1 (seção 5) |
| `trab/f02-1a-e01-rotas-v1` | `7515acc` | Trabalho em andamento da parte 1A, sem portões | Retomar |
| `trab/f02-1b-console-v1` | `69295ef` | idem 1B | Retomar |
| `trab/f02-1c-guardas` | `aab425a` | idem 1C (apagar o `.orig` que entrou por engano) | Retomar |
| `trab/f02-1d-catalogo` | `22c0ad2` | idem 1D | Retomar |
| `trab/f02-1e-e09-fuso` | `6f33324` | idem 1E | Retomar |

Nada foi para a `master`. Merge e push em master continuam só com o Rafael.

## 2. Regras que valem (ler antes de agir)

- `CLAUDE.md` da raiz, seção "Retomada do Roadmap V2" e "Sistema de execução e validação".
- `docs/roadmap-v2/28-execucao-e-validacao.md`, seções 19 (D-31) e 20 (D-32). Resumo da D-32: tela validada numa matriz fixa (320, 390, 1280 px, zoom 200%, três motores); achado fora dela ou instável vira dívida; toda fase pode correr num ramo próprio antes do gate anterior, sem nada na master.
- Regras do Rafael desta semana (estão também em `memoria/`):
  - trabalhar sem parar; mensagens curtas; nunca ficar ocioso esperando um item;
  - laço de revisão e correção com mais de 3 voltas vai para uma trilha paralela, e o desenvolvimento segue;
  - atualizar o /progresso a cada etapa, lote ou rodada;
  - usar agentes em paralelo (Sonnet implementa, Opus revisa), cada um num worktree, com arquivos disjuntos; um integrador junta.
- Pendências do Rafael: `docs/roadmap-v2/pendencias-humanas.md` (H01 a H83). Dívidas: `docs/roadmap-v2/dividas.md` (DV-01 a DV-45).

## 3. Preparar o Windows (uma vez)

1. **Git e clone.** Se ainda não houver clone: `git clone https://github.com/rafaelgomesbr/city-hall.git` e `cd city-hall`. O `.gitattributes` já fixa o fim de linha; não mexa em `core.autocrlf`. `git fetch --all` e `git switch v2/f00`.
2. **Node 22** (o mesmo do `.nvmrc` e do CI). Com nvm-windows: `nvm install 22` e `nvm use 22`. Conferir `node -v`.
3. **Dependências:** `cd dc360`, `npm ci --ignore-scripts`, `npm run build:shared`, e `cd apps/campo` com `npm ci --ignore-scripts`.
4. **GitHub CLI:** `winget install GitHub.cli` e `gh auth login` (os agentes leem o CI e reexecutam jobs por ele).
5. **Vercel (destrava o /progresso, H31):** `npx vercel login` uma vez; depois, dentro de `docs/relatorios-v2/site`, `npx vercel link --yes --project dc360-progresso`. Daí em diante `node scripts/roadmap/publicar-progresso.mjs` publica sozinho (a publicação pelo conector MCP falhou com a página de 174 KB).
6. **Skill pessoal e memória do Claude** (ficavam só no Mac):
   - copiar `docs/roadmap-v2/retomada/skill-roadmap-sem-parar/` para `%USERPROFILE%\.claude\skills\roadmap-sem-parar\` (o `orcamento.py` é o medidor de uso por janela de 5 h; tetos provisórios 600 por janela e 8000 por semana; a fonte de verdade é o `/usage`);
   - abrir o Claude Code uma vez dentro do clone (ele cria `%USERPROFILE%\.claude\projects\<pasta-do-projeto>\memory\`) e copiar para lá os arquivos de `docs/roadmap-v2/retomada/memoria/`. Ajustar caminhos de Mac que aparecem neles (`~/.local/bin/gh` vira `gh`; o executável do Claude é `claude`).
   - As skills do projeto (`executar-etapa`, `validar-etapa`, `relatorio-de-fase`, `relatorio-semanal`) e os agentes (`.claude/agents/`) já vêm no repositório.
7. **Memória da máquina:** com 5 agentes em paralelo cada worktree instala `node_modules` (cerca de 500 MB a 1 GB cada). Se o Windows também apertar, rodar no máximo 3 agentes de implementação por vez e apagar `node_modules` dos worktrees ao fim.

## 4. Primeira ação: lançar a rodada 10 da F00 (sessão nova, em segundo plano)

Numa janela separada do PowerShell, na raiz do clone, com o `v2/f00` em `a65f733` (ou depois) e a árvore limpa:

```
claude -p "Valide a F00 no SHA 98879db (registro ddff79a). Rodada 10. Leia a seção 20 de docs/roadmap-v2/28-execucao-e-validacao.md (D-32, aprovada pelo Rafael em 2026-10-25) junto com a seção 19 (D-31). CI: o run do Verificar sobre ddff79a é o 40203288208, verde; o código de produto de 98879db é idêntico ao de a60be9a, cujo CI completo 40179451002 passou na tentativa 2 (a tentativa 1 falhou só num caso instável do WebKit do Linux, DV-45, tratado pelo item 2 da seção 20). Escopo POR DIFERENÇA desde a rodada 9 (dda7557): E19 (correção 11) na dimensão que reprovou; E16 e E22 só pela documentação tocada pelas dívidas DV-08 e DV-09; E09 NÃO é validada: está ACEITA por decisão do Rafael (H36, item 3 da seção 20); registre o aceite no VEREDITO dela sem validador e sem RISCO ACEITO. As demais 21 etapas herdam a rodada 9. Sonnet é o validador padrão; Opus só na consolidação. Validadores em PRIMEIRO PLANO e em sequência. CI lido com gh. Falsos positivos conhecidos de conferir-evidencia: segredo de teste JWT_SEGREDO em sondas/api.sh:5 da E09 (correções 6, 6b, 7, 8 e 8b) e E25 em VEREDITO.md e validacao/. Ao fim, diga se o gate G00 é RECOMENDADO e o que falta para o Rafael aprovar. Termine com os VEREDITO, o commit de registro e o push no v2/f00." --model claude-opus-5-5 --permission-mode auto
```

Enquanto ela roda, NÃO commitar no checkout principal (o validador confere a árvore). Trabalhar nos worktrees.

## 5. Segunda ação, em paralelo: retomar o lote 1 da F02

Na sessão do orquestrador (outra janela), pedir: "Retome a F02 pelo `docs/roadmap-v2/retomada/RETOMADA-WINDOWS.md`, seção 5". O orquestrador:

1. Lança 5 agentes Sonnet (ou 3 e depois 2, se a memória apertar), cada um com `isolation: worktree`, com o pedido: "Leia e siga `docs/roadmap-v2/retomada/briefing-f02.md`; sua parte é a 1X; parta de `origin/trab/f02-1X-...`; o trabalho salvo NÃO teve portões rodados: confira com `git diff origin/v2/f02..HEAD`, termine a parte, rode todos os portões e faça o commit de candidato".
2. Quando cada um terminar, um integrador (Sonnet) junta no `v2/f02` com `git merge --no-ff`, resolvendo contagens pelo `npm run conferir:numeros` e preservando todas as entradas de `baseline.mjs`.
3. Revisor independente em Opus do lote; correções; CI do `v2/f02` verde.
4. Lotes 2, 3 e 4 pelo `docs/roadmap-v2/retomada/plano-f02.md`.
5. Ao fim de cada lote: atualizar o /progresso (`editorial.json`, `linha-do-tempo.json`, `node scripts/roadmap/publicar-progresso.mjs`).

## 6. Depois da rodada 10

- **Se a E19 passar:** as 25 etapas da F00 ficam fechadas e o gatekeeper diz se o G00 é RECOMENDADO. Aprovar e fazer o merge `v2/f00` em `master` (commit de merge, nunca squash, H09) é do Rafael; decidir antes a ordem com o ruleset (H44: fazer o merge e depois importar o ruleset, trocando "só squash" por commit de merge).
- **Depois do G00:** trazer o `v2/f00` para o `v2/f01` e o `v2/f02` (integrador); registrar a F01 com `[ci completo]` e validá-la numa sessão nova (`Valide a F01 no SHA <sha>`).
- **Se a E19 reprovar:** correção 12 em trilha paralela (agente próprio); a F02 não para.

## 7. Armadilhas conhecidas

- `scripts/varrer-imagem.sh` e outros `.sh` precisam do Git Bash; o CI cobre Linux e Windows.
- No Windows, caminhos com nome curto (`RUNNER~1`) já são tratados por `realpathSync.native` no `ambiente-hostil.mjs`.
- Teste com EADDRINUSE: outro agente usa a porta; esperar e repetir, nunca matar processo alheio.
- Nunca reescrever evidência arquivada (os INDEX.md fecham byte a byte); correção vira pasta nova `correcao-N/` ou `divida-DV-nn/`.
- O portão de conteúdo reprova travessão (U+2014) e norma fora da lista; rodar `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` antes de cada push.
- Integrar só com os portões verdes, inclusive o portão de conteúdo (um travessão num RESUMO já quebrou o ramo uma vez).
- `docs/roadmap-v2/retomada/` é material de transporte: depois de instalado no Windows, pode ser apagado num commit.
