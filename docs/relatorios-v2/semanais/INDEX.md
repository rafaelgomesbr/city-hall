# Relatórios semanais de evolução

Gerados pela skill `relatorio-semanal` às segundas-feiras, para Rafael revisar e enviar ao sócio na terça (política: `docs/roadmap-v2/28-execucao-e-validacao.md`, seção 16). O relatório é uma visão do STATUS já mantido, não uma nova auditoria.

O HTML e o JSON da coleta (`AAAA-MM-DD.json`) ficam no git. O PDF fica fora do git (`.gitignore`): o SHA-256 dele é anotado aqui, e um PDF regerado a partir do mesmo HTML tem outro SHA-256 (o PDF carrega data de geração), então só vale o da linha do arquivo entregue. Nada é enviado automaticamente: o envio é sempre de Rafael.

| Data | Arquivo | Período coberto | SHA de base | SHA-256 do PDF |
| --- | --- | --- | --- | --- |
| 2026-10-12 | `2026-10-12.html` | 2026-10-05 a 2026-10-07 | `0b32d38` (ramo v2/f00) | `1de48c9352f0673cb8a866d67b2acad19f5a9fcea3347b2bcfa88d1430e73bde` |

Observação sobre a linha de 2026-10-12: é o primeiro relatório do sistema, gerado em 2026-10-07 (quarta-feira), e por isso o período termina antes da segunda que dá nome ao arquivo. O próximo relatório semanal deve começar em 2026-10-08.
