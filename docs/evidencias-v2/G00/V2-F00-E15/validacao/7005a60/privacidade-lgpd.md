---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E3a, E1]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e este relatório não é parecer jurídico. Cobre a parte técnica (inventário, fluxo, controles, evidência). Base legal e papéis de controlador e operador ficam para pessoa.

## Critérios verificados

Impacto LGPD declarado pela etapa: "reforça o aviso antes de apagar dado de coleta; nenhum dado novo". A etapa "só avisa, não muda a regra".

1. Nenhum dado novo guardado. Diff `afde25c..7005a60 -- dc360/apps/campo/src`: os arquivos novos são `aviso-da-saida.ts` (só conta e redige texto), `precisao-do-gps.ts` (arredonda um número que já era gravado), `pausa-da-fila.ts`. Nenhuma coluna, chave de SecureStore ou arquivo novo. Nenhuma linha nova de `console.*` em `aviso-da-saida.ts` nem em `perfil.tsx` (grep sem resultado): o aviso não loga conteúdo.
2. O aviso de saída é fiel ao que `apagarDadosLocais` faz. `aviso-da-saida.ts` diz que sair apaga rascunho, fotos e assinatura "sem volta" e que a fila continua guardada e só sobe com a conta do autor. Confirmado por execução abaixo (rascunho e arquivos do rascunho somem; fila e arquivos dela ficam).
3. Troca de agente. `acolherNoAparelho` (`banco-local.ts:252-258`) apaga quando o dono é outro. Executado: dono A marcado, C entra, `apagou:true`, rascunhos, pendências, coletas e marcas zerados.
4. Precisão do GPS. `precisao-do-gps.ts:16-19`: `Math.max(1, Math.round(p))`, nulo se ausente, zero ou negativo. Só arredonda para cima a precisão informada, não cria dado. A coordenada em si é gravada com `toFixed(6)` (`vistoria/[id].tsx:1510-1511`, cerca de 0,11 m): ver achado 4.

## Evidência

Inventário do que fica no aparelho (por leitura de `banco-local.ts`, `evidencia-no-disco.ts`, `Assinatura.tsx:209`, `sessao.tsx:77-84`):

| Dado | Onde | Apagado na saída explícita? |
|---|---|---|
| Rascunho (checklist, texto livre, coordenada, caminhos) | SQLite `rascunhos` | sim (`DELETE`, `banco-local.ts:341`) |
| Tarefas (endereço, contato) | SQLite `pendencias` | sim |
| Lápide (protocolo, horário) | SQLite `coletas` | sim |
| Dono dos dados | SQLite `marcas` | sim |
| Fila de envio (envelope com a vistoria, coordenada, autor) | SQLite `fila_sincronizacao` | NÃO, por decisão documentada (`banco-local.ts:305-322`) |
| Foto de imóvel e assinatura de morador | `Paths.document` (`foto-*.jpg`, `assinatura-*.png`) | só os que nenhum item da fila referencia (`banco-local.ts:363-379`) |
| Original da câmera | cache do sistema | NÃO (nenhum código apaga ou lê `Paths.cache`) |
| Token e identidade | SecureStore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | sim (`sessao.tsx:221-222`) |
| Ficha do push | SecureStore | sim, depois de usada (`sessao.tsx:238`) |
| Tema | SQLite `preferencias` | não, de propósito, sem dado pessoal |
| Foto de perfil do agente | cópia local | sim (`apagarFotosLocais`, `banco-local.ts:387`) |

Execução com os módulos reais (`banco-local.ts` sobre SQLite em memória do Node, `expo-file-system` simulado), teste temporário `apps/campo/src/dados/zz-validacao-lgpd-tmp.test.ts`, rodado com `npx jest` (saída: PASS, 1 teste; arquivo apagado em seguida). Estado semeado: rascunho com morador e coordenada, 1 item de fila do agente A com envelope, foto e assinatura, arquivos órfãos de rascunho, um arquivo do cache.

- Depois de `apagarDadosLocais()`: `{"rascunhos":0,"pendencias":0,"coletas":0,"marcas":0,"fila":1,"disco":["assinatura-1.png","cache-camera-xyz.jpg","foto-1-0.jpg"]}`. Os órfãos `foto-2`, `assinatura-2`, `foto-3` foram apagados. A linha da fila ficou legível com nome e CPF do morador e coordenada com 6 casas, e os arquivos dela ficaram.
- Agente B entra depois da saída de A (marca de dono já apagada): `acolherNoAparelho` devolve `apagou:false`, a fila de A e os arquivos dela seguem lá.
- Dono A ainda marcado (sessão vencida), C entra: `apagou:true`, mas `fila=1` e os 3 arquivos seguem.

## Cenários positivos
- Saída explícita apaga rascunho, tarefas, lápides e os arquivos de rascunho que a fila não referencia.
- Troca de pessoa com dono marcado limpa antes de a sessão abrir.
- Token e identidade saem do SecureStore antes de a chamada ao servidor (`sessao.tsx:217-231`), sem depender de sinal.

## Cenários negativos
- B vê dado de A? Pela interface: a tela da fila (`fila.tsx:369-390`, `1224-1225`, `1808-1818`) mostra de coleta de outro autor só protocolo e nome de quem coletou, e oferece "descartar". Não mostra o envelope. O envio é bloqueado por `autoriaDaColeta` (`packages/campo/src/fila.ts:292`, `501`). Provado por leitura (E3a); a tela não foi renderizada.
- Pelo disco: o envelope e os arquivos de A ficam no armazenamento privado do aplicativo, legíveis para o próprio aplicativo. Sem criptografia (F14-E04, fora do escopo).
- Dado de A fica indefinidamente se A nunca mais entrar e ninguém descartar: não há prazo para item de outro autor.

## Tentativas de reprovar
- Procurei dado não coberto pela limpeza: fila, arquivos da fila, cache da câmera, páginas livres do SQLite (`DELETE` sem `VACUUM`). Encontrei os três primeiros (achados 1 a 3).
- Procurei arquivo de prova com nome fora do padrão `EVIDENCIA_NO_DISCO` (`banco-local.ts:52`) que escapasse da varredura. Todos os gravadores (`evidencia-no-disco.ts:46`, `Assinatura.tsx:209`) usam o padrão; não achei escape.
- Procurei log de conteúdo no que a etapa tocou: nenhum. Os `console.warn` do módulo registram só mensagens fixas e o objeto de erro.
- Procurei caminho em que o aviso minta: o aviso de falha de leitura (`rascunhos === null`) continua dizendo que sair apaga. Não achei mentira.
- Procurei GPS com precisão maior que a necessária no que a etapa mudou: a etapa não mexe na coordenada. Ver achado 4.
- Não encontrei caso em que a etapa piore a privacidade. As falhas desta dimensão já existiam antes do SHA.

## Achados

1. Corrige antes de crescer. A saída explícita não apaga "tudo": a fila e os arquivos dela (foto de imóvel, assinatura de morador) ficam, inclusive depois da troca de agente. É decisão consciente e agora o diálogo a diz com exatidão, mas o prazo é indefinido. Reprodução: teste temporário acima. Reavaliar na F14-E02 (CP-24) e F14-E04 (criptografia): definir prazo máximo de guarda para item de outro autor e para item bloqueado.
2. Corrige antes de crescer. Arquivos de prova são apagados só no logout. Depois que a coleta é confirmada e sai da fila (`limparConfirmados`, `packages/campo/src/fila.ts:1057-1066`) ou é descartada (`fila.ts:1253-1275`), os JPEG e PNG ficam em `Paths.document` até o próximo logout, que o agente raramente faz (a própria documentação em `evidencia-no-disco.ts:125-130` diz isso). Fotos de morador e do imóvel e assinatura ficam além da finalidade, ferindo a minimização do art. 6º. Anterior à etapa; sugiro apagar o arquivo junto da remoção do item.
3. Corrige antes de crescer. O original da foto na câmera (`takePictureAsync`, `vistoria/[id].tsx:1535`) é copiado para `Paths.document` (`evidencia-no-disco.ts:46-47`) e o original no cache não é apagado em nenhum ponto (nenhuma referência a `Paths.cache` no app). A limpeza do logout não o alcança. Prova por leitura (E3a); não executei em aparelho.
4. Anotado. A coordenada do agente é gravada com 6 casas (cerca de 0,11 m, `vistoria/[id].tsx:1510-1511`), mais fina que a precisão típica do GPS (acima de 1 m). A finalidade (localizar o imóvel vistoriado) justifica a coordenada, não as casas excedentes. 5 casas (cerca de 1,1 m) bastariam. Não bloqueia.
5. Anotado. `DELETE` sem `VACUUM` e o modo WAL deixam páginas livres e o arquivo `-wal` com resíduo de linhas apagadas até o SQLite reaproveitar o espaço. Risco baixo (armazenamento privado do aplicativo); relevante para a F14-E04.
6. Anotado, relação com os outros relatórios. `qa.md` e `testes.md` registram FAIL: "Sair e entrar de novo" na tela da vistoria apaga rascunho, foto e assinatura sem avisar. É perda de dado do titular (e da coleta), não vazamento. Não repeti a análise. O defeito concorre com o aviso que a etapa quer entregar: o aviso só vale se todo caminho de saída o mostra.
7. Anotado. Dependência de pessoa: base legal do tratamento da vistoria, papel do município e do fornecedor, contrato com operador (provedor de notificação push, Google Maps/ladrilhos de mapa, API), retenção formal por tipo de dado. A etapa não os define e não precisava.

## Não verificado
- Aparelho físico ou emulador: não executei o app. A prova é de módulos reais com `expo-sqlite` e `expo-file-system` simulados; o comportamento real do sistema de arquivos (cache, WAL, `VACUUM`) não foi medido.
- A tela da fila para o segundo agente foi lida, não renderizada.
- O conteúdo exato do envelope na fila (quais campos do morador entram). Usei dados sintéticos; o schema completo não foi percorrido.
- Servidor: nada do lado da API, auditoria, `organizacao_id` ou RLS foi tocado por esta etapa e não foi reavaliado.
- Aviso de privacidade, DPIA, contratos e transferência internacional (push, mapas): fora da dimensão técnica desta rodada.
- `git status --porcelain` ao final: só pastas `validacao/`. O teste temporário foi apagado.

## Risco residual
Médio. Dado de moradores (identificação, imagem do imóvel, assinatura, coordenada) fica sem criptografia e sem prazo de guarda no aparelho compartilhado: na fila de quem não volta, nos arquivos de itens já enviados, no cache da câmera. A etapa não piora isso e deixa o agente informado do que sai e do que fica. Registrar os achados 1 a 3 na F14 (CP-24, E02, E04) ou antes, se o aparelho compartilhado entrar em produção.

## Motivo do humano
Base legal, papéis (controlador e operador), prazo de guarda do dado de coleta e redação do aviso de privacidade são decisão jurídica e de gestão, fora do que um validador técnico decide. O prazo de guarda de item de outro autor (achado 1) precisa de dono.
