---
validador: seguranca-aplicacao (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Risco ALTO: mordida exigida e feita.

1. O dado da vistoria e do agente não sobra para a próxima conta no aparelho: `acolherNoAparelho` limpa quando OUTRA pessoa entra; a mesma pessoa reencontra; a fila da primeira fica carimbada com o autor. PASS no caminho que a etapa toca (a regra não mudou); a falha aberta conhecida continua e é registrada como achado fora da etapa (C2).
2. O aviso de saída não perde dado: o diálogo conta rascunhos, fotos e assinatura e diz que sair apaga; "Entrar de novo" (sessão vencida, no Perfil, na lista, na fila e agora na tela da vistoria) derruba a credencial sem apagar. PASS.
3. Precisão do GPS: o app grava `Math.max(1, Math.round(accuracy))` e nulo para ausente, zero, negativo e não finito; o esquema compartilhado e a API recusam 0 e negativo com frase em português, sem afrouxar o `positive()`, também para cliente que não é o app. PASS (com achado C1, anterior à etapa).

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/seguranca-aplicacao-E10-E12-E15/`.

- E1: `cd dc360/apps/campo && npx jest` nos oito arquivos da etapa (`ui/dialogo-na-conta-com-vistoria-comecada`, `__tests__/vistoria-ainda-nao-baixada`, `__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete`, `__tests__/vistoria-sessao-vencida-preserva-o-rascunho`, `__tests__/a-sessao-vencida-nao-apaga-a-vistoria`, `dados/aviso-da-saida`, `dados/sair-e-entrar-nao-perde-a-coleta`, `dados/precisao-do-gps`), código 0, 8 suítes, 59 de 59 (`e15-02-jest-etapa.txt`).
- E2: sonda de API `sonda-e15-api.mts` (cliente HTTP que não é o app, corpo JSON cru na rota real `POST /sincronizacao/vistoria`, Fastify sobre PGlite), código 0 (`e15-01-sonda-api.txt`).
- E2: reprodução da falha aberta com um arquivo de teste TEMPORÁRIO (`apps/campo/src/dados/zz-sonda-validador-seguranca.test.ts`, cópia do arranjo SQLite de `sair-e-entrar-nao-perde-a-coleta.test.ts` com falha injetada no `DELETE FROM rascunhos`), rodado e APAGADO em seguida; `git status` limpo depois (`e15-03-sonda-falha-aberta.txt`).
- Conferência de que o `dist` do pacote compartilhado (que a API importa) corresponde à fonte do SHA: `tsc` da fonte para uma pasta do scratchpad e `diff -rq` contra `packages/shared/dist`: sem diferença.
- Mordida (mutação, rodada e desfeita com `git restore`; `dist/schemas.js` restaurado de cópia e conferido por SHA-256):
  - M1, sem o piso de 1 m em `dados/precisao-do-gps.ts`: 3 falhas (`e15-mut-M1-sem-piso.txt`).
  - M2, aviso de saída sem a frase dos rascunhos (`dados/aviso-da-saida.ts`): 8 falhas (`e15-mut-M2-aviso-ignora-rascunhos.txt`).
  - M3, Perfil sem ler os rascunhos no toque em "Sair da conta" (`perfil.tsx`): 2 falhas (`e15-mut-M3-perfil-nao-le-rascunhos.txt`).
  - M4, `acolherNoAparelho` sem limpar para outra pessoa (`dados/banco-local.ts`): 1 falha ("o Bruno entra: o rascunho da Ana é limpo") (`e15-mut-M4-acolher-nao-limpa.txt`).
  - M5, "Entrar de novo" da tela da vistoria chamando `sair` (`vistoria/[id].tsx`): 3 falhas (`e15-mut-M5-entrar-de-novo-chama-sair.txt`).
  - M6, esquema `nonnegative()` em vez de `positive()`: 2 falhas em `packages/shared/test/precisao-do-gps.test.ts` e 1 falha em `apps/api/test/precisao-do-gps-na-sincronizacao.test.ts` (mutação no `dist`) (`e15-mut-M6-esquema-nonnegative-*.txt`).

## Cenários positivos

- API: `gpsPrecisaoMetros` 1, 0,3 (cliente que não arredonda) e nulo: 201, gravado como enviado.
- Mesma pessoa que volta (sessão vencida): reencontra rascunho, foto e assinatura (testes da etapa verdes).
- Outra pessoa que entra com o disco saudável: recebe o aparelho sem o rascunho, e a coleta da primeira continua na fila, pendente, com o autor (teste da etapa verde; M4 prova que ele morde).

## Cenários negativos

- API, cliente que não é o app: 0, -0, -1 e -0,0001 dão 422 com `vistoria.gpsPrecisaoMetros: Precisa ser maior que 0`; `"1"`, `"abc"`, `true`, `{}` e `[1]` dão 422 com frase em português ("Era esperado um número, veio ..."); campo ausente dá 422 "Campo obrigatório". Nenhuma palavra em inglês no corpo.
- Esquema compartilhado direto: 0, -0, -1 e NaN recusados.
- Sem rascunho e sem fila, o diálogo não fala em apagar; disco que não responde faz o diálogo avisar do mesmo jeito (testes da etapa, mordidos por M2 e M3).

## Tentativas de reprovar

- Cliente que não é o app mandando valor fora do que o app produz: `1e400` (vira `Infinity` no `JSON.parse`) é ACEITO com 201 e gravado como `Infinity`, e `1e-320` é aceito; o laudo emitido pela rota imprime "Infinity metros" e "1e-320 metros". Ver achado C1.
- Conta de outra pessoa herdando rascunho quando a limpeza do banco falha no meio: reproduzido em `bb0f654`. `acolherNoAparelho(BRUNO)` com o `DELETE FROM rascunhos` falhando devolve `apagou=true`, o Bruno lista 1 rascunho da Ana com a observação ("Trinca na parede dos fundos.") e o nome de quem assinou, as fotos e a assinatura do rascunho são apagadas, e no segundo login do Bruno `apagou=false` (o dono já virou ele). Ver achado C2.
- Caminho de saída que apague sem passar pelo diálogo: a busca da correção 1 (único `sair()` no Perfil) confere com o código (`perfil.tsx:1479`; `vistoria/[id].tsx` usa `encerrarSessaoVencida`, e M5 prova o teste).
- `dist` desatualizado escondendo diferença entre o que a API valida e a fonte: não há diferença.

## Achados

- **C1, corrige antes de crescer (médio, ASVS 5.1.4, integridade de documento):** `gpsPrecisaoMetrosSchema = z.number().positive().nullable()` aceita `Infinity` e subnormais. Reprodução: `sonda-e15-api.mts`, corpo cru com `"gpsPrecisaoMetros":1e400`: 201, `vistorias.gps_precisao_metros = Infinity`, e `GET /documentos/<id>/laudo` imprime "Infinity metros"; com `1e-320`, "1e-320 metros". Um agente autenticado com cliente próprio grava precisão absurda num documento jurídico. A coluna é `double precision` sem `CHECK`, então a regra só mora no pacote compartilhado (a do projeto pede banco também). ANTERIOR à etapa: o esquema em `afde25c` é idêntico (`schemas.ts:411`), e a etapa só o extraiu sem afrouxar, que é o que ela pedia; por isso não reprova a E15. Conserto sugerido: `.finite()` e um teto plausível no esquema e `CHECK (gps_precisao_metros IS NULL OR (gps_precisao_metros > 0 AND gps_precisao_metros < <teto>))` no banco.
- **C2, repetido, fora do critério da etapa, bloqueio de piloto (seção 7 de `28`, item 3, sem risco aceito):** `acolherNoAparelho` falha aberto entre pessoas (`dados/banco-local.ts:255-261` com `apagarDadosLocais` engolindo o erro em `:298-349`). Reproduzido acima em `bb0f654`. Já registrado em `docs/roadmap-v2/pendencias-humanas.md:69` com dono F14-E02, mas o bloco da V2-F14-E02 (`docs/roadmap-v2/10-campo-reinspecao.md:406-432`) continua sem o critério de falha fechada e sem injeção de falha de disco. O bloco da E15 diz que a etapa só avisa e não muda a regra, então não reprova a E15.

## Não verificado

- Aparelho físico ou emulador: o app Expo não renderiza aqui; não vi o diálogo na tela, nem o apagamento real no disco do Android (`expo-file-system` é simulado por um conjunto de nomes nos testes), nem resíduo de WAL do SQLite, nem a limpeza do cofre seguro e da ficha de push no aparelho.
- O Perfil com sessão e banco reais no fluxo "Sair da conta" (o teste do diálogo usa dublê de `sair`).
- A fila de outro autor na tela da fila (regra da E06, fora desta etapa).
- O run do CI do SHA (não lido) e o `test:campo` completo (rodei os oito arquivos da etapa).

## Risco residual

C2 continua sendo vazamento de dado de morador entre agentes no mesmo aparelho quando o disco falha, e precisa entrar como critério da F14-E02 antes de qualquer piloto. C1 deixa precisão infinita ou subnormal chegar ao laudo por cliente próprio. No que a etapa entrega (aviso de saída, "Entrar de novo" sem apagar, piso do GPS, recusa de 0 e negativo em português), os testes existem e mordem.

## Motivo do humano

Aparelho físico: os dois fluxos que a etapa pede (vistoria começada e "Sair da conta" com o diálogo listando o que apaga; vistoria concluída com GPS simulado abaixo de 0,5 m sem 422) e o toque em "Entrar de novo" na faixa da vistoria com rascunho no disco precisam ser feitos num aparelho, porque o app não roda neste ambiente.
