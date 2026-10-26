---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [AUTH, TENANT, RLS, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: nao
escalar: arbitragem em Opus se o gatekeeper entender que a corrida da renovação é pré-existente (002) e fora do escopo da E07; o critério que ela quebra está no bloco da E07 e na lista da seção 7 de `28` (sessão revogada)
---
## Critérios verificados

Ambiente: cluster PostgreSQL 18.3 descartável meu (`initdb` no scratchpad, porta 55491, senhas aleatórias da rodada, apagado no fim). A porta 4002 não recebeu conexão (senha desconhecida, como na rodada 1). Papéis como o job `implantavel`: `dc360_setup` CREATEROLE BYPASSRLS NOSUPERUSER, `dc360_api` login, membro de `dc360_app WITH SET TRUE`. API do SHA rodando por `tsx src/index.ts` contra esse banco (porta 3893), com `LOGIN_POR_IP=10000` para permitir as rajadas. Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/banco/` (abaixo, só o nome do arquivo).

1. Migração 047 do zero: as 48 aplicadas, `--conferir` "Esquema em dia.", segunda execução "Nada a fazer: 48" (`01`, `02`, `03`). PASS.
2. 047 sobre banco existente: banco levado só até a 046 pelo `aplicarMigracoes` do repositório, semeado, com 4 sessões (viva, rotacionada, de conta desativada, de B). `--conferir` antes: código 1; `migrar` aplicou só 047 e 048; depois "Esquema em dia."; as 4 sessões com `familia_id = id`, nenhuma perdida (`26`, `27`). PASS.
3. Coluna e índice: `familia_id uuid NOT NULL DEFAULT gen_random_uuid()`, `sessoes_familia_viva_idx (familia_id) WHERE revogada_em IS NULL` (`05`). PASS.
4. `abrir_sessao` (7 argumentos): SECURITY DEFINER, `search_path=public, pg_temp`, dono `dc360_setup`, EXECUTE só `dc360_app` (e o dono); 27 funções privilegiadas, nenhuma sem `search_path` (`05`). Herança recusada com a mesma mensagem DC369 para família de outro usuário, de outro município, inexistente e usuário de B com organização A (`08`). PASS.
5. RLS: 35 de 36 tabelas do `public` com RLS ativada e forçada (a de fora é `schema_migracoes`), todas de `dc360_setup`; trilhas só com policy INSERT e SELECT (`05`). PASS.
6. Concorrência na renovação com o MESMO token (pergunta do foco): PASS. Em Postgres real, duas transações em `revogar_sessao` do mesmo hash: a segunda fica bloqueada até a primeira confirmar e devolve 0 (READ COMMITTED reavalia `revogada_em IS NULL`), e a API aborta sem emitir par (`08`). Pela API, 15 rodadas de 8 renovações simultâneas com o mesmo token: exatamente um 200 por rodada, nunca mais de uma sessão viva na família (`07`). O teste do repositório (`vigencia-na-escrita.test.ts`, caso H1) roda em PGlite, que serializa: não prova a corrida; esta sonda prova.
7. "Administrador encerra a cadeia" (teste negativo do bloco): FAIL, ver Achados 1.

## Evidência

- `01` a `05`: migrar do zero, conferir, idempotência, semente, catálogo (RLS, donos, papéis, policies, grants, definers).
- `06`: `scripts/restore/isolamento-afirmado.sql` como `dc360_api` assumindo `dc360_app`: código 0.
- `07` (`sonda-e05-e07.mjs`): corrida de renovação pela API e herança da família.
- `08` (`sonda-sql.mjs`): duas conexões reais em `revogar_sessao`, recusas de `abrir_sessao`, família totalmente encerrada aceita herança.
- `26`, `27` (`ate-046.mts`): 047 e 048 sobre banco existente com sessões.
- `28` (`sonda-corrida-admin.mjs`) e `29` (`sonda-atacante-renovando.mjs`): o defeito.
- `19` a `25`: `test:isolamento` e as mutações (ver E25 e E05).

## Cenários positivos

Login abre família própria; renovação herda; 047 e 048 aplicam do zero e sobre banco com sessões; uma só renovação vence por token.

## Cenários negativos

Família de outro usuário, de outro município, inexistente: DC369 uniforme. Oito renovações simultâneas: sete 401, nenhum par a mais. Contexto de A não lê sessão de B; sem contexto, 0 linha.

## Tentativas de reprovar

- Corrida de renovação com o mesmo token (API e SQL): não quebrou.
- Plantar família alheia em `abrir_sessao`: não quebrou.
- Herdar família TOTALMENTE encerrada: a função aceita e a família volta a ter sessão viva (`08`, "familia totalmente encerrada aceita heranca: true"). Foi o que levou ao achado 1.
- Corrida entre a renovação e `POST /usuarios/:id/encerrar-sessoes`: QUEBROU (achado 1).

## Achados

1. **FAIL (bloqueia): a renovação sobrevive ao "encerrar sessões" do administrador.** `renovar` (`apps/api/src/auth/servico.ts`, linhas 684 a 711) revoga a sessão antiga (`revogar_sessao`) e abre a nova (`abrir_sessao`, migração 047) em duas transações separadas. Se o administrador encerra as sessões entre as duas, `revogar_sessoes_do_usuario` não vê a sessão que ainda não existe, e `abrir_sessao` aceita herdar a família já toda encerrada. Resultado: a rota do administrador responde 200 e o detentor do token sai com um par novo que renova por 14 dias. Por inferência da consulta de `auth/vigencia.ts` (não executei a escrita), o token de acesso anterior à renovação também volta a valer, porque a família tem sessão viva de novo.
   Reprodução A (`28`): 60 tentativas de renovar do Jonas em paralelo com o encerrar da Rita (atraso de 0 a 3,5 ms): em 5 o encerrar respondeu 200 e sobrou sessão viva, e o par novo renovou de novo com 200.
   Reprodução B (`29`): quem tem o token renova em laço; a administradora clica "encerrar" uma vez: em 3 de 6 tentativas o detentor continuou renovando (200) depois do encerrar.
   Atenuante medido: em produção `/auth/renovar` tem `LOGIN_POR_IP` de 10 por 5 minutos por endereço, o que estreita muito a janela para quem tem um endereço só; a sonda B simula quem tem vários. Agravante, por leitura do código: o mesmo padrão (UPDATE de `sessoes` WHERE `revogada_em IS NULL`, sem trava comum com a renovação) está em `revogar_sessoes_do_usuario` chamada pela derrubada por reuso e em `trocar_senha` (migração 005), que são os remédios de token roubado. Desativar a conta NÃO é afetado (a vigência e a renovação seguinte leem `usuarios.ativo`).
   Não é regressão da 047 (a ordem revogar e depois abrir vem da 002), mas o bloco da E07 promete que "administrador, a própria pessoa, reuso de refresh e troca de senha encerram a cadeia", e `apps/api/PENDENCIAS.md` (linhas 117 a 124) descreve a janela só no sentido benigno ("uma escrita com o token antigo nessa janela leva 401") e diz que renovar numa só transação a fecha. Não fecha sozinha: em READ COMMITTED o UPDATE do administrador não enxerga a linha inserida por uma transação ainda aberta. Conserto mínimo: serializar os dois caminhos numa linha comum (por exemplo `SELECT ... FROM usuarios WHERE id = $1 FOR UPDATE` dentro de uma transação única de renovação e dentro de `revogar_sessoes_do_usuario`), ou `abrir_sessao` recusar herança quando a sessão rotacionada da família foi revogada DEPOIS por outro motivo, mais um teste em Postgres real (não PGlite) que dispare as duas rotas juntas. Dono: implementador da E07. É critério da lista da seção 7 de `28` (sessão revogada): não admite risco aceito.
2. CORRIGE ANTES DE CRESCER: o caso H1 de `vigencia-na-escrita.test.ts` roda em PGlite, que serializa as transações; o próprio comentário admite. A proteção real (`revogar_sessao` devolvendo 0) está provada aqui em Postgres 18.3, mas não há teste automatizado em Postgres real que a trave.
3. ANOTADO: a corrida de renovação legítima entre duas abas pode cair no caminho de reuso (o perdedor chega depois da rotação e derruba todas as sessões do usuário); observado uma vez em 15 rodadas na primeira execução. É o desenho declarado (reuso derruba tudo).
4. ANOTADO (já na rodada 1 e no relatório de segurança): a vigência não confere `expira_em` da sessão viva; `trocar_senha` preserva por `id` e não por família.

## Não verificado

- Postgres 17 (produção) e 16 (job `implantavel`): só 18.3 local. O job `restore` do CI aplicou as 48 em 17.11 (lido pela engenharia), sem as sondas de corrida.
- A corrida com o limite de produção (`LOGIN_POR_IP=10`): não medi a probabilidade real, só o mecanismo.
- A mesma corrida contra troca de senha e contra a derrubada por reuso: inferida do código (`trocar_senha` e `revogar_sessoes_do_usuario`), não executada.
- A escrita com o token de acesso anterior à renovação depois da corrida: inferida da consulta da vigência, não executada.
- Pooler da Supabase em modo transação.
- Os 3 testes pulados de `test:isolamento` (por ambiente: busca com `pg_trgm`).

## Risco residual

Com o achado 1 aberto, "encerrar sessões" (e, pelo código, troca de senha e reuso) não garante a saída de quem está renovando naquele instante. A janela é de milissegundos e o limite por endereço a reduz, mas o critério é inegociável. O resto da 047 (coluna, índice, função, permissões, RLS, compatibilidade e aplicação sobre banco existente) está provado.

## Motivo do humano

Não se aplica.
