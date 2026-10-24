# V2-F01-E10: domínio, DNS, TLS e CORS por ambiente (a parte que não depende do CP-04)

## Fatos

**Escopo desta rodada:** só o que independe de domínio próprio. DNS, CNAMEs, SPF/DKIM/DMARC e `og:url` esperam o CP-04 e
não foram tocados. O `build.env.VITE_API_URL` de PROD **continua** no `vercel.json`, por instrução: remover exige o
Rafael confirmar no painel da Vercel que a variável existe em Production. O código e o teste ficaram prontos para a troca.

**O que mudou (em `dc360/`, sem tocar `config.ts`, nem código que importe zod, nem `apps/web/index.html`):**

- `dc360/vercel.json` (editado): nova regra `/(.*)` com `Strict-Transport-Security: max-age=31536000`,
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'none'` e `X-Frame-Options: DENY`.
  Sem `includeSubDomains`/`preload` (só depois do domínio próprio) e sem CSP completa (inventário de terceiros é da
  F25). `build.env` intacto. Nota: o arquivo está em `dc360/vercel.json`, e não em `dc360/apps/web/vercel.json`
  como o pedido dizia; o texto da etapa também diz `dc360/vercel.json`.
- `dc360/scripts/conferir-dominio.mjs` (novo): `--painel=HOST --api=HOST [--negar=ORIGEM ...]`. Confere, para painel e
  API, TLS válido (cadeia, nome, mais de 14 dias), `http` redirecionando para `https` do mesmo host e HSTS de pelo
  menos 180 dias; no painel, `nosniff` e `frame-ancestors`; na API, preflight CORS da origem do próprio painel
  (`access-control-allow-origin` exato, nunca `*`, com credenciais) e preflight negado (sem
  `access-control-allow-origin`) para uma origem inventada e para cada `--negar`. Saída 0/1/2. Só lê. Queda de rede
  vira reprovação nomeada e não esconde as outras conferências. Julgamentos são funções puras exportadas; a rede é
  injetável.
- `dc360/scripts/conferir-dominio.test.mjs` (novo), 20 casos.
- `dc360/scripts/vercel-json.test.mjs` (novo), 9 casos: `VITE_API_URL` literal reprova, com UMA exceção declarada em
  constante (`LITERAL_ENQUANTO_O_PAINEL_NAO_FOI_CONFERIDO` = a URL de PROD de hoje, aceita só no valor e no lugar
  exatos); URL de HML, URL nova, barra a mais, valor vazio ou `env` de topo reprovam; cabeçalhos de segurança presentes
  e mordendo quando removidos ou enfraquecidos; o arquivo real não contém nenhuma outra URL.
- `dc360/docs/VERCEL-PAINEL.md`: emenda de 24/10/2026 (cabeçalhos, passo a passo para tirar a URL de PROD, uso do
  `conferir-dominio`, o que fica para o CP-04). Revoga explicitamente o parágrafo antigo "troque essa linha".
- `dc360/scripts/baseline.mjs`: `V2-F01-E10: 20` e `V2-F01-E10-vercel-json: 9` nas duas tabelas (total do `test-scripts`
  sobe 29).

**Testes (ver `saidas/`):**

- `node --test scripts/vercel-json.test.mjs scripts/conferir-dominio.test.mjs`: 29 de 29 (`saidas/01-testes-novos.txt`).
- Prova de mordida no arquivo REAL (`saidas/04-prova-de-mordida.txt`): trocar a URL de `build.env` por
  `https://api-hml.exemplo.com.br` faz 3 dos 9 casos reprovarem ("VITE_API_URL literal em build.env ..."); restaurado,
  9 de 9.
- `conferir-dominio` contra a rede REAL de PROD, colhido em 2026-10-24 (`saidas/02-conferir-dominio-prod-real.txt`):
  painel e API com TLS válido, `http` redirecionando (308 e 301), HSTS (63072000 e 15552000), CORS aceita exatamente
  `https://dc360-painel-web.vercel.app` e nega a origem inventada e `https://dc360-painel-hml.vercel.app`. A única
  FALHA é a esperada: o painel no ar ainda não tem `nosniff` nem `frame-ancestors`, porque os cabeçalhos novos só
  chegam com o próximo deploy deste `vercel.json`. É a prova de que o conferidor enxerga a diferença; depois do
  deploy ele deve sair 0.
- Preflight cruzado com curl (`saidas/03-preflight-cruzado-curl.txt`): origem do painel de PROD recebe
  `access-control-allow-origin` exato; origem de outro ambiente não recebe o cabeçalho.
- `regras-de-conteudo`: 10 de 10 (`saidas/06-regras-de-conteudo.txt`). `baseline.test.mjs`: 29 de 29
  (`saidas/07-baseline-test.txt`). `conferir:numeros`: verde, com os 29 casos novos em `test-scripts`
  (`saidas/05-conferir-numeros.txt`). `npm run test:scripts` inteiro: `saidas/08-test-scripts.txt`.

**Ambiente:** o worktree estava na `master`; foi levado a `origin/v2/f01` (`f14214f`) e foi preciso
`npm ci --ignore-scripts` e `npm run build:shared`.

**Limitações:**

- **Não provado ainda:** "o painel de HML entra na API de HML" e o preflight cruzado HML-contra-PROD com um HML
  real. HML não existe (E11 cria o app e o projeto Vercel; E12 faz o deploy). O que foi provado é o mesmo mecanismo
  contra PROD, com uma origem hipotética de HML. Quando a E11/E12 existir, rodar o comando do `VERCEL-PAINEL.md` nos
  dois sentidos.
- Não há prova do lado Vercel de que `X-Frame-Options`/CSP chegam de fato ao navegador antes do deploy; o
  `conferir-dominio` é a prova depois do deploy.
- `lerCertificado` (TLS) não tem teste de unidade com certificado local (precisaria gerar um); foi exercitado só na
  rede real. O erro de conexão é coberto pelo dublê.
- `ORIGENS_PERMITIDAS` na API: ver "Para a E09" abaixo. Nada foi mudado na API.
- Esta etapa **não** fica completa: o item do gate "cada ambiente tem TLS e CORS exatos e domínio próprio configurado,
  ou adiado por escrito" depende de CP-04.

## Justificativa

CORS aberto demais liga PROD a HML, e fechado demais derruba o painel por uma tela em branco; nenhum teste de unidade
vê isso porque o defeito mora na configuração do provedor. Por isso o conferidor fala com a rede e julga cabeçalho
bruto: aceitar só a origem exata e negar com ausência do `access-control-allow-origin` (e não "com outro valor")
é o que o navegador de fato usa para barrar. A exceção do `vercel-json.test.mjs` é uma constante nomeada e de valor
exato, para o estado de hoje ser verde sem virar permissão: qualquer outro literal reprova, e fechar a exceção é uma
linha. O HSTS ficou sem `includeSubDomains` porque, sem domínio próprio, os subdomínios do provedor não são nossos.

## Para a E09 (descrito, não feito: `config.ts` e a API são de outro lote)

1. Em produção, `ORIGENS_PERMITIDAS` só recusa `*` (`apps/api/src/config.ts`, em torno da linha 753). Vale recusar
   também: origem com `http://` (exceto localhost fora de produção), com caminho ou barra final (o `@fastify/cors`
   compara string exata, e `https://x/` nunca casa com `https://x`, o que derruba o painel em silêncio), e lista com
   o mesmo valor de HML e PROD. Um teste de config com esses casos negativos.
2. O preflight de origem negada ainda devolve `access-control-allow-credentials: true` e `allow-methods`. Não é
   alcançável como ataque (sem `access-control-allow-origin` o navegador barra), mas dá para o `@fastify/cors` com
   função de origem devolver 204 puro.
3. Em PROD hoje o preflight não lista `if-none-match` em `allow-headers` (curl em 2026-10-24), embora o código
   da API já o liste: indica que a API implantada é anterior à V2-F00-E18. Conferir no próximo deploy da API.

## Para o orquestrador

Linha sugerida do STATUS: `V2-F01-E10 | IMPLEMENTADA (parcial: parte antes do CP-04) | candidato <sha7> (worktree-agent-a3809a4c4586c0f25, sem push) | cabeçalhos de segurança no vercel.json, conferir-dominio.mjs (TLS, http, HSTS, CORS exato e negado), vercel-json.test.mjs com exceção declarada para build.env; 29 casos em test:scripts; DNS/domínio próprio e remoção do build.env pendentes`.

Linhas de baseline a conciliar: `"V2-F01-E10": 20` e `"V2-F01-E10-vercel-json": 9` em `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`, e
`"V2-F01-E10": "conferir-dominio.test.mjs"`, `"V2-F01-E10-vercel-json": "vercel-json.test.mjs"` em
`ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`. O total esperado de `test-scripts` sobe 29.

Pendências humanas (o Rafael faz fora do repositório):

1. Vercel > `dc360-painel-web` > Settings > Environment Variables: confirmar (ou cadastrar) `VITE_API_URL` =
   `https://defesa-civil.fly.dev` no ambiente **Production**. Depois disso, seguir os passos 2 a 4 de
   `dc360/docs/VERCEL-PAINEL.md` (apagar o `build.env`, fechar a exceção em `vercel-json.test.mjs`, republicar e entrar
   no painel de PROD com login). Um implementador pode fazer 2 e 3 numa próxima rodada assim que a confirmação existir.
2. Depois do próximo deploy do painel: `cd dc360 && node scripts/conferir-dominio.mjs --painel=dc360-painel-web.vercel.app --api=defesa-civil.fly.dev --negar=https://dc360-painel-hml.vercel.app` deve sair 0 (hoje sai 1 só pelos cabeçalhos novos).
3. Abrir o painel de PROD no navegador depois do deploy e ver que carrega normalmente (os cabeçalhos novos não
   deveriam afetar nada, mas `frame-ancestors 'none'` impede o painel de aparecer dentro de qualquer iframe, e é bom
   o Rafael confirmar que ele não o usa assim).
4. CP-04 (domínio próprio): nomes, CNAMEs, certificados, SPF/DKIM/DMARC, `og:url`. Bloqueado por decisão do Rafael.
5. Quando E11/E12 existirem: rodar o `conferir-dominio` de HML e o preflight cruzado nos dois sentidos.
