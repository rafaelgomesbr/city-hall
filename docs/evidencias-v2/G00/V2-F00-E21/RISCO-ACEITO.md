# RISCO ACEITO em V2-F00-E21

RASCUNHO preparado pelo gatekeeper da rodada 6 (2026-10-20). NÃO ACEITO. Só vale se quem pode aceitar preencher e assinar.

- Critério: DoD: os três casos verdes em Windows E Linux; Infra e CI: run do CI do SHA, job a job
- Por que não foi provado: BLOCKED da rodada 6 (`VEREDITO.md`, rodada 6, SHA `1ed0b71`): o run do CI do SHA não existe: o CI completo do registro `7644420` (run 39366804765) foi recusado pelo GitHub por faturamento (H32). Além disso, não há Windows nem contêiner Linux nesta máquina.
- Admite aceite? sim, não está na lista da seção 7 de `28`.
- Risco: fim de linha, `OPENSSL_CONF` ou cache do Expo quebrarem em Windows ou Linux, que é exatamente o que a etapa existe para impedir
- Mitigação: os três casos passam no Mac com a condição hostil presente (CRLF 688 de 688, `OPENSSL_CONF` quebrado 13 de 13, cache velho do Expo)
- Recomendação do gatekeeper: NÃO aceitar. O bloqueio é removível: regularizar o faturamento do GitHub Actions (H32), rodar de novo o CI completo do candidato e revalidar a dimensão sobre o run. Aceitar risco aqui trocaria uma prova barata por um aceite.
- Dono: Rafael
- Validade: até o GATE G00 (reavaliado nele)
- Quem aceitou: (vazio) em (vazio)
- O BLOCKED original continua em VEREDITO.md, rodada 6.

## Atualização da rodada 7 (2026-10-20, SHA `fd17ff4`), RASCUNHO do gatekeeper, NÃO ACEITO

- Critério: DoD: os três casos verdes em Windows (a parte de Linux foi provada nesta rodada pelo run 39420436042 e por execução no Mac com as condições hostis reais).
- Por que não foi provado: BLOCKED da rodada 7 (`VEREDITO.md`, rodada 7): ambiente indisponível. Nenhum dos 9 jobs do CI roda em Windows (todos `ubuntu-latest`) e não há Windows nesta máquina nem execução em Windows neste SHA.
- Admite aceite? sim, não está na lista da seção 7 de `28`.
- Risco: fim de linha, `OPENSSL_CONF` ou cache do Expo quebrarem no Windows, que é parte do que a etapa existe para impedir; os dois casos de `--preserve-symlinks-main` do conferidor de índices se declaram pulados no Windows sem privilégio de link simbólico.
- Mitigação: os três casos passam no Mac com a condição hostil real presente (CRLF: painel 699 de 699; `OPENSSL_CONF` inexistente: 23 de 23; cache velho do Expo) e no Linux do CI na forma sintética; `.gitattributes` em vigor.
- Recomendação do gatekeeper: NÃO aceitar. O bloqueio é removível sem aceite: Rafael roda `npm run verificar` no Windows e anexa o resultado (é a própria "Validação humana" da etapa), ou se decide um job `windows-latest` no CI (F01-E02).
- Dono: Rafael
- Validade: até o GATE G00 (reavaliado nele)
- Quem aceitou: (vazio) em (vazio)
- O BLOCKED original continua em VEREDITO.md, rodadas 6 e 7.
