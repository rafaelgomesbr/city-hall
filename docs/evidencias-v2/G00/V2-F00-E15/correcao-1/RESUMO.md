# V2-F00-E15, correção 1: "Entrar de novo" na tela da vistoria não apaga a vistoria começada

Base: `a1760af`, ramo `v2/f00`. Motivo: rodada 1 reprovada (QA e Testes em FAIL, SHA `7005a60`). A LGPD passou.

## Fatos

**O defeito provado pela validação.** Na tela da vistoria (`dc360/apps/campo/src/app/(agente)/vistoria/[id].tsx`), quando a tarefa ainda não desceu para o aparelho e a baixa dá 401, a faixa "Sua sessão terminou" oferecia "Sair e entrar de novo", e o botão chamava `sair()`, que apaga rascunho, fotos e assinatura (`apagarDadosLocais`) sem avisar. A lista de tarefas (`index.tsx`) e a fila (`fila.tsx`) já usavam `encerrarSessaoVencida`, que derruba a credencial e deixa o disco como está. Contradizia o objetivo da etapa. O teste `vistoria-ainda-nao-baixada.test.tsx` exigia `sair` (dublê de `useSessao` sem `encerrarSessaoVencida`) e travava o comportamento errado.

**O que mudou.**

- `vistoria/[id].tsx`: `useSessao()` entrega `encerrarSessaoVencida` em vez de `sair`; `sairEEntrarDeNovo` virou `entrarDeNovo` (derruba a sessão sem apagar e vai para `/entrar`); o botão da faixa passou de "Sair e entrar de novo" (testID `sair-e-entrar-de-novo`) para "Entrar de novo" (testID `entrar-de-novo`), com a descrição de leitor de tela "sem apagar a vistoria começada". É o mesmo rótulo de `index.tsx`, e o que a frase da sessão encerrada (`falha-de-atualizacao.ts`) já mandava tocar. Comentários atualizados; o de `dados/banco-local.ts` (DoD da etapa: "comentário verdadeiro") agora lista as três telas.
- `src/__tests__/vistoria-ainda-nao-baixada.test.tsx` reescrito: o dublê ganha `encerrarSessaoVencida`, e o caso do 401 exige esse verbo chamado uma vez, `sair` nunca chamado e `router.replace("/entrar")`. Os dois negativos do arquivo também afirmam a ausência de "Entrar de novo". Decisão registrada em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`.
- Teste novo com os módulos reais: `src/__tests__/vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` (4 casos). `ProvedorDeSessao`, `banco-local` e `rascunho` de verdade sobre o SQLite do Node, tela real, 401 na baixa; só o cofre, a rede, o disco de arquivos (conjunto de nomes) e as bibliotecas nativas são simulados. Casos: (1) "Entrar de novo" leva a `/entrar`, a identidade vira nula e rascunho, foto e assinatura continuam; (2) a mesma pessoa entra de novo e reencontra checklist, observações, assinatura e foto; (3) controle: a saída explícita (`sair()`, a do diálogo do Perfil) continua apagando; (4) o rótulo antigo não existe mais.
- `dc360/README.md` (1880 para 1884) e `dc360/docs/COLOCAR-DE-PE.md` (4796 para 4800): números de documento atualizados. `dc360/scripts/baseline.mjs` não cita esses números e não mudou.
- `dc360/apps/campo/PENDENCIAS.md`: nota da correção 1 e cinco achados de LGPD da validação com dono provável (ver abaixo).

**Pontos que chamam `sair()` ou `apagarDadosLocais` no app (busca em `src/`, sem testes).**

1. `perfil.tsx:1479`, ação do diálogo "Sair da conta?": passa pelo diálogo que conta fila, rascunhos, fotos e assinatura (`avisoDaSaida`). Mantido, é o único `sair()` que sobra.
2. `vistoria/[id].tsx`, botão da faixa: era `sair()`. CORRIGIDO para `encerrarSessaoVencida`.
3. `dados/sessao.tsx`, dentro de `sair()`: é a implementação do ato, chamado só pelos itens 1 e 2.
4. `dados/banco-local.ts:255`, `acolherNoAparelho`: apaga quando OUTRA pessoa entra num aparelho que guarda dado de turno de alguém. Não passa pelo diálogo porque quem está diante da tela é o colega, não o dono do rascunho. É a regra de isolamento entre agentes, mantida pela E15 e provada em `dados/sair-e-entrar-nao-perde-a-coleta.test.ts`. Avisar o dono antes é decisão do CP-24 (F14-E02). Registrado em `PENDENCIAS.md`.
5. `index.tsx` e `fila.tsx` chamam `encerrarSessaoVencida` (já corretos). Nenhum outro chamador (`_layout.tsx`, `mapa.tsx`, `entrar.tsx`, `push/`, `ui/`).

**Testes, antes e depois** (saídas em `saidas/`, passadas por `redigir`).

| Momento | Comando | Resultado |
| --- | --- | --- |
| Antes (`01`) | teste novo contra a tela de `a1760af` | 3 de 4 reprovam: o rascunho some (`toHaveLength(1)` recebe 0) e o rótulo antigo existe. O controle passa (a saída explícita apaga). |
| Antes (`02`) | teste antigo de `vistoria-ainda-nao-baixada` contra a tela consertada | 1 de 9 reprova (o que exige `sair`), 8 passam |
| Depois (`03`) | teste novo e reescrito | 13 de 13 |
| Depois (`04`) | `npm run test:campo` | 129 suítes, 1884 testes verdes, tipos limpos |
| Depois (`05`) | testes de `dc360/packages/campo` | 223 verdes |
| Depois (`06`) | `npm run typecheck` | código 0 |
| Depois (`07`) | `npm run conferir:numeros` | 24 afirmações conferidas, 0 divergência (antes do ajuste de README e COLOCAR-DE-PE havia 4) |

O portão de conteúdo (`cd dc360 && npx vitest run --root packages/shared test/regras-de-conteudo.test.ts`) está em `saidas/08-portao-de-conteudo.txt`. `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E15 --sha a1760af` roda por último, depois do `INDEX.md`, e não pode ser arquivado dentro do que ele confere; passou sem falha na entrega.

**Limitações.**

- O app Expo não renderiza neste ambiente: a prova é teste de componente com sessão e SQLite reais. Os arquivos de foto e assinatura são nomes num conjunto simulado, não o disco do Android. Os dois fluxos em aparelho (pendência humana da E15, E4) continuam abertos e agora devem incluir tocar em "Entrar de novo" na faixa da vistoria com rascunho no disco.
- O teste não cobre o Perfil com sessão real (ele já é coberto por `dialogo-na-conta-com-vistoria-comecada.test.tsx`, com o dublê de `sair`).
- Cinco achados de LGPD da validação NÃO são deste conserto e seguem abertos: fila e arquivos sem prazo no aparelho; JPEG e PNG de coleta enviada só saem no logout; original da câmera no cache nunca é apagado; coordenada com 6 casas; resíduo de WAL. Estão em `PENDENCIAS.md` com dono provável (F05-E09, F05-E10, F14-E02, F14-E04, F14-E15).
- Sem mudança de servidor, banco, migração, esquema ou regra de apagar.

## Justificativa

A etapa promete que o agente deixa de perder vistoria começada ao sair sem ser avisado. Na tela da vistoria, a pessoa cuja sessão caiu ao abrir uma tarefa recém-despachada não escolheu sair da conta: só precisa renovar a credencial. Dar a ela o verbo do fim do turno, que apaga rascunho, foto e assinatura sem uma palavra, é a perda silenciosa que a etapa existe para eliminar, e a assinatura da moradora colhida no morro não se refaz. Por isso o conserto é no código da tela, e não no teste: o caminho que preserva já existia e já estava provado nas outras duas telas, e o teste antigo só protegia o erro porque o dublê de sessão nem conhecia o verbo certo.

O teste novo usa os módulos reais de propósito. O dublê de `useSessao` é o que escondia a diferença entre `sair` e `encerrarSessaoVencida` em todas as telas, e foi um teste com sessão, banco e tela de verdade que expôs o defeito na validação. Manter o controle da saída explícita no mesmo arquivo registra que a regra de apagar não mudou (aparelho compartilhado entre turnos): mudou qual botão a tela oferece e a quem. O trecho de outra pessoa entrando continuar apagando sem aviso ao dono não foi tocado por ser decisão do CP-24, não desta correção.

O rótulo foi trocado junto porque "Sair e entrar de novo" ensina o verbo errado: a frase da faixa já diz "Nada é apagado ... toque em Entrar de novo", e o botão contradizia o parágrafo dele. Os achados de LGPD ficaram fora porque pedem decisão de retenção e de limpeza de mídia que pertencem a F05 e F14, e misturá-los aqui esconderia o que esta correção prova.
