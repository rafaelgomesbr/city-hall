# Modelo do VEREDITO.md (uma rodada nova entra no topo; rodada antiga nunca se apaga)

```
# VEREDITO de V2-Fnn-Enn

Situação atual: VALIDADA | VALIDADA COM PENDÊNCIA HUMANA | REPROVADA | BLOQUEADA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | AAAA-MM-DD | <sha7> | <sha7 ou ausente> | PASS | <sha7> | <sha7> | <sha7> |
| 1 | AAAA-MM-DD | <sha7> | <sha7> | FAIL | <sha7> | <sha7> | <sha7> |

## Rodada <n> (<data>, SHA <sha7>)

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa | <modelo> | PASS | alta | E1 | E1, E2 | | validacao/<sha7>/qa.md |

### CI (job a job)

| Job | Resultado | Dimensão ligada | Observação |
| --- | --- | --- | --- |

### Conferência mecânica

- Evidência (`INDEX.md`, SHA-256, segredos, capturas, sonda): <resultado; "feita à mão" enquanto `conferir-evidencia` não existir>
- Regressão seletiva: <suítes e resultado>
- Árvore conferida antes e depois de cada validador: <sim; exceções>

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |

### Métricas da rodada

Achados por severidade; tokens e tempo por dimensão (quando disponível); gatilhos visuais disparados; dimensões herdadas.
```

Modelo do `RISCO-ACEITO.md` (rascunho preparado pelo gatekeeper; quem aceita preenche e assina):

```
# RISCO ACEITO em V2-Fnn-Enn

- Critério: <texto exato do critério>
- Por que não foi provado: <BLOCKED da rodada n, motivo>
- Admite aceite? <sim, não está na lista da seção 7 de 28 | NÃO: item k da lista; este arquivo não vale>
- Risco: <o que pode dar errado>
- Mitigação: <o que reduz o risco enquanto não há prova>
- Dono: <quem acompanha>
- Validade: <data AAAA-MM-DD ou gate em que é reavaliado>
- Quem aceitou: <Rafael | Alyson | profissional> em <data>
- O BLOCKED original continua em VEREDITO.md, rodada <n>.
```
