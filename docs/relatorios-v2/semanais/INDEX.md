# Relatórios semanais de evolução

Gerados pela skill `relatorio-semanal` às segundas-feiras, para Rafael revisar e enviar ao sócio na terça (política: `docs/roadmap-v2/28-execucao-e-validacao.md`, seção 16). O relatório é uma visão do STATUS já mantido, não uma nova auditoria.

**Página publicada (formato visual desde 2026-10-13):** https://dc360-painel-web.vercel.app/progresso , protegida por senha (variável PROGRESSO_SENHA do projeto `dc360-progresso` na Vercel; a senha não fica no repositório). É atualizada a cada etapa por `scripts/roadmap/publicar-progresso.mjs` e reescrita toda semana pelo agente `relatorio-semanal-visual`. O texto vivo está em `progresso/editorial.json`; a coleta, a estimativa e o site gerados não vão para o git. Os arquivos datados desta pasta (HTML, coleta, estimativa em JSON e CSV, editorial) são o registro de cada semana; o histórico da V2 para a linha do tempo está em `linha-do-tempo.json`.

O HTML e o JSON da coleta (`AAAA-MM-DD.json`) ficam no git. O PDF fica fora do git (`.gitignore`): o SHA-256 dele é anotado aqui, e um PDF regerado a partir do mesmo HTML tem outro SHA-256 (o PDF carrega data de geração), então só vale o da linha do arquivo entregue. Nada é enviado automaticamente: o envio é sempre de Rafael.

| Data | Arquivo | Período coberto | SHA de base | SHA-256 do PDF |
| --- | --- | --- | --- | --- |
| 2026-10-12 | `2026-10-12.html` | 2026-10-05 a 2026-10-07 | `0b32d38` (ramo v2/f00) | `1de48c9352f0673cb8a866d67b2acad19f5a9fcea3347b2bcfa88d1430e73bde` |
| 2026-10-13 | `2026-10-13.html` | 2026-10-08 a 2026-10-13 | `8bf7e2c` (ramo v2/f00) | `371f433ff3bc13013e581aa2594b2f615924803a244b80d0e6e755341f4c51f3` |
| 2026-10-13 | `2026-10-13-visual.html` (primeira versão visual, com imagens embutidas) | 2026-10-08 a 2026-10-13 | `8bf7e2c` (ramo v2/f00) | não se aplica |

Observação sobre a linha de 2026-10-12: é o primeiro relatório do sistema, gerado em 2026-10-07 (quarta-feira), e por isso o período termina antes da segunda que dá nome ao arquivo. O próximo relatório semanal deve começar em 2026-10-08.
