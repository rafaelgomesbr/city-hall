---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Campo "Impacto LGPD": "reforça o aviso antes de apagar dado de coleta; nenhum dado novo". E o "Risco de segurança": o apagamento é regra de privacidade para aparelho compartilhado (quem entra depois não vê o dado de quem saiu); a etapa só avisa, não muda a regra.

Inventário do que o aparelho de campo guarda (SQLite local `apps/campo/src/dados/banco-local.ts`): `rascunhos` (vistoria começada: checklist, observações, coordenada, caminho de fotos e assinatura), arquivos de foto e assinatura em disco, `pendencias`, `coletas` (lápide com protocolo e horário), `marcas` (de quem é o dado local), `fila_sincronizacao` (coletas já feitas e não enviadas), `preferencias` (tema, sem dado de pessoa), foto de perfil, credenciais no cofre.

O que apaga e quando (`banco-local.ts:298-396`, `apagarDadosLocais`):
- Saída explícita ("Sair da conta"): `DELETE FROM rascunhos; pendencias; marcas; coletas` (linha 345), arquivos de prova que nenhuma coleta da fila usa, foto de perfil, e esquece a conexão; credenciais e identidade zeradas antes (`dados/sessao.tsx` função `sair`, ficha de push calada no servidor).
- Troca de conta (`acolherNoAparelho`, linha 255): apaga o mesmo se o dono do disco for outra pessoa. Sem dono registrado não apaga (decisão declarada).
- Sessão vencida (`encerrarSessaoVencida`) NÃO apaga: o dado fica com a marca do dono; a correção 1 fechou o último caminho que apagava sem aviso (botão "Entrar de novo" da vistoria).
- O que NÃO apaga, de propósito: `fila_sincronizacao` e os arquivos que ela usa, porque são coletas feitas e não entregues. Quem entrar depois não consegue enviá-las (carimbo de autor, `packages/campo/src/fila.ts:77-125`, o dreno só envia o que é de quem está logado) e a lista da fila rotula "Coletada por <nome>" para o outro agente (`fila.tsx:369-390`).

O aviso (`dados/aviso-da-saida.ts`): conta os rascunhos (`listarRascunhos`), as fotos e a assinatura, diz que sair apaga, singular e plural, e se o disco não responde, avisa do mesmo jeito em vez de dizer "nada a perder"; a frase da fila é exata (continua guardada, só sobe com a sua conta). `perfil.tsx:1477` e `:1494` marcam `destrutiva: true`. O comentário de `banco-local.ts` (DoD da etapa) foi reescrito e confere com o código lido.

GPS (CMP-33): `precisaoDoGpsEmMetros` (`vistoria/[id].tsx:1521`) vira no mínimo 1; o esquema `gpsPrecisaoMetrosSchema = z.number().positive().nullable()` em `packages/shared/src/schemas.ts:369` não foi afrouxado; nenhum dado novo é coletado.

## Evidência

- `npx jest` nos cinco arquivos ligados (diálogo com 11 casos, sair e entrar sem perder a coleta, logout sem apagar prova, sessão vencida preserva o rascunho, vistoria ainda não baixada): 5 suítes, 33 testes, código 0 (`e15.txt`).
- `npx jest` completo do app de campo: 134 suítes, 1932 testes, código 0 (`campo-full.txt`).
- Mutação minha (D1): `destrutiva: true` virou `false` em `perfil.tsx:1477`, arquivo restaurado com `cmp` e `git status` limpo: o diálogo cai de 11 para 10 verdes, reprova exatamente "o botão de confirmar é o de perigo, porque o ato apaga" (`mut3.txt`). O defeito da rodada 4 está fechado.
- Base do gatekeeper (informada no prompt): `npm run typecheck` verde.
- Teste de leitura (E3a): `banco-local.ts`, `sessao.tsx`, `aviso-da-saida.ts`, `fila.ts`, `fila.tsx`; não há captura porque o app Expo não renderiza neste ambiente (limitação da própria etapa, registrada).

## Cenários positivos

Duas vistorias começadas, com foto e assinatura, no plural; uma só, sem foto, no singular; a fila esvazia sem trocar de aba e o aviso some; precisão 0,3 vira 1 e 12,4 vira 12; mesma pessoa que reentra após sessão vencida reencontra checklist, observações, assinatura e foto (`vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`).

## Cenários negativos

Sem rascunho e sem fila, o diálogo não fala em apagar; precisão ausente grava `null`; o esquema continua recusando 0 e negativo com mensagem em português; "Entrar de novo" não apaga nada; outro agente entrando no aparelho com o rascunho do primeiro faz `acolherNoAparelho` limpar (`sair-e-entrar-nao-perde-a-coleta.test.ts`); a saída explícita continua apagando (controle).

## Tentativas de reprovar

Li os dois pontos que chamam `apagarDadosLocais`/`sair()` e a lista de tabelas apagadas procurando uma tabela com dado de cidadão que escape: `fila_sincronizacao` escapa por decisão, e o tradeoff está escrito e testado; as demais saem. Procurei um caminho que apague rascunho sem passar pelo diálogo: só `acolherNoAparelho` (regra de isolamento entre agentes mantida, avisar o dono antes é do CP-24/F14-E02, registrado). Procurei texto do diálogo que prometa algo falso (por exemplo "ninguém mais consegue enviar" a coleta da fila): é verdade pelo carimbo de autor, mas os DADOS da coleta continuam legíveis no aparelho (ver Achados). Verifiquei que o esquema do servidor não foi afrouxado.

## Achados

- anotado (já registrado em `apps/campo/PENDENCIAS.md`, correção 1, donos F05-E09, F05-E10, F14-E02, F14-E04, F14-E15): a fila e seus arquivos não têm prazo no aparelho; JPEG e PNG de coleta enviada só saem no logout; o original da câmera no cache nunca é apagado; coordenada com seis casas; resíduo de WAL. A frase do diálogo "ninguém mais consegue enviá-la" é exata para ENVIO, mas o dado da coleta de outro agente fica gravado sem cifra no aparelho compartilhado e a lista da fila mostra quem coletou, até a F14-E04 (criptografia local).
- anotado: `apagarDadosLocais` falha aberta (se o banco local não responde, só `console.warn` e o aparelho segue com o dado, enquanto a tela já saiu). Também registrado como bloqueio de piloto (dono F14-E02, decisão do Rafael).
- anotado: `acolherNoAparelho` com dono nulo não apaga (janela de uma atualização, declarada).

## Não verificado

Os dois fluxos no aparelho ou emulador (vistoria começada e "Sair da conta"; GPS abaixo de 0,5 m concluindo sem 422): o app Expo não renderiza aqui, nenhuma captura do diálogo. Cobertura de disco real (os arquivos são nomes num conjunto simulado nos testes). Resíduo em WAL, cache da câmera e backup do sistema operacional. A resposta do servidor ao GPS corrigido contra uma API real.

## Risco residual

Dado de coleta não enviada e de outros agentes fica legível no aparelho compartilhado (sem cifra) até a F14-E04; sair falha aberto se o disco falhar.

## Motivo do humano

Validação humana prevista no bloco da etapa: Rafael faz os dois fluxos num aparelho e aprova as frases do diálogo. Só uma pessoa com o aparelho confere que o diálogo aparece com o botão de perigo e o texto certo na tela real, e que nada de dado de turno anterior sobra depois de sair.

### Itens do "Motivo do veredito" da rodada 4 que tocam privacidade

A rodada 4 reprovou a etapa por Testes (o caso do botão de perigo não mordia) e deu PASS de LGPD. O item é de qualidade do teste, mas toca o aviso antes de apagar: CONSERTADO na correção 2 (o arquivo do diálogo passou de 6 para 11 casos, incluindo disco quebrado e a segunda pergunta). Reproduzi o resultado (11 de 11 em `e15.txt`) e refiz a mutação D1 (a que a rodada 4 apontou): o teste agora morde. Não repeti as outras (E8, E8b, E9, C1, F3, O1) e dependo do relato do implementador para elas; a conferência completa é da dimensão Testes.
