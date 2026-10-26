---
validador: red-team (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

## Critérios verificados

1. Agente de campo em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao`, sem conteúdo, e a resposta não revela se o ofício existe, de que equipe ou de que município é.
2. Operador, coordenador e administrador continuam abrindo o ofício (200, com o que sempre viram).
3. Coordenador do município B no ofício do município A: 404, igual ao de id inexistente.
4. Sino: o agente vê e conta só os avisos da equipe dele; agente sem equipe recebe lista vazia e `naoLidos` 0; coordenação e operador veem o município inteiro; aviso de outro município nunca aparece.
5. `POST /avisos/lidos` não serve de oráculo para o agente.
6. `GET /avisos` (que escreve) passa pela vigência (cruzado com a E04).

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/red-team-E04-E05-E06-E08/`. Mesmo ambiente do relatório da E04 (PostgreSQL 17.6 local, API real na porta 3791, papel de API sem BYPASSRLS).

- `sonda-e08.mjs`, saída `saida-e08.txt` (`FALHAS: 0`, código 0). Fixture gravada como superusuário: três ofícios (equipe Alfa, equipe Bravo, Vale Fundo), cada um com órgão com e-mail, observação reservada, envio e abertura com IP; quatro avisos (Alfa, duas da Bravo, Vale Fundo). Contas criadas pela rota real: agente da Bravo e agente sem equipe.
- `saida-varredura.tsv` (da E04): `GET /avisos` e `GET /avisos/` com conta desativada em GET e HEAD.
- Testes sem mutação: `t-api-base.txt` (`leitura-do-agente-oficios-e-avisos.test.ts` entre os 107 de 107), `t-shared.txt` (`permissoes.test.ts`), `t-web.txt` (`oficio-so-para-quem-consulta.test.ts`).
- Mutações M4, M5 e M6 (`m4.txt`, `m5.txt`, `m6.txt`), desfeitas com `git restore`.

## Cenários positivos

- Jonas (operador), Helena (coordenadora) e Rita (administradora) abrem a ficha do ofício da Bravo: 200, com o e-mail do órgão e o IP de quem abriu o link.
- Sino da Helena e do Jonas: 5 avisos e `naoLidos` 5, igual ao oráculo calculado no banco para o município inteiro.
- Diego marca como lido o aviso da própria equipe: `marcados: 1`.

## Cenários negativos

- Quatro agentes (Diego da Alfa, agente da Bravo, agente sem equipe, Tarcísio de Vale Fundo) contra lista, lista filtrada pela ocorrência da Bravo, ficha do ofício da Alfa, da Bravo, de Vale Fundo, inexistente e com id malformado, e o documento do ofício (existente e inexistente), em GET e HEAD: 36 combinações, todas 403 `sem_permissao`, nenhuma com e-mail, IP ou observação no corpo. Corpo da recusa idêntico em todas as variantes de lista e ficha (1 corpo distinto). Tempo mediano do agente: 0,34 ms no ofício existente de outra equipe e 0,33 ms no inexistente (40 amostras cada).
- Aurélio (coordenador de Vale Fundo) no ofício de Serra Alta: 404 com corpo idêntico ao de id inexistente, medianas 0,73 e 0,66 ms; a lista dele não traz ofício de Serra Alta.
- Sino: Diego 2 avisos e `naoLidos` 2 (oráculo da Alfa 2), agente da Bravo 3 e 3 (oráculo 3), agente sem equipe 0 e 0, Tarcísio 0 e 0; nenhum item fora do recorte.
- `POST /avisos/lidos` do Diego com aviso da Bravo, de Vale Fundo e inexistente: `marcados: 0` nos três, e nenhuma linha gravada em `avisos_lidos` para os de fora.
- `GET /avisos` com conta desativada: 403 `conta_desativada` em GET e HEAD, sem tabela alterada (varredura da E04).

## Tentativas de reprovar

1. Oráculo de existência pelo status, pelo corpo e pelo tempo da recusa ao agente: nada distingue existente, inexistente, outra equipe e outro município.
2. Oráculo de validação: id malformado também dá 403 (a permissão vem antes do esquema).
3. Caminhos laterais ao ofício: `GET /oficios/:id/documento` (403, exige `emitir_documento`), dossiê da própria equipe com ofício emitido (200 sem número, e-mail, IP nem observação do ofício). Ver Achados para `/documentos/validar` e `/orgaos`.
4. Oráculo pela contagem do sino e pela marca de lido: fechados.
5. Coordenador rebaixado a agente com o token antigo: `GET /avisos` responde 401 `nao_autenticado` (vigência, porque a rota tem efeito); `GET /oficios/:id` ainda responde 200 com o e-mail do órgão (limitação declarada pelo implementador: leitura sem vigência até a F03-E03).
6. Mordida, cada uma desfeita com `git restore`:
   - M4, contagem de não lidos sem o recorte: 7 casos reprovam em `leitura-do-agente-oficios-e-avisos.test.ts` (`m4.txt`).
   - M5, marcar como lido sem o recorte: 1 de 14 reprova ("marcar como lido não funciona como oráculo") (`m5.txt`).
   - M6, `GET /oficios/:id` só com autenticação: 2 de 14 reprovam (`m6.txt`).

## Achados

1. **Anotado (fora do escopo das três rotas da etapa):** `GET /documentos/validar/:codigo` só exige autenticação e devolve, a um agente da Alfa que tenha o identificador de 12 caracteres hexadecimais impresso no ofício da Bravo, `documento: oficio`, número `900002/2026`, protocolo, `ocorrenciaId`, `oficioId` e quem emitiu (`saida-e08.txt`). Não devolve e-mail, observação nem IP, e o identificador (48 bits) não é adivinhável; o mesmo vale para laudos de outra equipe. É menos que o que a etapa fechou, mas é leitura de ofício de outra equipe pelo agente: candidato ao manifesto rota x ação (F03-E12) ou ao recorte do agente.
2. **Anotado (já registrado pelo implementador, decisão 5):** `GET /orgaos` responde ao agente com o e-mail de cada órgão.
3. **Anotado (limitação declarada):** papel rebaixado continua lendo ofício por até 15 minutos com o token antigo.

## Não verificado

- O painel: esconder o cartão "Ofícios de encaminhamento" do agente foi coberto só por `oficio-so-para-quem-consulta.test.ts` (verde); não abri o navegador nem rodei a seção 25 do e2e.
- A escrita dentro do `GET /avisos` disparada pelo agente (materialização de prazos e expurgo): continua, por decisão; não medi o efeito dela em volume.
- Avisos com `detalhe` de outros tipos (devolução, saída sem retorno) nascidos de fluxo real: a fixture usou `vistoria_recebida`.
- O run do CI do SHA.

## Risco residual

O agente ainda alcança metadados de ofício de outra equipe por `/documentos/validar` se tiver o identificador impresso, e os e-mails dos órgãos por `/orgaos`. Papel rebaixado lê ofício até o token vencer.

## Motivo do humano

Nada na dimensão red-team: tudo foi provado por execução.
