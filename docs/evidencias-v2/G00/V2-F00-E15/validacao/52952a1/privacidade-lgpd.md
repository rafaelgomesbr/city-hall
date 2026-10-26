---
validador: privacidade-lgpd (agente general-purpose com o papel da dimensão)
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica. Base legal, papéis, prazo de guarda do dado de coleta e redação do aviso de privacidade ficam para pessoa. `$SP` é a pasta de trabalho da sessão do gatekeeper (`.../scratchpad`).

## Resposta à pergunta da rodada: `acolherNoAparelho` é critério da E15?

NÃO, pelo texto do bloco, mas é um defeito real de LGPD (vazamento entre pessoas) que continua mordendo e que não pode ficar sem dono. Fundamento, com o texto do bloco:

- "Risco de segurança: o apagamento é regra de privacidade para aparelho compartilhado (quem entra depois não vê o dado de quem saiu); **a etapa só avisa, não muda a regra**."
- "Impacto LGPD: reforça o aviso antes de apagar dado de coleta; **nenhum dado novo**."
- "O que NÃO deve ser implementado: preservar o rascunho depois de sair (decisão do CP-24 em F14-E02); criptografia local (F14-E04)."
- "Testes de autorização e isolamento: outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa **(regra mantida)**; a mesma pessoa reencontra a vistoria."
- "Definition of Done: 7 testes verdes; diálogo conta rascunhos; GPS excelente conclui; comentário de `banco-local.ts` verdadeiro; itens de integridade do campo do G00 marcados."

O que o bloco exige de `acolherNoAparelho` é o caso feliz (leitura sã do disco: outra pessoa entra, o rascunho some; a mesma pessoa reencontra), e esse caso passa e está travado por teste (abaixo). Nenhum critério pede robustez diante de falha de disco. O código de `acolherNoAparelho` e de `apagarDadosLocais` não mudou na fase: `git diff afde25c..52952a1 -- dc360/apps/campo/src/dados/banco-local.ts` só traz comentário (13 linhas acrescentadas, 1 removida; conferi que a lógica é a mesma). A arbitragem da rodada 2 (anterior à F00, dono F14-E02) está correta quanto ao enquadramento.

Mas o defeito é item 3 da seção 7 de `28` ("vazamento de dado pessoal ou de dado de outra equipe"), logo não admite risco aceito, e merece dois reparos que levo ao gatekeeper:

1. O bloco da F14-E02 (`docs/roadmap-v2/10-campo-reinspecao.md:406-440`), que é o dono declarado, NÃO tem critério de falha fechada: pede que `acolherNoAparelho` "confirme, nomeando o dono anterior", e testes de `acolherNoAparelho`, `marcarDonoDosDadosLocais` e `sair()` "com SQLite em memória", sem injetar falha do disco. Se o texto ficar assim, a F14-E02 pode fechar verde com o defeito dentro. Sugiro acrescentar ao bloco: "erro de leitura da marca ou de apagamento recusa a entrada da pessoa seguinte (ou repete e confere que `listarRascunhos()` voltou vazio antes de marcar o novo dono), com teste que injeta a falha nos dois pontos". Hoje o registro está só em `docs/roadmap-v2/pendencias-humanas.md:65`.
2. O comentário de `banco-local.ts` sobre a regra (`OUTRA pessoa entra: tudo é apagado antes de a sessão abrir, exatamente como na saída explícita`, acima de `acolherNoAparelho`, linha 255) é incondicional e, na prática, não vale sob falha. O DoD diz "comentário de `banco-local.ts` verdadeiro" e, no que o bloco trata (o diálogo contar rascunhos), o comentário hoje é verdadeiro; este outro comentário não faz parte do que a etapa corrigiu, mas anoto para a F14-E02 qualificar a frase.

## Critérios verificados

### Inventário do que fica no aparelho compartilhado

| Dado | Onde | Sair da conta | Entrar de novo (sessão vencida) | Outra pessoa entra |
| --- | --- | --- | --- | --- |
| rascunho (checklist, observações, nome de quem assinou, coordenada), tarefas, lápides, marca de dono | SQLite `rascunhos`, `pendencias`, `coletas`, `marcas` | apagados (`apagarDadosLocais`, `banco-local.ts:298`) | ficam, com a marca de dono | apagados em `acolherNoAparelho` (`:255`) antes de a sessão abrir, SE a leitura da marca e o apagamento funcionarem |
| foto e assinatura de rascunho | `Paths.document` (`foto-<n>-<n>.jpg`, `assinatura-<n>.png`) | apagadas se nenhum item da fila as usa | ficam | apagadas se nenhum item da fila as usa |
| fila de envio e seus arquivos | `fila_sincronizacao` e disco | ficam, por decisão documentada | ficam | ficam; só sobem com a conta do autor (carimbo em `packages/campo/src/fila.ts`) |
| token e identidade | SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) | apagados | apagados | substituídos |
| original da câmera no cache | cache do sistema | não alcançado | idem | idem (nenhuma referência a `Paths.cache` em `src/`) |

### Controles da etapa, reverificados

1. O diálogo "Sair da conta?" conta rascunhos e fotos e diz que sair apaga (`dados/aviso-da-saida.ts`, `perfil.tsx`); sem rascunho nem fila volta à frase curta.
2. "Entrar de novo" (sessão vencida) não apaga: a tela da vistoria usa `encerrarSessaoVencida` (`sessao.tsx:241`), que marca o dono e esquece a credencial. O único `apagarDadosLocais` alcançado por ato do usuário é o de `sair()` (`sessao.tsx:229`), atrás do diálogo.
3. Troca de pessoa: `acolherNoAparelho` roda em `entrar` antes de guardar credenciais (`sessao.tsx:185`).
4. GPS: `precisao-do-gps.ts`, `Math.max(1, Math.round(...))`, ausente/zero/negativo gravam nulo; só arredonda o que já era gravado, não cria dado.
5. Novidade do diff `4b96ea7..52952a1` que toca dado pessoal no aparelho (E16, correção 2): `guardarFotoNoAparelho` agora espera a cópia (`await new File(uri).copy(destino)`) e apaga o arquivo parcial ou vazio quando a cópia falha (`apagarFotoDoAparelho`). Isto REDUZ dado de morador deixado órfão em `Paths.document`: positivo para a dimensão.

## Evidência

- `cd dc360/apps/campo && npx jest aviso-da-saida sair-e-entrar dialogo-na-conta vistoria-sessao-vencida vistoria-ainda-nao-baixada precisao-do-gps a-sessao-vencida troca-de-conta`: 9 suítes, 50 testes, 0 falha (`$SP/val/privacidade-lgpd/41-jest-campo-e15.txt`). Entre elas `sair-e-entrar-nao-perde-a-coleta.test.ts` (SQLite real do Node: mesma pessoa reencontra com foto e assinatura; Bruno entra e o rascunho da Ana é limpo; fila intacta; saída explícita apaga só o rascunho) e `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`.
- Sonda própria `$SP/val/privacidade-lgpd/sondas-campo/e15-lgpd.test.ts` (`40-sonda-e15.txt`), com `banco-local.ts` e `rascunho.ts` REAIS sobre SQLite do Node (a mesma técnica de mock de `expo-sqlite` e `expo-file-system` do teste da etapa), mudando só a resposta do disco. O rascunho da Ana tem observação de saúde ("moradora com mobilidade reduzida"), nome de quem assinou e coordenada:

| Caso | `apagou` | Rascunhos que o Bruno vê | Dono depois | Observação |
| --- | --- | --- | --- | --- |
| controle: disco são | true | 0 | Bruno | o comportamento que o bloco exige |
| A: a leitura da marca de dono falha | false | 1 | Bruno | herda tudo |
| B: a marca existe e o `DELETE FROM rascunhos` falha | **true** | 1 | Bruno | a função DIZ que apagou |
| C: aparelho sem marca (dado de versão anterior) | false | 1 | Bruno | decisão documentada (janela de atualização) |
| D: igual a B, com foto e assinatura da Ana em disco | true | 1 (texto, nome de quem assinou e coordenada intactos) | Bruno | os ARQUIVOS de foto e assinatura sumiram do disco, o texto ficou |
| E: `apagarDadosLocais` sem falha injetada | n/a | 0 | marca apagada | arquivos apagados também |

  O caso B é a "forma nova" que a segurança reportou: `apagarDadosLocais` isola cada passo e engole a falha (`catch` com `console.warn`, `banco-local.ts:347-348`), então `acolherNoAparelho` devolve `apagou: true` com o rascunho ainda no disco e depois grava Bruno como dono. Reproduzi. O caso D mostra um agravante que as sondas anteriores não mediram: o apagamento dos ARQUIVOS roda mesmo quando a limpeza do banco falhou (o passo seguinte é independente), então o resultado é o pior dos dois mundos: o dado textual do morador (observação de saúde, nome, coordenada) fica exposto para a pessoa seguinte e a prova material (foto, assinatura) da pessoa anterior é perdida.
- Mordida: o teste do bloco "outro agente entra ... `acolherNoAparelho` limpa" morde o caso feliz (a segurança mostrou M15 nesta rodada; não repeti a mutação, ver Não verificado). Nenhum teste do repositório cobre A, B nem D: a sonda é a única prova.

## Cenários positivos

Mesma pessoa reencontra checklist, observações, foto e assinatura; o diálogo conta no singular e no plural; precisão 0,3 vira 1.

## Cenários negativos

Outra pessoa não recebe rascunho, foto nem assinatura da anterior (disco são); saída explícita apaga; a fila de uma pessoa não sobe com a credencial de outra; precisão ausente grava nulo; o esquema recusa 0 e negativo.

## Tentativas de reprovar

- Falha de leitura da marca: a pessoa seguinte herda o rascunho (A).
- Falha no meio da limpeza: herda, e a função diz que apagou (B); os arquivos somem e o texto fica (D).
- Aparelho sem marca: herda (C, decisão documentada).
- Procurei outro caminho de login que pule `acolherNoAparelho`: `entrarNaApi` só é chamado em `sessao.tsx`; a restauração de sessão só marca o dono.
- Procurei caminho de saída que apague sem avisar: o único `sair()` está atrás do diálogo.
- Procurei os achados LGPD abertos das rodadas 1 e 2 e reexecutei: fila e arquivos sem prazo (sem mudança), JPEG e PNG de coleta confirmada só saem no logout (sem mudança), original da câmera no cache nunca apagado (nenhuma referência a `Paths.cache`), coordenada com 6 casas (`vistoria/[id].tsx:1516-1517`, `toFixed(6)`, sem mudança). Todos continuam abertos e com dono em `apps/campo/PENDENCIAS.md` (F05-E09, F05-E10, F14-E02, F14-E04).

## Achados

1. corrige antes de crescer, e ANTES DE QUALQUER PILOTO (item 3 da seção 7 de `28`, sem risco aceito). `acolherNoAparelho` falha aberto, com as formas A, B e D acima. Fora do critério da E15 (ver a resposta no início); dono F14-E02, com a lacuna de que o bloco da F14-E02 não pede falha fechada nem injeta falha de disco (ver reparo 1). Reprodução: `$SP/val/privacidade-lgpd/sondas-campo/e15-lgpd.test.ts` com `npx jest --roots <pasta> --rootDir .` em `apps/campo`. Conserto sugerido: `apagarDadosLocais` devolver se terminou; `acolherNoAparelho` só marcar o novo dono quando `listarRascunhos()` voltar vazio; caso contrário recusar a entrada; e os dois passos (banco e arquivos) nunca divergirem (se o banco falhou, não apagar os arquivos).
2. corrige antes de crescer (F05-E09, F05-E10, F14-E04). Fila e arquivos sem prazo de guarda; JPEG e PNG de coleta confirmada ficam até o logout; original da câmera no cache; resíduo de WAL. Decisão "Entrar de novo não apaga" aumenta o tempo em claro num aparelho sem sessão; sem criptografia local, é risco aceito pelo desenho a decidir no CP-24.
3. anotado. Coordenada gravada com 6 casas (cerca de 0,11 m); 5 casas bastariam.
4. anotado. O rascunho não carrega o autor; uma coluna de dono por linha daria segunda barreira.
5. anotado. A marca de dono só protege aparelho que já tinha a marca (janela de atualização).

## Não verificado

- Aparelho ou emulador: não há emulador Android nesta máquina e não subi build no Simulador de iOS. Os fluxos "começar vistoria e Sair da conta" e "concluir com GPS abaixo de 0,5 m" não foram executados em aparelho por mim; a prova é jest com SQLite real do Node e arquivos simulados por nome.
- Falha real do SQLite do Android: a sonda simula a falha no ponto de leitura e no de apagar. Não sei se um erro assim ocorre de fato com `expo-sqlite`; a gravidade depende dessa frequência.
- Mordida independente do teste do caso feliz de `acolherNoAparelho` (a segurança reportou M15 vermelho nesta rodada; citei como alegação, não repeti).
- Envelope exato da fila (campos do morador) e a tela da fila renderizada para o segundo agente.
- Aviso de privacidade, DPIA, contratos, transferência internacional (push, mapas): fora da dimensão técnica.

## Risco residual

Médio, herdado: dado de moradores (identificação, imagem do imóvel, assinatura, coordenada, observação de saúde) em claro e sem prazo de guarda num aparelho compartilhado, e a limpeza entre pessoas falha aberta sob erro de disco. A etapa informa o agente do que sai e do que fica e não piora o quadro.

## Motivo do humano

Base legal, papéis de controlador e operador, prazo de guarda do dado de coleta (inclusive item de outro autor) e redação do aviso de privacidade são decisão jurídica e de gestão. Rafael faz os dois fluxos num aparelho (campo "Validação humana" do bloco), incluindo tocar em "Entrar de novo" na faixa da vistoria com rascunho no disco.
