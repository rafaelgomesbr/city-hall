---
validador: arquiteto-software
papel: arbitragem
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
gatilho: 6 (vereditos opostos na mesma etapa)
veredito: FAIL
confianca: alta
---
## Relatórios em conflito

- `banco-de-dados.md` (Opus): FAIL. A renovação concorrente com "encerrar sessões" de quem administra deixa sessão viva numa família encerrada; 5 de 60 corridas pela API (`28`) e 3 de 6 com o detentor renovando em laço (`29`).
- `qa.md`, `seguranca-aplicacao.md`, `red-team.md`: PASS. Nenhum dos três exercitou a corrida entre a renovação e um encerramento. O QA lista a concorrência em "Não verificado"; segurança diz "não reproduzi a corrida (`inject` é sequencial)"; o red-team cita só a corrida de dois pedidos com o MESMO token (H1), que é outro cenário e que o banco também deu como PASS.

Não há contradição de fato: os três PASS não testaram o cenário do FAIL. O conflito é só de escopo.

## Reprodução (comando e resultado)

Limitação desta sessão: a arbitragem rodou sem shell (só leitura, busca e escrita de arquivo). Não subi banco `prova_arb_*` nem sonda própria; nada foi criado no Postgres nem no repositório. A decisão se apoia em (1) leitura do código no SHA, que torna o defeito determinístico e não probabilístico quanto ao mecanismo, e (2) conferência da sonda e da saída executadas pelo validador de banco.

1. Código no SHA (lido):
   - `dc360/apps/api/src/auth/servico.ts:684-711`: `renovar` chama `revogar_sessao` numa transação (`banco.semTenant`) e, já confirmada, chama `emitirPar`, que abre a sessão nova por `abrir_sessao` em OUTRA transação. Entre as duas a família não tem sessão viva.
   - `dc360/apps/api/src/auth/sessoes.ts:56-66` (`encerrarSessoes`, usado por `POST /usuarios/:id/encerrar-sessoes` em `rotas/administracao.ts:580`): `UPDATE sessoes ... WHERE usuario_id = $1 AND revogada_em IS NULL`, sem trava comum com a renovação. Em READ COMMITTED o UPDATE não enxerga a linha que a renovação ainda vai inserir.
   - `dc360/db/migrations/047_familia_da_sessao.sql:94-103`: `abrir_sessao` aceita herdar a família se existir QUALQUER linha dela do mesmo usuário e município; não pergunta se a família ainda está viva. A família encerrada volta a ter sessão de pé.
   - `dc360/apps/api/src/auth/vigencia.ts:103-106`: a sessão rotacionada vale se a família tem sessão não revogada. Com a família ressuscitada, o token de acesso anterior à renovação também volta a escrever.
   - Sequência que quebra: renovar revoga a antiga e confirma; quem administra encerra (zero linhas vivas, responde 200); renovar abre a nova herdando a família. Resultado: par novo válido por 14 dias depois de o administrador ver "sessões encerradas".
2. Sonda do banco (lida, correta): `scratchpad/banco/sonda-corrida-admin.mjs` faz login do alvo, dispara `/auth/renovar` e `/usuarios/:id/encerrar-sessoes` em paralelo com atraso de 0 a 3,5 ms, conta `sessoes` vivas do alvo DEPOIS das duas respostas e tenta renovar com o par novo. Saída `scratchpad/banco/28-corrida-admin.txt`: 60 tentativas, 5 com sessão viva depois do encerrar 200, e nas 5 o par novo renovou de novo com 200. A contagem só é feita depois das duas respostas, então não há falso positivo de ordem: se o encerrar terminasse antes da revogação, `sessao_por_token` ou `revogar_sessao` (que devolve 0) teriam abortado a renovação.

## Escopo

É da E07.

- Objetivo da etapa: "a sessão rotacionada só vale enquanto a cadeia dela vive". Teste negativo do bloco: "administrador, a própria pessoa, reuso de refresh e troca de senha encerram a cadeia". Item do G00 ligado à E07 (`03-fase-00-estabilizacao.md:779`): "a cadeia rotacionada morre com a sessão". Na corrida, a cadeia não morre.
- A E07 escreveu o código que fecha o laço: a herança de família em `abrir_sessao` (047) e o `encerrarSessoes` por família (`auth/sessoes.ts`, correção da E04 citada nos fatos da E07). A ordem "revogar e depois abrir" vem da 002, mas a garantia prometida e o código da garantia são desta etapa.
- A nota da seção 11 do STATUS ("Achado novo da E07, janela na renovação", proposta para a F03-E02) é OUTRO defeito, no sentido oposto: falso negativo (a escrita legítima com o token antigo leva 401 por milissegundos; a fila do campo segura o item; disponibilidade). O FAIL é falso positivo (cadeia encerrada continua viva; segurança). Mesma raiz (rotação não atômica), consequências e donos diferentes. Além disso, o remédio da nota ("renovar numa só transação") NÃO fecha o FAIL: em READ COMMITTED o UPDATE do administrador continua sem ver a linha inserida por uma transação aberta. E o bloco da F03-E02 (`05-api-identidade-autorizacao.md:352`) não menciona rotação nem corrida: a nota é proposta, não escopo aceito. `apps/api/PENDENCIAS.md:117-124` descreve só o sentido benigno.

## Item da seção 7

Item 2 (autenticação, autorização e vigência: sessão revogada) e critério P0 de segurança (origem BZ-F:P0-SEG no bloco). Não admite RISCO ACEITO. O atenuante medido pelo banco (`LOGIN_POR_IP` de 10 por 5 minutos em `/auth/renovar`) estreita a janela para quem tem um endereço, mas não muda a categoria: o "encerrar sessões" é o remédio de conta comprometida, e é justamente o atacante que renova em laço.

## Decisão

FAIL da E07, mantendo o relatório de banco. Os três PASS ficam válidos no que testaram, e não cobrem este cenário. Não há conflito a levar ao Rafael.

## Conserto mínimo

Para o implementador (não implementado aqui):

1. Serializar a renovação e todo encerramento em massa por uma trava comum por usuário. Por exemplo: `renovar` passa a ser UMA transação que começa com `SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE` (ou `pg_advisory_xact_lock` sobre o id), depois `revogar_sessao` e `abrir_sessao`; e `encerrarSessoes`, `revogar_sessoes_do_usuario` (reuso, desativação) e `trocar_senha` tomam a MESMA trava num comando anterior ao UPDATE. Em READ COMMITTED o UPDATE seguinte pega fotografia nova e vê a sessão recém confirmada. A trava precisa ser comando separado, antes do UPDATE; no mesmo comando não resolve.
2. Opcional e complementar: `abrir_sessao` recusar herança quando a família não tem sessão viva e a última revogação dela não é `rotacionada na renovacao` da sessão que está sendo rotacionada (passar o id da sessão anterior).
3. Teste em Postgres real (não PGlite, que serializa): duas conexões, a renovação parada entre revogar e abrir (barreira) e o encerramento disparado no meio; esperado: nenhuma sessão viva do alvo depois das duas, e o token de acesso anterior recebe 401 `sessao_encerrada` ao escrever. Repetir para encerrar pela própria pessoa, reuso e troca de senha. Provar que morde removendo a trava.
4. Corrigir `apps/api/PENDENCIAS.md:117-124` e a nota da seção 11 do STATUS: a janela tem dois sentidos, e "uma só transação" sozinha não fecha o de segurança.
