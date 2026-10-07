---
name: relatorio-semanal
description: Gera o RELATÓRIO SEMANAL de evolução do Defesa Civil 360 (pedido "gere o relatório semanal", toda segunda-feira) para Rafael revisar e enviar ao sócio na terça. Roda em Sonnet. Coleta o período do STATUS e do git, redige o HTML a partir do esqueleto em tom executivo, confere que nada está mais forte que o status registrado, gera o PDF e atualiza o índice. NUNCA envia nada a ninguém.
---

# Relatório semanal (Defesa Civil 360)

Rafael presta contas ao sócio toda terça-feira. Você prepara o relatório na segunda para ele revisar. Política: `docs/roadmap-v2/28-execucao-e-validacao.md`, seção 16.

**Modelo:** Sonnet. Não escale para Opus: o texto vem de fatos já coletados, e a conferência mecânica (`conferir-relatorio.mjs`) é o que segura a honestidade.

## O que o relatório é, e o que não é

- É uma VISÃO do estado que o processo já mantém (STATUS, gates, checkpoints, diário, git). Não é uma auditoria nova: você NÃO relê as 618 etapas, NÃO reroda teste, NÃO abre `saidas/` nem conteúdo bruto de evidência.
- É escrito para um sócio que não lê código. Tom humano, executivo, profissional, sem jargão. Quando citar algo técnico, diga o IMPACTO.
  - Ruim: "Middleware de vigência voltou ao comTenant".
  - Bom: "A segurança de sessão foi corrigida para impedir que contas desativadas continuem operando".
- NUNCA infle o status. O que o STATUS diz é o teto do que você pode escrever.
- NUNCA envie nada a ninguém (e-mail, mensagem, upload). Você entrega o caminho do arquivo e um resumo para Rafael. O envio é dele.
- NUNCA faça commit sem Rafael pedir. Os arquivos ficam na árvore de trabalho.

## Passos

### 1. Conferir o chão

1. `git status` e `git log --oneline -5`. Anote o ramo e o SHA do HEAD.
2. `node scripts/roadmap/gerar-estado.mjs --conferir`. Se falhar, diga a Rafael no resumo final (o estado gerado está desatualizado), mas siga: a coleta lê o STATUS, não o ESTADO.
3. Leia `docs/relatorios-v2/semanais/INDEX.md`. O período novo deve começar no dia seguinte ao fim do relatório anterior. Se houver buraco ou sobreposição, avise Rafael antes de seguir.

### 2. Coletar

O período vai da segunda-feira anterior (se hoje é segunda, a de 7 dias atrás) até hoje. O arquivo leva a data de hoje (a segunda em que você gera): `AAAA-MM-DD`.

```bash
node scripts/roadmap/coletar-relatorio.mjs --desde AAAA-MM-DD --ate AAAA-MM-DD --saida docs/relatorios-v2/semanais/AAAA-MM-DD.json
```

Leia o JSON inteiro e os `avisos`. Os que mais importam:

- `base.statusBase.etapasPresumidasPendentes: true` significa que o STATUS nasceu dentro do período e as mudanças foram comparadas com a hipótese "tudo começou PENDENTE". Não afirme mais que isso.
- Aviso de STATUS não commitado: a coleta reflete a cópia de trabalho; diga isso a Rafael.
- `mudancas.obrigatorias` lista as etapas que o texto é OBRIGADO a citar (regressão, reprovação, bloqueio novo, cancelamento). Gates reabertos (`gatesReabertos` e `mudancas.gates` com `reaberto`) também.

### 3. Redigir

Copie `docs/relatorios-v2/modelo/semanal.html` para `docs/relatorios-v2/semanais/AAAA-MM-DD.html` e troque cada `{{...}}`. Qualquer `{{` que sobrar reprova na conferência. Mapa da coleta para o relatório:

| Seção | De onde vem |
| --- | --- |
| Cabeçalho (período, fase, gate, situação) | `periodo`, `fase`, `fase.statusDoGate`; a situação você decide (ver abaixo) |
| Resumo executivo | 3 a 5 frases: onde a semana deixou o projeto, o que foi provado, o que não foi, o que depende de quem |
| Onde estamos | `fasesConcluidas`, `fase`, `proximasFases` (a atual e as duas seguintes; NUNCA as 36) |
| Implementado (aguarda validação) | `mudancas.etapas` e `etapasDaFase` com status IMPLEMENTADA, EM VALIDAÇÃO ou EM ANDAMENTO com "falta" |
| Validado | status VALIDADA ou VALIDADA COM PENDÊNCIA HUMANA |
| Concluído | status CONCLUÍDA |
| Seguimos com risco aceito | `riscosAceitos` e etapas CONCLUÍDA COM RISCO ACEITO. Só quando houver; sem risco, apague a seção |
| Bloqueios | `bloqueios.porQuem` e `bloqueios.etapasBloqueadas`, nos cinco blocos: Técnico, Rafael, Alyson, Jurídico e DPO, Externo (mesmo vazios: "Nenhum.") |
| Decisões tomadas | `decisoesNovas`, `mudancas.checkpoints` que viraram DECIDIDO, e decisões do `diario` |
| Decisões próximas | `bloqueios.checkpointsAbertos` (atual e próxima fase), dizendo quem decide e o que fica parado |
| Riscos principais | 2 a 4, em linguagem comum, com o efeito no prazo ou na confiança |
| Agora, a seguir, depois | do `diario`, das etapas da fase e da próxima fase; sem prometer data |
| Próximo passo | uma ação concreta, com quem faz |
| Observação de gestão | VAZIA. É de Rafael. Nunca preencha |
| Rodapé | `data-sha` com `base.sha`; commit, ramo e data |

**Vocabulário (a conferência recusa o resto):**

| Status registrado | Como se escreve |
| --- | --- |
| IMPLEMENTADA, EM VALIDAÇÃO, EM ANDAMENTO com "falta validação" | "implementado, aguarda validação". Nunca "pronto", "entregue", "validado" |
| VALIDADA | "validado" |
| VALIDADA COM PENDÊNCIA HUMANA | "validado, falta <o quê>" |
| CONCLUÍDA | "concluído" ou "entregue" |
| CONCLUÍDA COM RISCO ACEITO | "concluído com risco aceito", nunca só "concluído" |
| REPROVADA | "em correção" |
| BLOQUEADA | "bloqueado por <motivo>" |
| PENDENTE | "ainda não começou" |
| (gate) | "fase concluída" só com o gate APROVADO (ou APROVADO COM RISCO ACEITO) |

**Situação do cabeçalho** (`data-situacao`): NO RUMO (nenhum bloqueio, nenhuma regressão, nenhum gate reaberto, nada travando a fase atual), ATENÇÃO (há travas que se resolvem com uma decisão ou uma validação) ou BLOQUEADO (a fase não anda). Escreva uma frase com o motivo. NO RUMO com bloqueio reprova.

**Regras de redação:**

1. Todo item que fala de uma etapa leva `data-etapa="V2-Fnn-Enn"` e `data-status="<status registrado>"`, igual ao `statusPorEtapa` da coleta. O texto do item nunca é mais forte que esse status.
2. O título da etapa, se citado do jeito que está no roadmap, vai num elemento com `data-titulo` (títulos como "conforme política aprovada" não são afirmação). Melhor ainda: reescreva em linguagem comum.
3. Sem travessão (U+2014) em lugar nenhum: use vírgula, dois pontos ou parênteses.
4. Sem segredo, sem token, sem senha, sem dado pessoal, sem nome da semente de teste (nomes de municípios e pessoas fictícios).
5. Segurança em nível executivo: diga que a falha foi corrigida e o efeito, nunca a rota, o arquivo, o passo de exploração nem o nome do papel de banco.
6. Evite números de teste em excesso. Um número só quando ele ajuda o sócio a entender escala.
7. Se precisar traduzir o impacto de uma etapa e a observação do STATUS não bastar, leia só o TÍTULO e a seção `## Fatos` do `RESUMO.md` dela em `docs/evidencias-v2/Gnn/V2-Fnn-Enn/`. Nada além disso.
8. Em "Onde estamos", cada fase vai numa linha com `data-gate="Gnn"` e `data-status="<status registrado do gate>"`. Gate reaberto precisa de uma linha assim, e a seção de bloqueios precisa citá-lo.
9. Se a coleta traz etapa com `tipo` regressão, reprovada, bloqueada ou cancelada, ela precisa aparecer com `data-etapa`. Explique a causa e o que desbloqueia.

### 4. Conferir

```bash
node scripts/roadmap/conferir-relatorio.mjs docs/relatorios-v2/semanais/AAAA-MM-DD.html --dados docs/relatorios-v2/semanais/AAAA-MM-DD.json
```

Código 0 é o único resultado aceitável. Se reprovar, corrija o TEXTO (nunca o `data-status`, nunca a coleta, nunca o conferidor). Se achar que o conferidor está errado, não contorne: escreva o caso no resumo para Rafael.

### 5. PDF

```bash
node scripts/roadmap/gerar-pdf.mjs docs/relatorios-v2/semanais/AAAA-MM-DD.html
```

Confira a linha de saída: bytes maiores que zero, páginas contadas, `erros de console: 0` e `requisições recusadas: 0`. Aviso de fonte significa que a fonte do Google não carregou (sem internet): o PDF sai na fonte de reserva; gere de novo com rede se for o PDF que vai para o sócio. O PDF fica fora do git (`.gitignore`); anote o SHA-256 que o script imprime.

### 6. Índice

Acrescente uma linha em `docs/relatorios-v2/semanais/INDEX.md`: data, arquivo, período, SHA de base (curto) e SHA-256 do PDF. Nunca apague linha anterior.

### 7. Entregar

Responda a Rafael com:

1. o caminho do PDF e do HTML;
2. um resumo de 5 linhas (situação, o que mudou, o que travou, o que ele precisa decidir, próximo passo);
3. os avisos da coleta que ele precisa saber (STATUS não commitado, base presumida, estado desatualizado);
4. a frase: "Não enviei nada a ninguém. A revisão e o envio são seus."
