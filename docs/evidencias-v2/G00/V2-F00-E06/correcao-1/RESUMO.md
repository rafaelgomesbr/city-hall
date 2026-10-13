# V2-F00-E06, correção 1: senha provisória pausa a fila e a foto só sobe com o autor certo

Base: `f6a202d`, ramo `v2/f00`. Motivo: rodada 1 reprovada (Testes e Red-team em FAIL, SHA `7005a60`, arbitragem em Opus confirmando FAIL).

## Fatos

**Os defeitos provados pela validação.**

1. Perda de dado. A coordenação redefine a senha do agente (`POST /usuarios/:id/redefinir-senha` derruba as sessões: 401, a fila já pausava), o agente entra com a senha provisória e o dreno recebe 403 `troca_de_senha_obrigatoria` em toda escrita. O transporte só pausava o 403 de ação `parar_e_avisar`; esse caía em `FalhaPermanente`: todos os itens viravam `bloqueado`, o dreno não parava e o cartão oferecia "Descartar", que apaga coleta que o servidor nunca recebeu.
2. Autoria falsa na trilha append-only. Com a conta trocando enquanto uma foto está em voo, `/evidencias/confirmar-envio` gravava `evidencia_anexada` com o autor da NOVA conta, e `/evidencias/autorizar-envio` gravava `anexada_por` dela. Não existia conferência de autor, ao contrário de `/sincronizacao/vistoria` e `/devolucao`.
3. Dois achados "corrigir antes de crescer": a pausa era atribuída a quem estava logado quando a resposta chegava, e com dois drenos um 401 tardio devolvia a `pendente` um item já `confirmado`.

**O que mudou no servidor (`dc360/apps/api/src/rotas/evidencias.ts`, `dc360/packages/shared/src/evidencia.ts`).**

- `pedidoDeEvidenciaSchema` ganha `coletadaPor` (UUID, opcional, como no envelope da vistoria).
- `POST /evidencias/autorizar-envio`: `coletadaPor` diferente do token responde 409 `autor_divergente`, antes de qualquer leitura do banco (a recusa não depende de a ocorrência existir, então não vira oráculo; ocorrência de outro município segue 404). Reautorizar uma chave de `idempotencyKey` cuja `anexada_por` é de outra pessoa responde 409 e não devolve nem confirma a evidência dela.
- `POST /evidencias/confirmar-envio`: quem confirma tem de ser quem autorizou (`anexada_por`), inclusive no atalho "já estava confirmada"; senão 409 `autor_divergente`, sem marcar `enviada_em` e sem evento na trilha. Evidência de outro município continua 404 (a leitura sob RLS vem antes). `anexada_por` nulo (linha anterior à migração 024) segue valendo.
- Sem migração nova, sem policy nova. A recusa da foto deixa só um aviso no log do servidor, sem evento na trilha (limitação abaixo).

**O que mudou no motor (`dc360/packages/campo/src`).**

- `transporte.ts`, `falhaDaResposta`: o 403 é lido pela AÇÃO do catálogo (não por lista de códigos). `parar_e_avisar` vira pausa `conta_desativada`; `trocar_a_senha` vira pausa `troca_de_senha_obrigatoria` (novo `MotivoDeSessao`); `aguardar_o_contrato` (`acesso_suspenso`) vira `FalhaTemporaria` (cinto: a API já responde 503 à fila). `sem_permissao` e 403 sem código seguem permanentes.
- `autorizarFoto` leva `coletadaPor` (autor do item; ausente, e nunca o dono da sessão, se a coleta não tem autor).
- `fila.ts`: o dreno usa um transporte "por item" (`transporteDoItem`) que, ANTES DE CADA chamada (autorizar, bytes, confirmar, envelope, devolução), confere que o dreno não foi cancelado e que a sessão ainda é do autor do item; senão o item volta a `pendente` com a contagem de tentativas de antes e o dreno para, sem bloquear e sem pausa. A pausa passa a ser do AUTOR do item. `devolverAoEstadoAnterior` relê o estado atual: não reescreve item `confirmado`, `bloqueado` ou `arquivado`, e um dreno cancelado não toca no item enquanto outro dreno roda. `tratarFalha` também ignora o item já `confirmado`. A pausa nova substitui a velha (a faixa deixa de dizer "Sessão encerrada" por cima de "senha provisória").

**O que mudou no aplicativo (`dc360/apps/campo/src`).** `pausa-da-fila.ts` ganha as frases de `troca_de_senha_obrigatoria` (faixa, aviso no alto da fila e cartão "Guardada", sem botão: o aplicativo não tem tela de troca de senha). `falha-de-atualizacao.ts` ganha o motivo `troca-de-senha` (fim de linha) para as telas que vão à rede. `FaixaDeSincronizacao.tsx` ganha a chave. O layout já cancela o dreno quando a identidade muda; agora esse cancelamento vale também no meio do item.

**Matriz final de classificação** (teste único `pausa-por-senha-provisoria.test.ts`, 13 linhas x 4 rotas da fila x estado final do item):

| Resposta | Fila |
| --- | --- |
| 401 de qualquer código, inclusive sem código | pausa `sessao_encerrada` (item `pendente`, tentativas inalteradas) |
| 403 `conta_desativada` | pausa `conta_desativada` |
| 403 `troca_de_senha_obrigatoria` | pausa `troca_de_senha_obrigatoria` |
| 403 `acesso_suspenso` | temporária |
| 403 `sem_permissao`, 403 sem código | permanente, `bloqueado` (por desenho) |
| 409 `autor_divergente` | permanente, `bloqueado` (por desenho) |
| 409 `ja_encerrada` | `arquivado` |
| 429, 503 | temporária |

**Testes novos (61).**

- Pacote do campo, `test/pausa-por-senha-provisoria.test.ts`: 35 casos. Matriz (26: transporte nas quatro rotas e fila), senha provisória (3, inclusive o roteiro 401 e depois 403 e depois sobe tudo em ordem), corridas (6: pausa do autor, cancelar e troca de conta, 401 tardio com dois drenos, troca de conta com a foto em voo, `cancelar()` com a foto em voo, `coletadaPor` no fio).
- API, `test/evidencia-so-do-autor.test.ts`: 11 casos (autor declarado diferente, igual, ausente; mesma chave de outra pessoa; reautorização com bytes no armazenamento; outro município 404; sem oráculo; confirmação de outra pessoa; confirmação do autor com trilha dizendo o autor; reconfirmação por outra pessoa). `test/campo-integracao.test.ts`: 2 casos novos (redefinir senha, entrar com a provisória, pausar, trocar a senha e subir UMA vez, tudo contra a API real; foto de um agente com o token de outro).
- Aplicativo: 13 casos (`falha-de-atualizacao.test.ts` 5, `pausa-da-fila.test.ts` 2, `fila-pausada-pela-sessao.test.tsx` 3, `faixa-de-sincronizacao.test.tsx` 1, `troca-de-conta-com-pedido-em-voo.test.ts` 2, este com a fila real do aplicativo, SQLite em memória e `fetch` falso).

**Mordem (vermelho antes, verde depois).** Com o código-fonte anterior de volta (`git stash` só dos arquivos de `src`):

- motor: 12 dos 35 casos reprovam (`saidas/01`), 35 de 35 passam depois (`saidas/04`);
- API: 9 dos 28 casos das duas suítes reprovam (`saidas/02`), 28 de 28 depois (`saidas/05`); a falha do roteiro de senha redefinida é `paradaPor` indefinido, ou seja, item bloqueado;
- aplicativo: 11 dos 68 casos das cinco suítes reprovam (`saidas/03`), 68 de 68 depois (`saidas/06`).

**Regressão.** `npm run test:api` 99 arquivos, 1296 de 1296 (`saidas/09`); `npm run test:isolamento` 327 aprovados e 3 pulados, inalterado (`saidas/10`); `npm run test:campo` 128 suítes, 1880 de 1880, com o TypeScript estrito do app (`saidas/11`); pacote do campo 10 arquivos, 223 de 223 (`saidas/07`); `npm run test:e2e:api` Passou 279, Falhou 0 (`saidas/16`); `npm run typecheck` código 0 (`saidas/13`); `npm run conferir:numeros` 24 conferidas, 0 divergência, depois de atualizar `README.md`, `apps/campo/LEIA-ME.md`, `docs/COLOCAR-DE-PE.md` e `scripts/baseline.mjs` (`saidas/12`); `npm run test:scripts` 213 testes, 0 falha (`saidas/14`); portão de conteúdo verde (`saidas/15`).

**Documentação.** `apps/campo/PENDENCIAS.md` item 14 (a decisão da E07 de deixar o 403 como recusa permanente foi invertida, com a matriz); `docs/DECISOES-DE-TESTE-DA-FASE-00.md` (nenhum teste reescrito, 61 acrescentados); contagens nos documentos.

**Limitações.**

- Nada foi visto em aparelho nem em emulador: o app Expo não renderiza no ambiente. A prova de tela é teste de componente. Validação humana pendente (Rafael): ver a frase e a coleta preservada ao redefinir a senha de um agente com coleta na fila.
- PREMISSA: a frase do novo motivo de pausa ("Você entrou com uma senha provisória e o envio está parado", "Defina a sua senha no painel, no computador...") é texto de produto e precisa da aprovação do Rafael.
- A pausa por senha provisória não traz botão, porque o aplicativo não tem tela de troca de senha. Depois de trocar a senha no painel, as sessões dos outros aparelhos caem (401): o agente vê a pausa "Sessão encerrada" e usa "Entrar de novo".
- A recusa de foto por autor divergente não grava evento na trilha (a da vistoria e a da devolução gravam, com tipo próprio). Só aviso no log.
- Um item recusado por 409 `autor_divergente` na foto fica `bloqueado` (permanente por desenho, como a vistoria): o autor volta, toca em "Tentar de novo" e a foto sobe. A conferência do aparelho antes de cada chamada deixa esse caso só para a corrida de milissegundos entre a conferência e o pedido.
- Fora desta correção, anotados em `PENDENCIAS.md`: rebaixar o papel do agente com coleta na fila ainda bloqueia (403 `sem_permissao`, decisão do Rafael); `descartar` aceita item de outro autor; 401 `nao_autenticado` dentro do piso de 60 s pausa como "sessão encerrada".
- A migração não mudou; nada novo para o job `restore`. O diff completo está em `diff-da-correcao.patch`.

## Justificativa

A etapa existe para que nenhuma coleta feita no morro vire "recusada" porque a pessoa, e não o dado, não vale mais para o servidor. A senha provisória é exatamente esse caso (a conta existe e a credencial está certa, falta um ato da própria pessoa) e é o procedimento padrão de recuperação de conta, então não era um canto raro. A decisão que o desenho pedia era ler o 403 pela ação do catálogo e não por uma lista de códigos: foi uma lista que deixou o código escapar, e a leitura pela ação fecha o próximo que o catálogo ganhar, deixando como permanente só o que é do papel ou do dado.

A autoria da foto é regra de negócio e mora no servidor, como pede o `CLAUDE.md`: o portão do aparelho reduz a janela, mas esconder o problema na tela não é controle de acesso. O campo `coletadaPor` é opcional pelo mesmo motivo do envelope da vistoria (aparelho com coleta gravada antes dele), e a conferência na confirmação não depende do aparelho declarar nada: quem confirma tem de ser quem autorizou. Por isso a corrida de troca de conta é fechada nos dois lados, e uma foto que nasceu na conta A não chega a ser escrita na trilha com o nome da conta B.

As duas correções de corrida eram pequenas e vieram juntas porque têm a mesma raiz: a pausa e o estado do item eram gravados com o retrato do momento em que a resposta chegou, e não com o do momento em que o pedido saiu. Reler o estado atual do item e atribuir a pausa ao autor resolve as duas sem mudar o contrato do motor.
