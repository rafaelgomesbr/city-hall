# V2-F00-E15, correção 3: o isolamento entre agentes passa a ser provado pelo `entrar` de verdade, e a saída que tira a credencial do cofre ganha teste

Base: `7618b89`, ramo `trab/correcao-5`, sobre o candidato `4ce0433`. Motivo: rodada 5 reprovada por `validacao/4ce0433/arbitragem.md` (Opus) e `seguranca-aplicacao.md`. Não há mudança de código de produção: o produto já isolava, o defeito era de prova.

## Fatos

**O defeito provado pela validação.** O critério da etapa ("outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa") só era provado no nível da função (`dados/sair-e-entrar-nao-perde-a-coleta.test.ts` chama `acolherNoAparelho(BRUNO)` direto). Tirando `await acolherNoAparelho(r.identidade.usuarioId);` de `entrar`, em `dc360/apps/campo/src/dados/sessao.tsx`, e o nome do `import`, o `tsc` e o jest inteiro ficavam verdes (1932 de 1932), e o agente seguinte lia a vistoria começada do anterior. O mesmo para a credencial: nenhum teste prendia que "Sair da conta" e a sessão vencida tiram a credencial e a identidade do cofre (mutações S2, S6, S10 verdes).

**O que mudou (só teste, documentação de números e comentário).**

- Arquivo novo `dc360/apps/campo/src/__tests__/entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx`, 7 casos. O `ProvedorDeSessao`, o `banco-local` (SQLite do Node) e o `rascunho` são os reais; só ficam simulados o cofre (um mapa), a rede (o login devolve a pessoa do e-mail, com credencial própria), o disco de arquivos (um conjunto de nomes) e as bibliotecas nativas. A pessoa entra por `entrar`.
  - Login real com troca de pessoa (3): (1) a Ana entra por `entrar`, deixa rascunho com foto e assinatura e uma coleta pendente na fila, a sessão vence (`encerrarSessaoVencida`, que não apaga) e o Bruno entra por `entrar`: `listarRascunhos()` volta vazio, a foto e a assinatura do rascunho saíram do disco, o item da fila da Ana continua byte a byte igual e `pendente`, com a assinatura dele no disco; (2) o mesmo depois de "Sair da conta" (`sair`) seguido do login do Bruno; (3) contraste: a Ana que volta depois da sessão vencida reencontra rascunho, foto e assinatura.
  - Cofre (4): o cofre guarda `dc360.credenciais` e `dc360.identidade` ao entrar (base das outras); `sair` e `encerrarSessaoVencida` deixam as duas chaves fora do cofre e nenhum valor com `renovacao-ana`, `acesso-ana` ou o id da Ana; depois da saída da Ana e da entrada do Bruno, o cofre guarda só o Bruno.
- `dc360/scripts/baseline.mjs`: entrada `V2-F00-E15-correcao-3` (total +7, falhas 0). `dc360/README.md` (1932 para 1939, duas ocorrências) e `dc360/docs/COLOCAR-DE-PE.md` (5217 para 5224, duas ocorrências): números que o `conferir:numeros` mandou.
- `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx`: o comentário que apontava a prova do login para um arquivo que não existe passa a apontar para o arquivo novo (item 3 da arbitragem).

**Mordida (mutação no código de produção, desfeita com `git checkout` depois de cada uma; `saidas/02` a `saidas/08`, todas contra o arquivo novo).**

| Mutação | O que simula | Resultado do arquivo novo |
| --- | --- | --- |
| S9b: sem `acolherNoAparelho` em `entrar` e sem o nome no `import` (`tsc` código 0, como na arbitragem) | refatoração do login que perde a linha | 1 reprova (sessão vencida, Bruno entra), 6 passam |
| X3: `acolherNoAparelho` não apaga (corpo da função) | a regra enfraquecida | 1 reprova, 6 passam |
| S9b + S3 (`sair` sem `apagarDadosLocais`) | as duas defesas fora | 2 reprovam (os dois casos de troca de pessoa) |
| S2: `sair` não tira a credencial do cofre | | 1 reprova |
| S10: `sair` não tira a identidade do cofre | | 1 reprova |
| S6: sessão vencida não tira a credencial | | 1 reprova |
| S10b: sessão vencida não tira a identidade | | 1 reprova |

Sem mutação: 7 de 7 (`saidas/01`). Restaurado: `git status` sem alteração em `sessao.tsx` nem `banco-local.ts`.

**Limite honesto da mordida.** O caso "Sair da conta e depois o Bruno entra" NÃO reprova com S9b sozinha: `sair()` já apaga o dado local, então a limpeza do `entrar` fica redundante nesse caminho. Ele só reprova com as duas defesas fora (S9b + S3), e é por isso que o caso da sessão vencida, o único caminho em que só o `entrar` protege, é o que carrega a mordida de S9b.

**Testes, depois.**

| Comando | Resultado |
| --- | --- |
| `npm run test:campo` (tipos, jest do aplicativo, contagem) | 135 suítes, 1939 de 1939, código 0 (`saidas/10`); a leitura do código e o jest concordam em 1939 |
| `npm run test --workspace @dc360/campo` | 10 arquivos, 231 de 231, código 0 (`saidas/11`) |
| `node --test scripts/portao-*.test.mjs` (portões do aplicativo) | 79 de 79, código 0 (`saidas/12`) |
| Portão de conteúdo (`regras-de-conteudo.test.ts`) | 10 de 10, código 0 (`saidas/13`) |
| `npm run conferir:numeros` | total do aplicativo 1939, soma 5224, "Todos os números da documentação batem", oito suítes batem com o `baseline.mjs` (`saidas/14`) |
| `node scripts/conferir-indices-de-evidencia.mjs` | 70 `INDEX.md`, todos os arquivos conferidos byte a byte, `RESULTADO: OK` com o `INDEX.md` de topo da E15 atualizado (linhas de `correcao-3/`, por `montarIndice`); `saidas/15` |

**Limitações.** O cofre (`expo-secure-store`), o disco e o SQLite nativo são simulados: o teste prova que o código chama a remoção e a limpeza, não a garantia do chaveiro do iOS e do Android (pendência humana da etapa e da F14-E12). Nada foi rodado em aparelho. A falha aberta de `acolherNoAparelho` (marca ausente, limpeza que falha no meio) continua com a classificação da rodada 4 (F14-E02).

## Justificativa

Em risco alto a seção 8 de `28` exige prova de que o teste morde, e o ato do critério é "entrar no aparelho", que é `entrar`, não a função que ele chama. Por isso o caso novo passa pelo provedor real e a mordida arquivada é a que a arbitragem pediu (S9b). O caso da sessão vencida é o escolhido para a mordida porque é onde só o login protege; o da saída explícita fica como prova do mesmo critério pelo outro caminho e como contraste. Os casos do cofre fecham o "corrige antes de crescer" da Segurança: sem eles, uma regressão deixaria o token de renovação no chaveiro de um aparelho de plantão depois da saída, e com a saída sem sinal o servidor nem fica sabendo. Não houve mudança de produto porque o comportamento já estava certo (sondas A1, A2, C2 e C3 da validação).
