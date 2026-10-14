---
validador: arquiteto-software
papel: arbitragem
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
gatilho: 6 (vereditos opostos na mesma etapa: ux FAIL, acessibilidade PASS)
veredito: PASS
confianca: media
---
## Relatórios em conflito

- `ux.md`: FAIL. Em Órgãos a 320 px, no cartão "Órgãos cadastrados", o rótulo "Mostrar desativados" passa 15 px da área útil do cartão e entra no respiro da borda (três motores), e a coluna Contato parte o e-mail em várias linhas. Conta contra a E13 porque a etapa mexeu em `Orgaos.tsx` (o aviso passageiro).
- `acessibilidade.md`: PASS. Reflow 1.4.10 sem rolagem horizontal da página em Órgãos a 320; registra a mesma observação ("ainda dentro do respiro") sem tratá-la como falha de acessibilidade.

Os dois concordam no fato (o rótulo invade o respiro, não sai do cartão nem cria rolagem). A pergunta é a origem: nasceu na F00 ou é anterior?

## Reprodução (comando e resultado)

Limitação desta sessão: a arbitragem rodou sem shell. NÃO renderizei a tela com o CSS e o componente de `afde25c` e de `4b96ea7` (sem `git show`, sem Playwright). A decisão se apoia em evidência de leitura e em capturas já existentes; o nível obtido é E3a mais comparação de capturas E2 de terceiros. Se o gatekeeper quiser E2 próprio, a prova barata é a que foi pedida: montar a tela nos dois SHAs a 320 px e medir `getBoundingClientRect()` do rótulo contra `.cartao__corpo`.

1. O que define a geometria do cabeçalho do cartão (lido no SHA):
   - `componentes/comuns.tsx:345-347` (`Cartao`): linha flex com `style` no elemento (`display: flex; align-items: center; gap: var(--ds-sp-3)`), SEM `flex-wrap`; as ações vão num `div` com `marginLeft: auto`.
   - `estilos/app.css`: `.conteudo` (370, e 1012 no bloco móvel: `padding: var(--ds-sp-4)`), `.cartao` (385), `.cartao__corpo` (391, `padding: var(--ds-sp-5)`), `.cartao__titulo` (392), `.caixa-marcacao` e o `input` dela (656-661).
   - `paginas/Orgaos.tsx:254-263`: o `label.caixa-marcacao` no slot `acoes`.
2. A conta fecha só com essas regras: área útil de 41 a 279 px (238 px); a palavra mais longa do título ("cadastrados") ocupa de 41 a 162; o rótulo, com a caixa de 20 px, vai de 179 a 294. 294 menos 279 dá os 15 px medidos pelo UX. Nenhuma regra de fora do cabeçalho entra na conta.
3. Nenhuma dessas regras foi mexida na fase, pelo que os diffs arquivados mostram:
   - E09 (`diff-da-etapa.patch`): só acrescenta classes novas no fim do arquivo (`.tabela__acoes`, `.senha-temporaria*`, `.sessoes*`, `.tabela__pessoa`, `.tabela--justa`, `.carregando--no-cartao`).
   - E09 correção 1 (`correcao-1/diff-da-correcao.patch`): blocos em `.tabela__secundario--frase`, `.modal__painel .campo__dica`, `.modal__rodape`, `.lateral` e a barra do rodapé, `.toast`, `.sino`. A linha `.conteudo { padding: var(--ds-sp-4); }` aparece ali só como contexto, sem mudança.
   - E13 (`RESUMO.md`, seções 1 e 3.2): `.lateral__marca img` e `.toast` (posição fixa, fora do fluxo do cartão). E10 (`RESUMO.md:22`): link do rodapé da entrada. Nenhum outro relatório da fase cita `app.css`, e nenhum cita `comuns.tsx`.
4. Captura antes e depois da própria E13, a 390 px: `docs/evidencias-v2/G00/V2-F00-E13/capturas/antes/orgaos-confirmacao-390-claro.png` contra `capturas/orgaos-confirmacao-390-claro.png`. O cabeçalho do cartão é idêntico nas duas (título em duas linhas a partir de x 41, caixa em x 212, rótulo em duas linhas terminando em x 328). A mudança da E13 em `Orgaos.tsx` não mexeu na geometria do cabeçalho.
5. O e-mail partido na coluna Contato vem de `.tabela__secundario { overflow-wrap: anywhere; }` (`app.css:518`), regra anterior que aparece como contexto na correção da E09 e cujo comentário explica a escolha (quebrar a linha secundária em vez de empurrar colunas para fora do cartão). A captura "antes" a 390 já mostra a mesma quebra em "Sem email" e "Sem telefone".

## Escopo

O defeito é anterior à F00 e não foi tocado por ela. A E13 mexeu na tela Órgãos só para pôr o aviso passageiro, que não participa do layout do cartão. Pela regra do portão aplicada pelo gatekeeper, defeito anterior em elemento que a etapa não tocou vira CORRIGE ANTES DE CRESCER com dono, e não reprova a etapa.

## Item da seção 7

Nenhum. É defeito visual (regra 2 da seção 0 de `19-definicao-de-pronto.md`), sem dado, sessão ou isolamento envolvido.

## Decisão

PASS da E13 em 4b96ea7 quanto a este ponto; o FAIL do UX é reclassificado como achado CORRIGE ANTES DE CRESCER:

- defeito: o cabeçalho de `Cartao` (`comuns.tsx:345`) não quebra linha; com título longo e ação com rótulo, a 320 px a ação invade o respiro do cartão. Afeta Órgãos e qualquer outra tela que use `Cartao` com `acoes` de texto;
- dono: a fase do painel (F10), junto com o achado de `.botao` sem quebra da E09, como o UX sugeriu;
- prova a exigir do dono: captura e medida de geometria a 320 px em Órgãos e nas outras telas com `Cartao` mais `acoes`.

Confiança média porque a comparação renderizada entre os dois SHAs não foi feita nesta sessão; se ela mostrar o cabeçalho diferente em `afde25c`, esta decisão cai e o FAIL do UX volta a valer.

## Conserto mínimo

Não se aplica ao veredito (PASS). Para o dono do achado: tirar o `style` do cabeçalho de `Cartao` para uma classe em `app.css` com `flex-wrap: wrap` (o título com `min-width: 0` e as ações descendo para a linha de baixo quando não couberem), sem número solto fora dos tokens, e um teste de geometria a 320 px que reprove ação fora da área útil do cartão.
