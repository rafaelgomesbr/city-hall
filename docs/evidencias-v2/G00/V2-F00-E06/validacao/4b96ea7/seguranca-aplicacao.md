---
validador: seguranca-aplicacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E06
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **PASS** para a dimensão segurança de aplicação (token e autoria). O FAIL do QA nesta rodada (a faixa global não mostra a pausa porque várias instâncias da fila escondem o estado) é de outra superfície e vale como bloqueio da etapa; não o repito nem o desfaço. Achei dois defeitos que a dimensão deve registrar, ambos na rota de foto que a fila usa (achados 1 e 2), nenhum deles regressão desta etapa.

Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/seg/` (`seg/`). Restrição desta rodada: não mutei nada em `apps/campo` nem em `packages/campo`; mordi o lado da API.

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Troca de conta com pedido em voo não grava coleta do agente A com o token do agente B | PASS | servidor: 409 `autor_divergente` na autorização, na reautorização de chave alheia e na confirmação da foto (mutações m10a, m10b, m10c reprovam 3, 3 e 2 casos); motor: conferência de autoria e de marca do dreno antes de cada chamada (`pausa-por-senha-provisoria.test.ts`, 35 casos) |
| O aparelho compartilhado não sobe item de A com a sessão de B | PASS | `prontos()` só entrega item com `autoria === "propria"`; teste do app com a fila real `troca-de-conta-com-pedido-em-voo.test.ts` verde; a pausa é do AUTOR do item |
| 401 de qualquer código pausa; 403 `conta_desativada` e `troca_de_senha_obrigatoria` pausam; `sem_permissao` e 409 continuam permanentes | PASS | matriz da fila no pacote do campo (223 de 223) e `campo-integracao.test.ts` com a API real (redefinir senha, entrar com a provisória, pausar, trocar a senha, subir UMA vez) |
| Sem laço de renovação contra servidor que disse não | PASS | leitura de `apps/campo/src/dados/token.ts` (trava de renovação em voo, piso de 60 s, recusa 403 lembrada por token de renovação) e `token.test.ts` verde |
| Recurso de outro município continua 404 | PASS | `evidencia-so-do-autor.test.ts` (evidência de outro município: 404 antes do teste de autor) |
| A foto só é anexada por quem tem direito sobre a ocorrência | **PARCIAL** | achado 1 |
| Uma conta de agente não consegue travar o envio de fotos do município inteiro | **FAIL parcial** | achado 2 (anotado como corrigir antes de crescer) |

## Evidência

- `cd dc360 && npm run build:shared`; `packages/campo`: `npx vitest run` 10 arquivos, 223 de 223 (`20-pacote-campo.txt`).
- Jest do app `apps/campo` (8 suítes, 84 testes, todos verdes; `21-campo-app-e06-e15.txt`): `token`, `troca-de-conta-com-pedido-em-voo`, `fila-pausada-pela-sessao`, `falha-de-atualizacao`, `vistoria-sessao-vencida-preserva-o-rascunho`, `vistoria-ainda-nao-baixada`, `dialogo-na-conta-com-vistoria-comecada`, `sair-e-entrar-nao-perde-a-coleta`.
- API (`11-api-e06-e08-e12.txt`: 9 arquivos, 167 de 167): `evidencia-so-do-autor`, `campo-integracao`, `agente-so-ve-a-equipe`, `leitura-do-agente-oficios-e-avisos`, `orgaos-e-oficio`, `sino-de-avisos`, `saida-de-municipio`, `acesso-suspenso` e `sessoes-da-conta`.
- Provas de que o teste morde, lado servidor (mutação em `apps/api/src/rotas/evidencias.ts`, vermelho, `git restore`, árvore limpa):

| Mutação | Resultado |
| --- | --- |
| m10a: autorização sem conferir `coletadaPor` contra o token | 3 vermelhos de 28 |
| m10b: confirmação sem exigir que quem confirma é quem autorizou (`anexada_por`) | 3 vermelhos de 28 |
| m10c: reautorização de chave de outra pessoa devolve a evidência dela | 2 vermelhos de 28 |

- Lado do motor e do app: li as mutações do QA do campo (`scratchpad/qa-campo/22-mut3.txt` conferência de autor antes de cada chamada desligada, 2 vermelhos; `24-mut5.txt` pausa atribuída a quem está logado, 2 vermelhos; `26-mut7.txt`, `27-mut8.txt`). Não as repeti, por restrição de paralelismo; o nível E1 do campo, para esta dimensão, é por execução dos testes e por leitura, não por mutação própria.
- Sondas próprias na API real (PGlite): `foto-equipe.test.ts`, `foto-equipe-e2e.test.ts` (`4x-foto-equipe.txt`, `4x-foto-equipe-e2e.txt`) e `teto.test.ts` (`4x-teto.txt`).

## Cenários positivos

- Agente autoriza, envia os bytes e confirma a própria foto: 201, 200, 200, e a trilha diz o autor certo.
- Redefinir a senha do agente, entrar com a provisória, pausar, trocar a senha e subir UMA vez (`campo-integracao.test.ts`).
- Reativada a conta, a mesma coleta sobe com a mesma chave de idempotência, sem duplicar.

## Cenários negativos

- Foto autorizada pelo agente A e confirmada com o token do agente B: 409, sem marcar `enviada_em` e sem evento na trilha.
- Mesma `idempotencyKey` pedida por outra pessoa: 409, sem devolver a evidência de quem a criou.
- `coletadaPor` diferente do token: 409 antes de qualquer leitura do banco (a recusa não depende de a ocorrência existir, então não vira oráculo).
- Evidência de outro município: 404, nunca 403.

## Tentativas de reprovar

1. **Janela entre a conferência do motor e a leitura do token.** O motor confere a autoria antes de cada chamada, mas depois o transporte lê o token. Em `token.ts`, quando a identidade muda no meio de uma renovação, a função devolve `valendoAgora?.acesso` (o token de B) ao chamador de A. Fechada no servidor: a autorização carrega `coletadaPor`, a confirmação compara `anexada_por`, o envelope compara `coletadaPor`. As mutações m10a a m10c provam que cada uma dessas três travas tem teste. `enviarBytes` usa URL assinada, sem token.
2. **Várias instâncias da fila (achado do QA).** Cada instância tem `marcaAtual` e `pausa` próprias, mas `conferir()` lê `sessaoAtual()` global e a autoria do item, então a troca de conta não depende de qual instância drena. Não abre caminho para enviar com a sessão errada.
3. **Foto fora da equipe da ocorrência.** Achado 1. Reproduzido ponta a ponta.
4. **Esgotar o teto de armazenamento com um token de agente.** Achado 2. Reproduzido.
5. **Omitir `coletadaPor` para escapar da conferência.** Só o aparelho de versão anterior omite; `prontos()` nunca envia item sem autor, e o campo ausente faz o autor ser quem apresentou o token (que é a própria pessoa). Não é caminho de ataque, porque quem tem o token já é o autor.
6. **Token mantido no cofre depois da pausa.** Mortos no servidor (sessão revogada); não dão acesso a nada (conferido pela rodada 1 e coerente com a leitura de `encerrarSessaoVencida`, que também revoga no servidor pela ficha e pelo token de renovação).

## Achados

**CORRIGE ANTES DE CRESCER**

1. `POST /evidencias/autorizar-envio` e `POST /evidencias/confirmar-envio` não aplicam o recorte de equipe. O agente Diego (Equipe Alfa) autoriza foto em ocorrências da Bravo, sem equipe e em triagem (201 nas 4 ocorrências abertas que não são da Alfa, 2 da Bravo e 2 sem equipe, além das 2 da própria equipe; as 2 encerradas dão 409), envia os bytes e confirma: o evento `evidencia_anexada` entra na trilha da ocorrência da Bravo e a coordenação passa a ver a foto, com a legenda que o agente escolheu. O mesmo token lê 404 no dossiê dessa ocorrência e lista vazia de fotos (`4x-foto-equipe-e2e.txt`). É coerente com a decisão do produto de aceitar e MARCAR a vistoria de agente fora da equipe (`vistoria_fora_da_equipe`, `equipe_divergente`), mas a foto avulsa (sem vistoria) não carrega marca nem aviso no laudo. Quem decide se isso é intencional é o domínio (Alyson). Se for, vale registrar; se não, falta o `eRecorteDoAgente` nas duas rotas.
2. Reserva de teto sem limite por conta. Com o teto do município em 1 GiB, 102 autorizações de 15 MiB cada, sem enviar um byte, levam ao 507 (`4x-teto.txt`); a reserva só é abandonada pela varredura de órfãos depois de 30 dias (`JANELA_DE_GRACA_DIAS`). Um token de agente roubado, ou um agente de má-fé, consegue travar o envio de fotos de todas as equipes do município. A coleta não se perde (507 é falha temporária na fila e as fotos esperam), mas o envio de fotos para por semanas. Migração 035, anterior à fase. Sugestão: teto de reservas abertas por usuário, ou revogar as reservas de uma conta ao encerrar as sessões dela.

**ANOTADO**

3. Item recusado com 409 `autor_divergente` vira `bloqueado` com "Descartar" ao lado (por desenho, a janela fica de milissegundos depois da conferência do motor; o autor volta e toca em "Tentar de novo").
4. A fila é SQLite em texto claro depois de sair (F14-E04, fora do escopo, documentado).
5. Não-segurança, já no QA: a faixa global não mostra a pausa (achado 1 do QA do campo).

## Não verificado

- Mutação no motor (`packages/campo`) e no app (`apps/campo`) por conta própria: proibida nesta rodada por restrição de paralelismo; usei as mutações do QA do campo como corroboração.
- Emulador e aparelho: não exercitei o app (a E2 do bloco é do QA, que usou o AVD `Medium_Phone_API_36.1`).
- Cofre real (`expo-secure-store`) e iOS.
- Rede lenta real para medir a janela da corrida (milissegundos, fechada no servidor).
- Postgres real; usei PGlite.
- Se o app impede o login de B enquanto há dreno em voo: não existe trava no código lido (o servidor é quem segura).

## Risco residual

- Achados 1 e 2: um agente consegue escrever foto em dossiê de outra equipe, e um token de agente basta para travar o upload de fotos do município por até 30 dias.
- A janela de milissegundos entre a conferência do aparelho e a leitura do token existe, e depende do servidor para ser inofensiva.

## Motivo do humano

Decisão de domínio sobre o achado 1 (o agente de uma equipe pode anexar foto avulsa ao dossiê de outra?). A frase e o item preservado no aparelho continuam pendências do Rafael, registradas pelo QA.
