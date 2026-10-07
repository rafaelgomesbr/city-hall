---
name: relatorio-de-fase
description: Gera o RELATÓRIO DE CONCLUSÃO DE FASE do Defesa Civil 360 (pedido "gere o relatório da F00") quando, e só quando, o gate da fase está APROVADO e o merge foi feito. Idempotente pelo índice docs/relatorios-v2/fases/INDEX.md. Recusa gerar se o gate não passou. Roda em Sonnet. NUNCA envia nada a ninguém.
---

# Relatório de conclusão de fase (Defesa Civil 360)

Um relatório por fase, escrito quando o gate dela fica APROVADO e o merge está feito, para Rafael mostrar ao sócio o que a fase entregou, como foi provado e o que ela libera. Política: `docs/roadmap-v2/28-execucao-e-validacao.md`, seção 16. Mesmo tom e mesmas regras de redação da skill `relatorio-semanal` (leia a seção "Redigir" dela): executivo, impacto em vez de arquivo, nunca mais forte que o status registrado, sem travessão, sem segredo, segurança em nível executivo.

**Modelo:** Sonnet. NUNCA envie nada a ninguém. NUNCA faça commit sem Rafael pedir.

## Pré-condições (todas, nesta ordem; qualquer falha é PARAR e dizer qual)

1. **O gate passou.** Em `docs/roadmap-v2/STATUS.md`, seção 6, o gate da fase está `APROVADO` ou `APROVADO COM RISCO ACEITO`. `RECOMENDADO`, `EM ANDAMENTO`, `REPROVADO`, `REABERTO` e `NÃO INICIADO` NÃO bastam. Resposta nesses casos: "O gate <Gnn> está <status>: o relatório de fase só existe depois da aprovação e do merge. Não gerei nada."
2. **Existe `docs/evidencias-v2/Gnn/GATE.md`** com quem aprovou, a data e o SHA do merge. Sem ele, o gate não está de fato aprovado (a política exige o arquivo): PARE.
3. **O merge foi feito.** O SHA do merge citado no `GATE.md` existe e está em master: `git merge-base --is-ancestor <sha-do-merge> master` com código 0. Se o repositório local não tem master atualizada, diga isso e PARE em vez de supor.
4. **Idempotência.** Leia `docs/relatorios-v2/fases/INDEX.md`. Se a fase já tem linha e `docs/relatorios-v2/fases/Fnn.html` existe, NÃO gere de novo: responda com o caminho existente e o SHA-256 registrado. Só regere se Rafael pedir explicitamente (e então registre a nova linha sem apagar a antiga).
5. **O gate não foi reaberto depois.** `gerar-estado.mjs` e a coleta mostram `gatesReabertos` vazio para esse gate. Se estiver REABERTO, não é conclusão: PARE.

## Passos

### 1. Coletar

O período vai do início da fase até hoje. O início é a data da primeira entrada do diário da fase (seção 10 do STATUS) ou o primeiro commit `V2-Fnn-`: `git log --reverse --format=%ad --date=short --grep="V2-Fnn-" | head -1`.

```bash
node scripts/roadmap/coletar-relatorio.mjs --desde AAAA-MM-DD --ate AAAA-MM-DD --fase Fnn --saida docs/relatorios-v2/fases/Fnn.json
```

`--fase Fnn` fixa o relatório na fase, mesmo que a "fase atual" do estado já seja outra. Leia o JSON e os `avisos`.

### 2. Redigir

Copie `docs/relatorios-v2/modelo/fase.html` para `docs/relatorios-v2/fases/Fnn.html` e troque cada `{{...}}`. Fontes dos fatos: o bloco da fase (`cabecalhoDaFase`: objetivo e "por que"), `GATE.md` (quem aprovou, itens provados, itens com risco aceito), os `VEREDITO.md` e `RISCO-ACEITO.md` (só o veredito e o critério; nunca `saidas/`), o diário do período e `statusPorEtapa` da coleta.

| Seção | Conteúdo |
| --- | --- |
| Objetivo | o que a fase se propunha |
| Por que a fase existia | o problema antes dela |
| Situação antes | fatos medidos no começo, sem adjetivo |
| O que foi feito, por capacidade | agrupado pelo que o produto passou a fazer, com `data-etapa` e `data-status` em cada linha |
| Antes e depois | tabela de pontos |
| Como provamos | quem validou, sobre qual commit, que tipo de prova; sem rota nem comando |
| Gate | quem aprovou e quando; RISCOS ACEITOS À PARTE, nunca misturados com o que foi provado |
| Riscos residuais | o que continua risco depois da fase |
| Decisões tomadas | decisões e checkpoints decididos na fase |
| Itens adiados | o que ficou para depois, com motivo |
| O que a fase libera | o que pode começar agora (a seção "Este Gate libera" do gate) |
| Próxima fase | a seguinte NA ORDEM DE EXECUÇÃO (seção 5 do STATUS), com gate e etapas |

Em `data-status`, escreva o status REGISTRADO de cada etapa. Etapa CONCLUÍDA COM RISCO ACEITO aparece com o qualificador "risco aceito" e na parte de risco aceito do gate.

### 3. Conferir

```bash
node scripts/roadmap/conferir-relatorio.mjs docs/relatorios-v2/fases/Fnn.html --dados docs/relatorios-v2/fases/Fnn.json
```

Código 0 é o único resultado aceitável. A conferência recusa relatório de fase cujo gate não esteja aprovado na coleta.

### 4. PDF e índice

```bash
node scripts/roadmap/gerar-pdf.mjs docs/relatorios-v2/fases/Fnn.html
```

Confira bytes, páginas, `erros de console: 0` e `requisições recusadas: 0`. O PDF fica fora do git. Acrescente a linha em `docs/relatorios-v2/fases/INDEX.md`: fase, gate, data, arquivo, SHA do merge do gate, SHA de base da coleta e SHA-256 do PDF.

### 5. Entregar

Responda a Rafael com o caminho do PDF e do HTML, um resumo de 5 linhas (o que a fase entregou, como foi provado, o risco aceito que seguiu, o que ela libera, qual é a próxima) e a frase: "Não enviei nada a ninguém. A revisão e o envio são seus."
