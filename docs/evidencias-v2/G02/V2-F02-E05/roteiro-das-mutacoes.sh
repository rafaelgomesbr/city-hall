#!/bin/bash
# Mutações reais nos clientes: cada uma deve reprovar o teste de contrato. Restaura com git checkout.
RAIZ="C:/Projetos/city-hall/.claude/worktrees/agent-a0a0a28da409ee8c4/dc360"
cd "$RAIZ" || exit 1

rodar() {
  local rotulo="$1"
  echo "=== MUTACAO: $rotulo"
  (cd apps/api && npx vitest run test/contrato-cliente-rota.test.ts 2>&1 | grep -E "FAIL|Tests |AssertionError|^\s+\S*\"(GET|POST|PUT|PATCH|DELETE) " | sed 's/\x1b\[[0-9;]*m//g' | head -12)
  git checkout -- apps/web/src apps/campo/src packages/campo/src apps/console/src
}

sed -i 's#"/saida/pacote.zip"#"/pacote.zip"#' apps/web/src/dados/http.ts
rodar "painel: /saida/pacote.zip vira /pacote.zip"

sed -i 's#"/aparelhos"#"/aparelho"#' apps/campo/src/dados/api.ts
rodar "campo api.ts: /aparelhos vira /aparelho"

sed -i 's#"/sincronizacao/vistoria", envelope, "POST"#"/sincronizacao/vistoria", envelope, "GET"#' packages/campo/src/transporte.ts
rodar "transporte.ts: vistoria enviada com GET"

sed -i 's#${base}/configuracao`#${base}/configuracoes`#' apps/campo/src/dados/mapa.ts
rodar "mapa.ts: /configuracao vira /configuracoes"

sed -i 's#${base}/rota`#${base}/rota/calcular`#' apps/campo/src/dados/rota.ts
rodar "rota.ts: /rota vira /rota/calcular"

sed -i 's#pedirComSessao("/operadores", "GET")#pedirComSessao("/operador", "GET")#' apps/console/src/pagina.ts
rodar "console: /operadores vira /operador"

sed -i 's#corpo: { email, senha } }#corpo: { email, senha, lembrar: true } }#' apps/web/src/dados/http.ts
rodar "painel: corpo do entrar ganha chave que o esquema nao conhece"

sed -i 's#corpo: { renovacao },#corpo: { renovar: renovacao },#' apps/campo/src/dados/api.ts
rodar "campo: /auth/renovar manda renovar em vez de renovacao"

printf '\nexport async function soltoDeTeste() { return fetch("https://exemplo.com.br/x"); }\n' >> apps/campo/src/dados/token.ts
rodar "campo: fetch solto em token.ts"
git status --short
