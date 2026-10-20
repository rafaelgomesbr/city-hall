# RISCO ACEITO em V2-F00-E25

RASCUNHO preparado pelo gatekeeper da rodada 6 (2026-10-20). NÃO ACEITO. Só vale se quem pode aceitar preencher e assinar.

- Critério: Infra e CI: run do CI do SHA, job a job (restore do banco em Postgres 17, CA-08)
- Por que não foi provado: BLOCKED da rodada 6 (`VEREDITO.md`, rodada 6, SHA `1ed0b71`): o run do CI do SHA não existe: o CI completo do registro `7644420` (run 39366804765) foi recusado pelo GitHub por faturamento (H32).
- Admite aceite? sim, não está na lista da seção 7 de `28`.
- Risco: o job `implantavel` ou o de restore do CI falhar com os próprios comandos dele (já aconteceu na 041 com `pg_trgm`)
- Mitigação: `ensaiar-restore.sh` 27 de 27 em PostgreSQL 17.6 real no Mac; Banco PASS no restore das 51 migrações
- Recomendação do gatekeeper: NÃO aceitar. O bloqueio é removível: regularizar o faturamento do GitHub Actions (H32), rodar de novo o CI completo do candidato e revalidar a dimensão sobre o run. Aceitar risco aqui trocaria uma prova barata por um aceite.
- Dono: Rafael
- Validade: até o GATE G00 (reavaliado nele)
- Quem aceitou: (vazio) em (vazio)
- O BLOCKED original continua em VEREDITO.md, rodada 6.
- Superado na rodada 7 (2026-10-20, SHA `fd17ff4`): o run 39420436042 (sobre `55209ab`, registro do candidato) existe e deu 9 de 9 jobs verdes; a dimensão Infra e CI foi revalidada sobre ele e deu PASS (`VEREDITO.md`, rodada 7). O BLOCKED foi removido por revalidação, não por aceite; este rascunho nunca foi aceito e não vale mais.
- Status: encerrado (superado na rodada 7, sem aceite).
