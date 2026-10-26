# V2-F03-E01, correção 1: ADR 0009 depois da segunda leitura de segurança

## Fatos

**Base:** `origin/trab/f03-0a-e01-adr` em `37ff5a5` (candidato da parte 0A). Só documento: nenhum código, nenhuma
migração, nenhum `package.json`. CLAUDE.md, STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md` e o
`plano-f03.md` não foram tocados.

**Entrada:** relatório da segunda leitura de segurança (Codex, somente leitura, sem executar teste), com onze achados,
oito marcados como bloqueando o aceite. Cada achado foi conferido contra o código e as migrações deste SHA antes de
mudar a ADR. Os onze procedem.

**Conferências feitas no código (o que confirma cada achado):**

- `001_base.sql`, linha 330: `GRANT SELECT, INSERT, UPDATE ON ... usuarios ... TO dc360_app`, privilégio de TABELA;
  nenhuma migração posterior o troca por privilégio de coluna (busca por `GRANT` e `REVOKE` em todas as migrações).
- `rotas/administracao.ts`: `GET /usuarios` devolve a lista local; `POST /usuarios` insere com o índice global de
  e-mail da 002 e traduz a duplicidade em 409 `usuario_repetido`; `PATCH /usuarios/:id` deixa o administrador trocar o
  e-mail de outra conta (o comentário da própria rota descreve o caminho de tomada de conta); `POST
  /usuarios/:id/redefinir-senha` devolve a senha provisória na resposta.
- `005_recuperacao_de_senha.sql`: `abrir_recuperacao` procura `lower(email)` em `usuarios` ativos e cria o link para
  aquela conta; não lê nenhum dos quatro campos de credencial que a primeira redação inventariava.
- `002_autenticacao.sql`: `registrar_tentativa_login(p_usuario_id, ...)` grava pelo id recebido, sem conferir quem pede.
- `049_renovacao_e_encerramento_na_mesma_trava.sql`: `travar_sessoes_do_usuario` trava por `usuarios.id`;
  `trocar_senha` e `consumir_recuperacao` revogam por conta.
- `051_link_de_recuperacao_morre_com_a_credencial.sql`: gatilho `AFTER UPDATE OF senha_hash, ativo ON usuarios`.
- `auth/segundo-fator.ts`: `lerLinha` lê `ultimo_passo` sem `FOR UPDATE`, e o UPDATE que grava o passo novo não tem
  condição sobre o valor anterior; `desativar` confere só a senha (lida de `usuarios.senha_hash`).
- `auth/servico.ts`: o desafio do segundo fator já carrega a impressão da credencial (`cr`) e `emitirPar` a confere
  sob a trava.
- `db/test/isolamento.test.ts`: o teto `<= 27` é por contagem; `SEM_TENANT` e `SEM_POLICY_DE_TENANT` são separados de
  propósito (o comentário perto da linha 340 explica por que usar a lista larga enfraqueceria o portão).
- `config.ts`: `RECUPERACAO_ATIVA` existe, e o piloto roda com `nao` (comentário da rota `redefinir-senha`).

**Arquivos mudados:**

- `docs/adr/0009-pessoa-global-com-conta-por-municipio.md`: reescrita das decisões 1, 2, 3 e 6; decisões 7 e 8 novas;
  consequências por etapa refeitas; tabela nova de testes obrigatórios por etapa; lista do que fica proibido e
  alternativas descartadas ampliadas; estado e aceite atualizados. Situação continua PROPOSTA.
- `dc360/apps/api/PENDENCIAS.md`: o item 3 da tabela da seção "Uma pessoa, vários municípios" passa a ter só a E10
  como dona (a E09 não fecha a enumeração); o parágrafo sobre redefinição deixa de citar o 409
  `pessoa_em_varios_municipios`.
- `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`: a troca de município pede a senha de novo; o administrador nem fica
  sabendo se a pessoa tem conta em outro município.
- Nesta pasta: `proposta-de-redacao-do-claude-md.md` (versão corrigida; a da primeira redação fica na pasta da etapa,
  sem mudança, como histórico), as saídas dos portões e este RESUMO. O `INDEX.md` da etapa recebeu só linhas novas.

## Achado a achado

| # | Achado (resumo) | Procede? | O que mudou | Onde na ADR |
| --- | --- | --- | --- | --- |
| 1 | BLOQUEIA: com duas contas da mesma pessoa antes da E08, A e B gravariam credencial em linhas diferentes de `usuarios`, espelhadas na mesma pessoa (duas origens) | Procede. O plano põe a E10 (convite de pessoa existente) e a E18 banco no lote 3, antes da E08 (lote 5) | Relação estritamente um para um no banco: `UNIQUE (pessoa_id)` TOTAL em `usuarios` (conta desativada também conta), criado pela E15. A segunda conta só existe depois da liberação (passo 4, na E16, depois da E08 juntada), com a lista de condições que precisam estar provadas no mesmo SHA. Testes de mesma pessoa em A e B só depois do passo 4 | Decisão 1 ("Uma conta por pessoa até a liberação da segunda conta" e a tabela de passos com a coluna nova) |
| 2 | BLOQUEIA: `REVOKE UPDATE` de coluna não retira o UPDATE de TABELA da 001; funções SECURITY DEFINER não são alcançadas por REVOKE; cópias de hash continuam legíveis | Procede (001, linha 330, conferido) | O passo 3 (E08) faz `REVOKE INSERT, UPDATE ON usuarios` (tabela), concede por coluna numa lista positiva sem credencial, `email` e `pessoa_id`, redefine todos os escritores privilegiados do inventário, move os gatilhos da 046 e da 051 para `pessoas`, esvazia as colunas antigas e retira o SELECT delas. Teste negativo por coluna antiga na E08. A E15 já tira `pessoa_id` do privilégio da aplicação | Decisão 1 ("O passo 3 retira o privilégio de verdade"); testes da E08; alternativas |
| 3 | BLOQUEIA: o 409 `pessoa_em_varios_municipios` ao administrador e a comparação de cadastro da E09 são oráculos entre municípios | Procede. O 409 confirmaria conta fora de A; no cadastro, 201 e 409 se distinguem mesmo com corpo igual (`administracao.ts`, `GET` e `POST /usuarios`) | Regra nova: nenhuma resposta a município (status, corpo, cabeçalho) depende de conta, pessoa ou convite fora dele. O 409 `pessoa_em_varios_municipios` sai da ADR. Até a liberação, a relação um para um torna a intervenção do administrador incondicional (alcança só pessoa exclusiva); a partir dela, resposta igual para todos (alternativa A do CP-50). O fechamento da enumeração do cadastro é a E10 (202 igual em quatro casos); a E09 não é apresentada como fechamento; a reativação da E09 responde igual. Recomendação nova do H94 abaixo | Decisões 3 ("O que nenhuma função e nenhuma rota pode fazer") e 6; testes da E09, E10 e E16; alternativas |
| 4 | BLOQUEIA: contar só contas ativas deixa A redefinir a credencial global de quem tem B desativada; corrida entre a conferência e a ativação | Procede | O UNIQUE da relação um para um é total (conta qualquer conta). Toda intervenção que sobreviver à liberação, por decisão do CP-50, conta toda conta ligada (ativa ou não) e todo convite aberto, toma a trava da pessoa, é serializada com convite, aceite, ativação, reativação e mudança de credencial, e responde igual. Mudança de credencial invalida os convites abertos | Decisões 6 e 7 (trava comum por pessoa); alternativas |
| 5 | BLOQUEIA: pertencer ao município não autoriza mexer na credencial; `pessoa_id` sem proteção deixa ligar conta a pessoa conhecida | Procede (`registrar_tentativa_login` e `trocar_senha` gravam pelo id recebido; INSERT e UPDATE de tabela em `usuarios`) | Autorização por operação: tabela com operação, escopo, quem pode e prova exigida; o banco confere o solicitante (contexto do ator da E06 ou sessão conferida), nunca só o alvo. `usuarios.pessoa_id` imutável por gatilho (inclusive para o dono), fora do privilégio da aplicação, e ligado a pessoa existente só por `aceitar_convite`; o gatilho da E15 só cria pessoa nova, nunca procura pelo e-mail | Decisão 1 (terceiro item), decisão 3 ("Autorização por operação sobre a pessoa"); testes da E15 e da E08 |
| 6 | BLOQUEIA: faltam os escopos de revogação; travas e links por conta deixariam B vivo depois da recuperação em A, e tudo por pessoa faria A derrubar B | Procede (049 e 051 por `usuarios.id`) | Decisão 7 nova: escopo LOCAL (desativação, suspensão e eliminação de município, encerrar as próprias sessões) e GLOBAL (troca, recuperação, redefinição, segundo fator), trava comum por pessoa com ordem escrita, sobrevivência de família e link conferindo município, conta, pessoa e versão da credencial, e quatro testes concorrentes na E08 | Decisão 7; inventário (linhas da 049 e da 051); testes da E08 e da E18 |
| 7 | BLOQUEIA: o PATCH de e-mail pelo administrador e `abrir_recuperacao` ficavam fora do inventário | Procede (`administracao.ts` PATCH; 005) | Inventário refeito como tabela com etapa dona por item, cobrindo credencial, e-mail de recuperação, ligação entre conta e pessoa e todo emissor de prova de autenticação (sessão, par de tokens, desafio do segundo fator, link, convite, console). PATCH de e-mail: E09 o retira. `abrir_recuperacao` e os links: E08 os passam para a pessoa; até lá, a relação um para um garante que a conta achada é a única da pessoa. O e-mail entra no espelho do passo 1 | Decisão 1 (inventário); decisão 6 ("Nenhum município troca o e-mail") |
| 8 | BLOQUEIA: a troca autenticada transformaria um token roubado de A em acesso a B; a proposta do CLAUDE.md só nomeava a escolha | Procede (premissa da E16 no plano: troca herda `mfa_verificado_em`) | A ADR decide pela prova nova: a troca exige a senha conferida naquele momento e, quando o destino exige, código novo do segundo fator; nada é herdado. A forma mais leve fica como pendência do Rafael (pergunta 2 do CP-50), que só pode adotá-la aceitando o risco por escrito; esta correção NÃO aceita o risco. Escolha e troca nomeadas como as duas operações restritas de autenticação, na ADR e na proposta do CLAUDE.md: destino validado no banco, `organizacaoId` nunca vira contexto por si, nenhuma consulta de negócio antes da autorização, 404 igual | Decisão 2; proposta corrigida do CLAUDE.md (troca 2); alternativas |
| 9 | DÍVIDA: o desafio da escolha e a origem de `mfa_verificado_em` precisam ser preservados na E16 | Procede como requisito (o código de hoje já liga o desafio à credencial; a E16 ainda não existe) | Requisitos da E16: propósito e plateia próprios, ligação à pessoa e à versão da credencial, revalidação no consumo, invalidação por evento global; `mfa_verificado_em` é a conferência real, nunca recalculado por renovação ou troca. Testes na tabela da E16 | Decisão 8 (E16); decisão 7 (desafios entre o que o escopo global revoga) |
| 10 | DÍVIDA: consumo do TOTP não atômico; desligar o fator só com a senha | Procede (`segundo-fator.ts`, conferido) | Requisitos da E11: consumo atômico (UPDATE condicional ou `FOR UPDATE` sob a trava da pessoa), contadores do fator separados dos de senha, desligar ou trocar exige senha e código atual (ou de recuperação) e é recusado enquanto houver conta ativa em papel com fator obrigatório, inclusive quando o pedido parte de conta de papel inferior | Decisão 8 (E11); testes da E11 |
| 11 | DÍVIDA: a lista nominal não pode virar dispensa geral, nem aceitar sobrecarga com o mesmo nome | Procede como requisito da 0B | Requisitos do catálogo: função por esquema e assinatura (`regprocedure`), ACL exata, motivo, conferência do tenant e do solicitante, teste comportamental; cada exceção de tabela declara o que dispensa e o que mantém, e o teste confere o que ela mantém; os testes de grants efetivos, RLS, chaves estrangeiras e auditoria continuam iguais | Decisão 3 (item 4), decisão 8 (catálogo); testes da 0B; proposta do CLAUDE.md (troca 1) |

Nenhum achado foi recusado. A seção de alternativas descartadas da ADR ganhou seis linhas com as formas que a leitura
mostrou serem inseguras (o 409 ao administrador, o corpo igual como fechamento, contar só contas ativas, REVOKE de
coluna sobre grant de tabela, converter toda revogação para a pessoa, liberar a segunda conta junto do convite) e uma
com a troca que herda o segundo fator, deixada para a decisão do Rafael.

## Portões (saídas nesta pasta)

- `regras-de-conteudo.txt`: `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` em `dc360/` depois de
  `npm ci --ignore-scripts`. 9 de 10 verdes; o único reprovado é o caso de ambiente Windows conhecido (EPERM ao criar
  symlink, DV-46). "Nenhum travessão em texto nenhum" e "nenhuma norma citada fora da lista autorizada" verdes com os
  arquivos mudados.
- `gerar-estado.txt`: `node scripts/roadmap/gerar-estado.mjs --conferir` da raiz, saída 0.
- `node dc360/scripts/conferir-indices-de-evidencia.mjs` da raiz: verde depois de gravar as linhas novas no `INDEX.md`
  da etapa (não arquivado porque a saída depende do próprio índice).
- `dc360/node_modules` apagado depois dos portões.

## Justificativa

A primeira redação tinha a forma certa (pessoa global, conta por município, token de um município) e deixava abertas
as transições: o período em que a credencial ainda tem escritores em `usuarios`, a intervenção do administrador numa
pessoa que passa a ser maior que o município, e a troca de município. Os onze achados atacam exatamente essas
transições. A correção não muda o modelo; ela fixa a ordem (uma conta por pessoa até a liberação, que fica para
depois da E08 e junto da E16), o privilégio que realmente fecha a escrita (de tabela para coluna), a autorização por
operação, os dois escopos de revogação e a regra de resposta uniforme. O 409 `pessoa_em_varios_municipios` foi
retirado porque contradiz a própria decisão 3 da ADR. A troca de município com prova nova foi adotada como decisão
porque é a forma que não amplia o alcance de um token roubado; a forma mais leve exige aceitar risco, e aceitar risco
não é papel de quem implementa.

## Para o orquestrador

### Mudanças exatas no `docs/roadmap-v2/retomada/plano-f03.md` (NÃO editei o plano)

1. **Seção 1, linha da E11 (hoje: "Premissa: alternativa A do CP-08 ...; 409 `pessoa_em_varios_municipios`.")**
   trocar o final por: "reset do segundo fator pelo superior só no período um para um (até a liberação da segunda
   conta, na E16), sem 409 `pessoa_em_varios_municipios`; requisitos da decisão 8 da ADR 0009 (TOTP atômico,
   contadores separados, desligar com senha e código atual)."
2. **Seção 1, linha da E16 (hoje: "Premissa: troca herda `mfa_verificado_em` até `MFA_VIGENCIA_MINUTOS` (padrão
   provisório 15).")** trocar por: "Premissa: a troca exige prova nova (senha e, quando o destino exige, código novo
   do segundo fator); nada herdado. Herdar `mfa_verificado_em` só se o Rafael aceitar o risco na pergunta 2 do
   CP-50." (Com isso `MFA_VIGENCIA_MINUTOS` da 1C só tem efeito se o Rafael adotar a forma leve; a chave pode nascer
   na 1C com padrão fechado e sem efeito, como as outras.)
3. **Seção 1, linha da E08 (H-a)**: trocar a premissa recomendada pela recomendação nova do H94 (abaixo).
4. **Seção 1, P-04**: "a credencial passa para `pessoas` em quatro passos: E15 espelho (credencial e e-mail) e
   `UNIQUE (pessoa_id)` total; E02 a API LÊ da pessoa; E08 grava só em `pessoas`, REVOKE do privilégio de TABELA em
   `usuarios` e grant por coluna, escritores privilegiados redefinidos, colunas antigas esvaziadas e sem SELECT; E16
   libera a segunda conta (063)."
5. **0B**: acrescentar ao escopo: entradas de `FUNCOES_PRIVILEGIADAS` por `regprocedure` com ACL exata, motivo,
   conferência do tenant e do solicitante e teste comportamental; `EXCECOES_AO_ISOLAMENTO` com invariantes
   dispensados e mantidos por entrada, e o teste conferindo os mantidos; prova extra: sobrecarga com o mesmo nome
   reprova. Se a 0B já tiver candidato, isto entra como correção dela.
6. **0C**: `pessoa_em_varios_municipios` deixa de ser resposta de município. Se a 0C já o reservou em
   `CODIGOS_RESERVADOS`, a linha fica sem uso até a parte que a retirar (ou é retirada na própria 0C, se ainda não
   juntada).
7. **1B (E15)**: acrescentar: `UNIQUE (pessoa_id)` total em `usuarios`; gatilho que recusa mudar `pessoa_id` já
   preenchido; `REVOKE INSERT, UPDATE ON usuarios FROM dc360_app` e grant por coluna sem `pessoa_id` (a lista de
   hoje menos `pessoa_id`); o gatilho de `pessoa_id` nulo SÓ CRIA pessoa nova (trocar "cria ou liga" por "cria");
   o espelho inclui o e-mail; inventário completo na forma da tabela da decisão 1 da ADR. Testes da E15 da tabela
   de testes obrigatórios.
8. **2C (E09)**: na API, trocar "409 ao reativar" por "reativação com resposta igual com e sem outra pessoa ativa
   usando o e-mail" e acrescentar "o `PATCH /usuarios/:id` deixa de aceitar troca de e-mail"; trocar "409
   `usuario_repetido` com corpo igual nos dois casos" por "o 409 de cadastro fica como hoje até a E10 e a evidência
   da E09 registra que ele NÃO fecha a enumeração". O teste negativo do spec "reativar conta antiga com a nova ativa:
   409" vira "reativar conta antiga com a nova ativa: resposta igual, e a pessoa antiga continua inativa".
9. **3C (E10 banco)**: acrescentar: a ligação da conta pendente a pessoa existente só em `aceitar_convite`, uma vez;
   até a liberação, o aceite por pessoa que já tem conta é recusado à própria pessoa com mensagem neutra (o UNIQUE
   da E15 garante); `convidar_pessoa` e `aceitar_convite` tomam a trava da pessoa; mudança de credencial invalida o
   convite aberto, e quem convidou vê o estado de convite vencido. O teste positivo "pessoa existente aceita sem
   mudar a senha" sai da 3C e vai para a 5C (depois da liberação).
10. **3D (E18 banco)**: sai do lote 3 e vai para o lote 6, depois da 5C juntada (não existe mesma pessoa em A e B
    antes da liberação).
11. **4A (E11)**: acrescentar os requisitos da decisão 8 e os testes da E11; tirar o 409 `pessoa_em_varios_municipios`
    do escopo ("rota de redefinição e o 409" vira "rota de redefinição, só no período um para um").
12. **4B (E10 API)**: o 202 igual é o fechamento da enumeração do cadastro, e o teste compara status, corpo e
    cabeçalhos nos quatro casos (e-mail livre, pessoa com conta ativa em outro município, pessoa só com conta
    desativada em outro município, pessoa com convite aberto em outro município).
13. **5A (E08)**: acrescentar ao escopo o passo 3 inteiro da ADR (REVOKE de tabela, grant por coluna, escritores
    redefinidos, gatilhos da 046 e da 051 movidos, colunas antigas esvaziadas e sem SELECT), `abrir_recuperacao` e
    `recuperacoes_senha` na pessoa, autorização por operação, os escopos local e global com a trava da pessoa e a
    ordem escrita na 061, e os testes concorrentes da decisão 7. `redefinir-senha` grava em `pessoas` sob a trava e
    continua incondicional (período um para um). Risco sobe de alto para crítico; Opus com revisor Opus.
14. **5C (E16)**: deixa de ser paralela à 5A: começa depois da 5A juntada. A 063 também faz a liberação da segunda
    conta (retira `UNIQUE (pessoa_id)`), com as condições da decisão 1 conferidas no mesmo SHA. Arquivos novos da
    5C: `rotas/administracao.ts` (só `redefinir-senha`, forma final da decisão 6) e `rotas/segundo-fator.ts` (só o
    reset do superior, forma final). Testes da E16 da tabela, mais o positivo "pessoa existente aceita convite sem
    mudar a senha" vindo da 3C. Requisitos da decisão 8.
15. **Seção 3 (serialização)**: `rotas/administracao.ts`: 1A, 2C, 3A, 4B, 5A, 5C. `rotas/segundo-fator.ts`: 4A, 5C.
    Lote 5: 5A e 5B em paralelo; 5C depois da 5A. Lote 6: 6A, 6B e 3D (E18 banco). 6A (E17) roda depois da
    liberação (já roda, por estar no lote 6).
16. **Seção 4**: "Pode correr junto com o lote 3 da F02: lote 0 inteiro e 1A e 1B" continua; nenhuma mudança de
    numeração (P-12): a liberação entra na 063.

### H94: recomendação nova (substitui a do planejador)

Antes: "manter a redefinição com senha provisória para pessoa de um só município e responder 409
`pessoa_em_varios_municipios` para quem tem conta em outro". Esse 409 é oráculo e foi retirado.

Nova recomendação: **manter a redefinição com senha provisória (F00-E09) sem condição nenhuma enquanto vale a relação
um para um no banco (até a liberação da segunda conta, na E16), porque nesse período a pessoa da conta só existe
naquele município. Na liberação, a rota `redefinir-senha` deixa de definir senha e passa a responder igual para toda
pessoa (202, pedido registrado na trilha, link de recuperação enviado ao e-mail da própria pessoa quando a
recuperação por e-mail está ligada), sem senha na resposta e sem nenhum 409 que dependa de outro município. Com a
recuperação por e-mail desligada (`RECUPERACAO_ATIVA=nao`, como o piloto roda), o caminho depois da liberação é o
fornecedor no console, com verificação e trilha (alternativa A do CP-50).** O custo a decidir pelo Rafael: depois da
liberação, o administrador do piloto perde o botão de redefinir senha, a menos que a recuperação por e-mail esteja
ligada (CP-05 e CP-19) ou o console tenha a redefinição (F20).

### Pendências do Rafael (novas ou mudadas; não alterei `pendencias-humanas.md`)

- **H94 (mudada):** recomendação nova acima. Decidir antes do lote 5, como já estava.
- **Nova (a numerar), troca de município sem prova nova:** a ADR adota a prova nova na troca (senha e, quando o
  destino exige, código novo do segundo fator). A forma leve da premissa anterior (herdar `mfa_verificado_em` por até
  `MFA_VIGENCIA_MINUTOS`, ou trocar só com a sessão de origem) faz um token roubado de um município alcançar todos os
  municípios da pessoa. Só o Rafael pode adotá-la, aceitando esse risco por escrito; recomendação: não adotar. É a
  pergunta 2 do CP-50, então pode ser registrada dentro do H96 em vez de número novo.
- **H96 (mudada):** tirar da recomendação "`MFA_VIGENCIA_MINUTOS` provisório de 15" e pôr "troca com prova nova até a
  pergunta 2 do CP-50"; na pergunta 1, a premissa passa a ser a decisão 6 da ADR (intervenção só no período um para
  um; depois, alternativa A com resposta igual).
- **H97 (sem mudança de texto):** o aceite agora é da ADR corrigida e da proposta do CLAUDE.md em
  `docs/evidencias-v2/G03/V2-F03-E01/correcao-1/proposta-de-redacao-do-claude-md.md`.

### Linha do STATUS sugerida

`V2-F03-E01 | IMPLEMENTADA | candidato em trab/f03-0a-e01-adr (correção 1) | ADR 0009 (proposta) corrigida depois da
segunda leitura de segurança (11 achados, todos procedentes e fechados na redação): uma conta por pessoa até a
liberação na E16, privilégio de coluna em usuarios, autorização por operação, revogação local e global, nenhuma
resposta dependente de outro município, troca com prova nova; plano-f03 precisa das 16 mudanças do RESUMO da correção`.

### Não toquei

STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md`, CLAUDE.md, `plano-f03.md`, código, migrações.
