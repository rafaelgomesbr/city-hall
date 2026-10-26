# Gate G00 (BASE CONFIÁVEL)

## Resultado

**APROVADO em 2026-10-26 por Rafael**, pelas respostas H09 ("A. Aprovar e fazer o merge") e H44 ("A. Merge da F00 primeiro, regra depois") da página de decisões (relatório gerado em 26/10/2026 às 11:23, posição de 25/10, depois da rodada 11). Registro da decisão: `e1afc293` (`STATUS.md`, seção 1).

| Campo | Valor |
| --- | --- |
| SHA do merge em master | `02e9c26e` (`02e9c26e16210b1b3594912b53e540730f89aa05`), commit de merge (`--no-ff`), nunca squash |
| Pai do lado da fase | `e1afc293` (`v2/f00`) |
| SHA recomendado pelo gatekeeper | `98879db` (rodada 10, `docs/evidencias-v2/G00/validacao/98879db/G00-recomendacao.md`), confirmado sobre `7fdfcc1` (rodada 11, só mecânica, `docs/evidencias-v2/G00/validacao/7fdfcc1/G00-recomendacao.md`) |
| Recomendação do gatekeeper | RECOMENDADO |
| Quem aprovou | Rafael (H09 e H44), em 2026-10-26 |
| Primeiro Verificar em master | run 40348185180 sobre `02e9c26e`: VERDE, 10 jobs com sucesso (testes e tipos, auditar, roadmap, navegador, demonstração, aplicativo, Windows, ambiente hostil em Ubuntu e em Windows, API contra Postgres real); linha de base e restore (CA-08) pulados por regra, só rodam com `[ci completo]`. O último run anterior em master (2026-09-17) tinha falhado. |

## O que mudou entre o SHA recomendado e o mesclado

O diff `7fdfcc1..e1afc293` toca só dois arquivos, ambos documentação, sem produto, migração, teste, script nem regra:

- `docs/roadmap-v2/pendencias-humanas.md` (`0af79f3`, 2 linhas: H85 marcada como resolvida). Fica FORA da lista permitida do registro (seção 6 de `28`). O desvio é declarado aqui em vez de desfazer e refazer as duas linhas: o arquivo não é lido por nenhuma ferramenta que aprova e não muda o produto.
- `docs/roadmap-v2/STATUS.md` (`e1afc293`, registro das decisões de 26/10), dentro da lista permitida.

A árvore de `02e9c26e` é idêntica à de `e1afc293`: os commits próprios de master (apresentação, até `e82719e`) já estavam no ramo da fase.

## Etapas

25 etapas: 8 VALIDADAS (E02, E03, E04, E07, E12, E17, E20, E23), 16 VALIDADAS COM PENDÊNCIA HUMANA e a E09 ACEITA por decisão do Rafael (H36, D-32), sem PASS de validador. Pela H84 B (26/10), a política ganha o status ACEITA; até o lote pós-G00 implementar isso, o STATUS mostra a E09 como IMPLEMENTADA.

## Itens do gate

Cada item de `# GATE G00` em `docs/roadmap-v2/03-fase-00-estabilizacao.md` está provado pelos `VEREDITO.md` de cada etapa e consolidado nas recomendações das rodadas 10 e 11. Os itens que dependem de pessoa (segunda pessoa na E01 e na E25, leitor de tela, aparelho físico, leitura de frases) seguem pelas emendas D-30 do próprio gate e estão em `docs/roadmap-v2/pendencias-humanas.md`; não travam o gate.

## Riscos aceitos

Nenhum. Os `RISCO-ACEITO.md` de E01, E02, E05, E08, E11, E14, E15, E17, E18, E21 e E25 são rascunhos do gatekeeper encerrados sem aceite (superados por revalidação nas rodadas 4, 7 e 8).

## Implantação feita antes do push (seção 8 de `dc360/docs/IMPLANTACAO.md`)

Feita no Windows do Rafael em 2026-10-26, com os roteiros adaptados para ler a senha do Gerenciador de Credenciais do Windows (ramo `trab/producao-windows`, `783ec4cc`):

1. Cópia: `C:\Users\Rfasg\dc360-copias\2026-10-26T15-15-48.dump` (397169 bytes, `pg_dump` 18.3 contra servidor 17.6; `pg_restore --list` com 36 tabelas de dados). Fica fora do repositório e é apagada depois da conferência no ar.
2. Migrações aplicadas: 043 a 051 (a produção estava na 042: as 043 a 046 estavam em master desde 15/09 e nunca tinham sido aplicadas).
3. Endurecimento do Supabase (`db/provedores/supabase-endurecer.sql`): código 0; só `dc360_app` enxerga as tabelas.
4. API: `fly deploy -a defesa-civil --image registry.fly.io/defesa-civil:deployment-01M5WBFSD1V56RVHNY2N9820K6`, imagem construída de `e1afc293` antes da migração para encurtar a janela em que a API velha não acha as funções trocadas pela 047 e pela 048. `/saude` respondeu `ultimaMigracao` 051. O segredo `ORIGENS_PERMITIDAS` não foi tocado (mesmo digest antes e depois).
5. Console: `fly deploy -c fly.console.toml --image registry.fly.io/defesa-civil-console:deployment-01M5WBKZVWRHCNK4ZD2TXA8T5J`; `/saude` 200.
6. Push de master por último; a Vercel publicou o painel (`dc360-painel-web`) a partir de `02e9c26e`.

## Reaberturas

Nenhuma.
