---
validador: seguranca-aplicacao (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito da dimensão: **PASS** no escopo da etapa, nível E1 (jest com sessão, banco local e rascunho reais sobre o SQLite do Node; mutações próprias). O achado `acolherNoAparelho` falha aberto entre pessoas **não mudou**: o código de `apps/campo/src/dados/banco-local.ts` é o mesmo desde `afde25c` (as duas mudanças da fase, `99390e0` e `a5da710`, são só comentário), e reconfirmei por execução, com uma segunda forma de abrir a mesma falha (limpeza que falha no meio). Continua item 3 da seção 7 de `28`, sem risco aceito, dono F14-E02, corrigir antes de qualquer piloto, exatamente como a arbitragem da rodada 2 decidiu. Saídas em `$SP/val/seguranca-aplicacao/lote2/` (abaixo, `L2/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Outra pessoa entra no aparelho: o rascunho, as fotos e a assinatura da anterior somem antes da sessão abrir; a fila da anterior fica intacta e pendente | PASS (caminho feliz) | `sair-e-entrar-nao-perde-a-coleta.test.ts` verde (`L2/03-app-campo-suites.txt`); mutação M15 (`acolherNoAparelho` nunca apaga): 1 vermelho, "o Bruno entra: o rascunho da Ana é limpo" (`L2/mut/M15-*.txt`) |
| A próxima pessoa não envia a coleta da anterior | PASS | portão de autoria da fila: M3 e M4 da sonda da E06 (8 vermelhos com as duas barreiras fora, `L2/mut/M4-*.txt`); servidor: 409 `autor_divergente` (M6 a M8) |
| "Entrar de novo" (sessão vencida) não apaga a vistoria começada | PASS | `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` e `vistoria-ainda-nao-baixada.test.tsx` verdes; M16 (a tela volta a chamar `sair` no lugar de `encerrarSessaoVencida`): 3 vermelhos de 13 (`L2/mut/M16-*.txt`) |
| Sair da conta avisa o que apaga | PASS | `dialogo-na-conta-com-vistoria-comecada.test.tsx` e `dialogo-na-conta.test.tsx` verdes (`L2/03-*`) |
| Precisão de GPS: abaixo de 0,5 m vira 1; o esquema continua recusando 0 e negativo | PASS | M17 (sem o piso): 2 vermelhos de 5 em `precisao-do-gps.test.ts` (`L2/mut/M17-*.txt`); `precisao-do-gps-na-sincronizacao.test.ts` verde contra a rota real (`L2/01-api-suites-alvo.txt`) |
| Credencial do aparelho | PASS | `expo-secure-store` com `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (`apps/campo/src/dados/sessao.tsx:80-84`); "Entrar de novo" revoga no servidor antes de esquecer (leitura de `encerrarSessaoVencida`, coberta pelos testes acima) |
| `acolherNoAparelho` falha aberto (rodada 2, arbitragem) | AINDA MORDE, não mudou | sonda `L2/sondas-campo/e15-acolher-falha-aberto.test.ts`, saída `L2/50-sonda-e15-acolher.txt` |

Resultado da sonda, com `banco-local.ts` e `rascunho.ts` reais e só o disco simulado:

| Caso | apagou | Rascunhos da Ana que o Bruno vê | Dono depois |
| --- | --- | --- | --- |
| Controle: leitura sã | true | 0 | Bruno |
| A: a leitura da marca de dono falha | false | 1 (com as observações da moradora) | Bruno |
| B: a marca existe e o `DELETE FROM rascunhos` falha | true | 1 | Bruno |
| C: aparelho sem marca (dado de versão anterior) | false | 1 | Bruno |

O caso A é o da rodada 2. O caso B é novo como reprodução: `apagarDadosLocais` isola cada passo e engole a falha, então `acolherNoAparelho` devolve `apagou: true` com o rascunho ainda no disco, e a marca passa a dizer que o dado é do Bruno. O caso C é a "marca sem dono não apaga", decisão documentada. Nos três, o Bruno pode abrir a vistoria começada da Ana, concluí-la e enviá-la como sua: a fila carimba o autor da sessão no momento da conclusão, e o servidor não tem como saber.

## Evidência

- `L2/03-app-campo-suites.txt`: 16 suítes, 129 de 129, código 0 (inclui `sair-e-entrar-nao-perde-a-coleta`, `sessao`, `dialogo-na-conta*`, `a-sessao-vencida-nao-apaga-a-vistoria`, `vistoria-sessao-vencida-preserva-o-rascunho`, `precisao-do-gps`).
- `L2/01-api-suites-alvo.txt`: `precisao-do-gps-na-sincronizacao` e `autoria-da-coleta` entre 18 arquivos, 217 de 217.
- Mutações M15, M16 e M17 com `L2/mut/rodar.sh` (diff, execução, `git restore`, SHA-256 igual antes e depois).
- Sonda do caso A, B e C: `npx jest --roots <pasta da sonda> --rootDir .` em `apps/campo`, 4 de 4 (os casos registram o comportamento, não o exigem), `L2/50-sonda-e15-acolher.txt`. A sonda mocka `expo-sqlite` e `expo-file-system` pelo caminho resolvido, como o teste da etapa faz.
- `git diff afde25c..52952a1 -- dc360/apps/campo/src/dados/banco-local.ts`: só comentário.

## Cenários positivos

- A mesma pessoa que volta reencontra checklist, foto, assinatura e observações; a fila dela fica byte a byte igual.
- Precisão 0,3 vira 1 e 12,4 vira 12; ausente continua nula.

## Cenários negativos

- Outra pessoa entra com leitura sã: aparelho limpo, a coleta da anterior na fila espera o autor.
- "Sair e entrar de novo" na vistoria não existe mais; o botão da faixa não apaga.
- Precisão 0 e negativa: 422 do servidor.

## Tentativas de reprovar

1. Falha de leitura da marca de dono: o Bruno herda o rascunho (caso A).
2. Falha no meio da limpeza: o Bruno herda o rascunho e a função diz que apagou (caso B).
3. Marca ausente: herda (caso C, decisão documentada).
4. Voltar a tela da vistoria para `sair()`: M16 pega.
5. Desligar o apagamento da troca de pessoa: M15 pega, mas só um caso; nenhum teste exercita a falha do disco (A e B), e por isso o defeito não aparece em suíte nenhuma.

## Achados

**Corrige antes do piloto, sem risco aceito (item 3 da seção 7 de `28`; anterior à F00; dono F14-E02; não reprova a etapa, conforme a arbitragem da rodada 2)**

1. `acolherNoAparelho` (`apps/campo/src/dados/banco-local.ts:255-261`) falha aberto entre pessoas: com a leitura da marca falhando (`donoDosDadosLocais` devolve nulo, linhas 218-229) ou com a limpeza falhando no meio (`apagarDadosLocais` engole cada erro), a pessoa que entra vê, conclui e envia como sua a vistoria começada de quem saiu, e a marca passa a ser dela. Reprodução: `L2/sondas-campo/e15-acolher-falha-aberto.test.ts`. Conserto sugerido: erro de leitura ou de limpeza recusa a entrada (ou apaga de novo e confere que `listarRascunhos()` voltou vazio antes de marcar o novo dono), e teste para os dois casos.

**Anotado**

2. O rascunho não carrega o autor; uma coluna de dono por linha daria segunda barreira (rodada 2, segue).

## Não verificado

- Emulador e aparelho físico (E2 do aparelho e o E4 da etapa): não há emulador Android nesta máquina. Os fluxos "começar vistoria e Sair da conta" e "concluir com GPS abaixo de 0,5 m" não foram executados em aparelho por mim.
- Falha real do SQLite do Android (a sonda simula a falha no ponto de leitura e no de apagar).
- `expo-secure-store` real e o Keychain do iOS.
- Os arquivos de foto e assinatura no disco real do aparelho (conjunto de nomes simulado).

## Risco residual

- Achado 1 até a F14-E02: num erro de disco, ou num aparelho atualizado de versão sem marca, a pessoa seguinte vê e pode enviar como sua a coleta começada da anterior.
- Dado em repouso em texto claro até a F14-E04.

## Motivo do humano

Fazer os dois fluxos num aparelho (emulador ou físico) e aprovar "Precisão de 1 metro": esta máquina não tem emulador Android, e a etapa pede a prova no aparelho.
