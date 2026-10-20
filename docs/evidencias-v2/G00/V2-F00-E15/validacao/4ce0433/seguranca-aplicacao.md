---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Tudo rodado num worktree esparso do validador no SHA `4ce0433`, com o `node_modules` do app por link para a árvore principal. Mutações aplicadas e desfeitas por roteiro, com o `git status` do worktree limpo no fim de cada uma.

- **"O diálogo usa o botão destrutivo" e o teste morde** (critério que reprovou a rodada 4): mutação D1 (`destrutiva: false` na ação "Sair da conta" de `perfil.tsx`): reprova "a pergunta antes de sair, com vistoria começada › o botão de confirmar é o de perigo, porque o ato apaga" (`saidas/e15/D1-sair-nao-e-destrutivo.txt`). CONSERTADO.
- **Os 7 testes da etapa e os novos verdes**: os nove arquivos do diálogo, da saída, da sessão, do token e da troca de conta, 65 de 65 (`00-base.txt`); o jest inteiro do app, 1932 de 1932 em 134 suítes, código 0 (`01-jest-completo-sem-mutacao.txt`); a rota do GPS na API, 3 de 3 (`03-api-precisao-do-gps.txt`). PASS.
- **O que é apagado ao sair** (comportamento): sonda própria com o provedor de sessão, o banco local e o rascunho REAIS sobre SQLite do Node (`02-sonda-troca-de-conta.txt`, 6 de 6): "Sair da conta" tira credencial e identidade do armazenamento seguro e `obterToken()` devolve nulo; a sessão vencida também tira as duas do cofre e deixa o rascunho (regra da etapa). PASS no produto.
- **Credenciais no armazenamento seguro**: toda gravação no cofre usa `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` (`expo-secure-store`, `dados/sessao.tsx`), conferido na sonda (caso C1); o token nunca vai para `AsyncStorage` nem para o banco local. PASS no produto.
- **Teste de autorização e isolamento da etapa: "outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa; a mesma pessoa reencontra a vistoria"**: o produto faz isso (sonda, caso A1: a sessão da Ana vence, o Bruno ENTRA pelo `entrar` do provedor real e não vê rascunho, foto nem assinatura da Ana; caso A2, a Ana volta e reencontra). Mas a prova da etapa NÃO morde na regressão real: tirar a chamada `await acolherNoAparelho(...)` de `entrar` em `dados/sessao.tsx` (mutação S9) deixa o jest INTEIRO verde, 1932 de 1932 (`S9-entrar-sem-acolher-completo.txt`). FAIL (detalhe em Achados).
- **Nada da conta anterior acessível à seguinte**: com S9 aplicada, a sonda reprova: o Bruno, recém-entrado, lê pelo `listarRascunhos` o rascunho da Ana (esperado 0, recebido 1; `sonda-sob-mutacao/S9-entrar-sem-acolher.txt`). Hoje o produto está certo; nada no repositório impede a volta do defeito.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L12-seguranca/saidas/e15/`:

- `00-base.txt`: `npx jest <9 arquivos>` (lista em `arquivos.txt`), 65 de 65, código 0.
- `01-jest-completo-sem-mutacao.txt`: `npx jest`, 1932 de 1932, código 0.
- `02-sonda-troca-de-conta.txt`: a sonda `../../sonda/zz-troca-de-conta-validador.test.tsx`, copiada para `src/__tests__/` do worktree só durante a execução e apagada depois. Só o cofre, a rede (`dados/api`) e o disco de arquivos são simulados.
- `RESUMO-mutacoes.txt` e `S*.txt`, `D1*.txt`: cada mutação contra os nove arquivos; `RESUMO-mutacoes-completo.txt` e `*-completo.txt`: as que sobreviveram, contra o jest inteiro; `S2-repeticao/`: as duas suítes que caíram por SIGSEGV do worker na rodada completa da S2, repetidas isoladas (17 de 17 verdes).
- `sonda-sob-mutacao/`: a sonda do validador sob S1, S2, S6, S9 e S10; cada uma reprova exatamente o caso que deveria.
- Roteiro das mutações: `../../sonda/mutar-campo.py`.

## Cenários positivos

- A mesma pessoa que tem a sessão vencida entra de novo e reencontra o rascunho (sonda A2; `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`).
- "Sair da conta" apaga rascunho, fotos e assinatura e mantém a fila do autor (testes da etapa; S3 e S4 mordem).
- Gravações no cofre com acessibilidade restrita ao aparelho desbloqueado (sonda C1).
- Precisão 0 recusada pela API com frase em português; 1 e nulo aceitos (`03`).

## Cenários negativos

- Outra pessoa entrando depois de sessão vencida: aparelho limpo antes de abrir a sessão (sonda A1, verde no produto).
- Depois de "Sair da conta" e da entrada do Bruno, nenhum valor da credencial nem o id da Ana sobra no cofre (sonda C4).
- Item da fila de outro autor não é enviado com a credencial de quem está no aparelho (portão de autoria em `packages/campo/src/fila.ts`, lido; o dreno filtra por `autoriaDaColeta === "propria"`).

## Tentativas de reprovar

| Mutação | O que simula | Nove arquivos | Jest inteiro (1932) | Sonda do validador |
| --- | --- | --- | --- | --- |
| D1 | botão de sair não destrutivo | 1 reprova | n/a | n/a |
| S1 | `acolherNoAparelho` nunca apaga | 1 reprova | n/a | A1 reprova |
| S2 | `sair` não tira a credencial do cofre | verde | **verde** | C2 reprova |
| S3 | `sair` não apaga o dado local | 1 reprova | n/a | n/a |
| S4 | limpeza poupa `rascunhos` | 3 reprovam | n/a | n/a |
| S4b | limpeza poupa `coletas` | verde | 1 reprova (`coletas.test.ts`) | n/a |
| S6 | sessão vencida não tira a credencial do cofre | verde | **verde** | C3 reprova |
| S7 | `sair` mantém a credencial na memória | 1 reprova | n/a | n/a |
| S8 | `sair` mantém a foto de perfil local | verde | **verde** | n/a |
| S9 | `entrar` sem `acolherNoAparelho` | verde | **verde** | A1 reprova |
| S10 | `sair` não tira a identidade do cofre | verde | **verde** | C2 reprova |

Também li o caminho da fila de outro autor na tela: o agente seguinte vê o protocolo, o nome de quem coletou e a data, e pode descartar a coleta do colega (com o nome dele na pergunta e confirmação). Não é envio com credencial trocada, e é desenho de outra etapa (ver Achados).

## Achados

1. **bloqueia.** O teste de isolamento que a etapa pede ("outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa") é provado só no nível da função. `src/dados/sair-e-entrar-nao-perde-a-coleta.test.ts`, caso "o Bruno entra: o rascunho da Ana é limpo", chama `acolherNoAparelho(BRUNO)` direto, sem passar pelo `entrar` do `ProvedorDeSessao`; nenhum teste do app passa pelo provedor real com troca de pessoa, e o dublê de `src/push/logout-cala-o-aparelho.test.tsx` devolve `{ apagou: false }` fixo. Reprodução: apagar a linha `await acolherNoAparelho(r.identidade.usuarioId);` de `apps/campo/src/dados/sessao.tsx` e rodar `npx jest` em `apps/campo`: 1932 de 1932 verdes; com a mesma mutação, a sonda do validador mostra o Bruno lendo o rascunho da Ana. Em etapa de risco alto, com o caso nomeado pelo comportamento ("o Bruno entra") e a mutação realista verde, é a mesma classe de defeito que reprovou a rodada 4 (prova que não morde). Conserto mínimo: um caso com o provedor real (Ana entra, cria rascunho, sessão vence, Bruno entra por `entrar`, rascunho e provas somem), como os casos A1 e A2 da sonda.
2. **corrige antes de crescer.** Nenhum teste prende que "Sair da conta" e a sessão vencida tiram a credencial e a identidade do armazenamento seguro (S2, S6 e S10 verdes no jest inteiro). Hoje o código tira (sonda C2 e C3). Sem isso, uma regressão deixaria o token de renovação no chaveiro de um aparelho de plantão depois da saída, e com a saída sem sinal o servidor nem fica sabendo. Não é o escopo declarado da etapa (que não mexe em credencial), por isso não reprova sozinho.
3. **anotado.** A cópia local da foto de perfil sair do aparelho no logout não é presa por teste (S8 verde). Fora do escopo da etapa.
4. **anotado.** A frase do diálogo para coleta na fila diz "ninguém mais consegue enviá-la" e "Ela volta a subir quando você entrar de novo"; a tela da fila deixa o agente seguinte DESCARTAR a coleta de outro autor (`podeDescartar = parada || autoria !== "propria"` em `app/(agente)/fila.tsx`, com o nome do autor na pergunta). A frase não é falsa sobre o envio, mas promete a volta sem dizer que o colega pode apagar. O descarte é da tela da fila (E06), não desta etapa.

## Não verificado

- Aparelho ou emulador: o app Expo não roda aqui. O cofre (`expo-secure-store`), o disco (`expo-file-system`) e o SQLite nativo foram simulados; a garantia do chaveiro do Android e do iOS não foi observada (é a pendência humana da etapa e da F14-E12).
- Resíduo físico no armazenamento depois de apagar (WAL do SQLite, cache da câmera): fora desta etapa, registrado em `apps/campo/PENDENCIAS.md` como achado de LGPD com dono.
- Dono nulo em `acolherNoAparelho` e falha aberta da limpeza (o `apagarDadosLocais` engole o erro e o login segue): registrados pela própria etapa como fora de escopo (F14-E02, decisão do Rafael); não testados por esta dimensão.
- Criptografia do banco local: F14-E04, fora da etapa.

## Risco residual

O aparelho de plantão é compartilhado entre turnos. A regra que impede o agente da noite de ver o rascunho do agente do dia (endereço, contato e vulnerabilidade de família, foto e assinatura) depende de uma linha em `entrar` que nenhum teste protege; uma refatoração do login que a perca passa pela suíte inteira. O mesmo vale para a limpeza do cofre na saída. Hoje as duas funcionam.

## Motivo do humano

A validação humana da etapa continua aberta: Rafael faz os dois fluxos num aparelho (vistoria começada e "Sair da conta"; GPS simulado abaixo de 0,5 m concluindo sem 422) e aprova as frases do diálogo. Também só num aparelho real dá para confirmar que o chaveiro guarda a credencial com a proteção pedida e que ela some de fato ao sair.

Itens do "Motivo do veredito" da rodada 4:

- "O caso do botão de perigo não confere o tipo do botão (mutação `destrutiva: false` verde)": CONSERTADO. Com D1 o caso reprova (`D1-sair-nao-e-destrutivo.txt`).
- "E8 continua sem teste (corrigir junto)": CONSERTADO pelo que a correção 2 declara; os casos de disco que falha estão entre os 65 verdes e a correção arquivou as mutações E8 e E8b. Não repeti E8 por ser de QA e Testes; a mordida que repeti foi a D1.
- O FAIL desta rodada é outro: a mesma regra de "prova que morde", aplicada ao teste de isolamento entre agentes que a etapa pede.
