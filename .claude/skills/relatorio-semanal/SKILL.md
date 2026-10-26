---
name: relatorio-semanal
description: Gera o RELATÓRIO SEMANAL de evolução do Defesa Civil 360 (pedido "gere o relatório semanal", toda segunda-feira) para Rafael revisar e levar ao sócio na terça. Desde 2026-10-13 o formato é VISUAL (página única, linha do tempo, gráficos, imagens e seção de prazo e estimativa) e é redigido pelo agente `relatorio-semanal-visual`, em Sonnet. Os números vêm de scripts. NUNCA envia nada a ninguém.
---

# Relatório semanal (Defesa Civil 360)

Rafael presta contas ao sócio toda terça-feira. Você prepara o relatório na segunda para ele revisar. Política: `docs/roadmap-v2/28-execucao-e-validacao.md`, seção 16.

**Formato (decisão de Rafael, 2026-10-13):** o relatório é uma página visual e curta, publicada em https://dc360-painel-web.vercel.app/progresso (protegida por senha) e atualizada a cada etapa e a cada semana. O formato antigo (HTML formal com PDF, esqueleto em `docs/relatorios-v2/modelo/semanal.html` e `conferir-relatorio.mjs`) continua no repositório e só é usado se Rafael pedir "o relatório formal" ou "em PDF".

**Modelo:** Sonnet. Não escale para Opus: o texto vem de fatos coletados, e os scripts calculam todos os números.

## Peças

| Peça | Para que serve |
| --- | --- |
| `scripts/roadmap/coletar-relatorio.mjs` | coleta o período do STATUS e do git (`statusPorEtapa`, fase atual, bloqueios, diário) |
| `scripts/roadmap/estimar-prazo.mjs` | mede o ritmo e estima prazo por cenário, por fase, por etapa e para o total (parâmetros em `docs/relatorios-v2/modelo/estimativa-parametros.json`) |
| `scripts/roadmap/relatorio-visual.mjs` | monta a página (CSS em `docs/relatorios-v2/modelo/relatorio-visual.css`, blocos em `blocos.json`) e reprova texto mais forte que o status |
| `scripts/roadmap/publicar-progresso.mjs` | roda coleta, estimativa e gerador e publica na Vercel (`--sem-deploy` só gera); o site fica em `docs/relatorios-v2/site/` |
| `docs/relatorios-v2/semanais/progresso/editorial.json` | o texto vivo da página (frase de abertura, achados, decisões); o agente reescreve toda semana |
| `docs/relatorios-v2/semanais/linha-do-tempo.json` | histórico da V2 desde 30/09; só cresce |
| `.claude/agents/relatorio-semanal-visual.md` | o agente que escreve frases, marcos e decisões |

## Passos

1. **Chão.** `git status`, `git log --oneline -5`, `node scripts/roadmap/gerar-estado.mjs --conferir`. Leia `docs/relatorios-v2/semanais/INDEX.md`: o período novo começa no dia seguinte ao fim do anterior; buraco ou sobreposição, avise Rafael antes.
2. **Delegar ao agente `relatorio-semanal-visual`**, com `model: "sonnet"` explícito. Prompt: a data de hoje, o período, "siga o seu arquivo de instruções" e o pedido de devolver o endereço da página publicada. O agente coleta, estima, atualiza a linha do tempo, escreve o editorial, gera e confere a página, publica e registra no índice.
3. **Conferir o que ele devolveu.** Rode você mesmo `node --test scripts/roadmap/estimar-prazo.test.mjs scripts/roadmap/relatorio-visual.test.mjs` (os textos reais da semana passam por teste) e abra `docs/relatorios-v2/site/progresso/index.html` uma vez em tela larga e em celular. Texto reprovado: o agente corrige o TEXTO, nunca o gerador.
4. **Publicar.** O agente já publicou com `node scripts/roadmap/publicar-progresso.mjs`. Confira no ar: `curl -s -o /dev/null -w "%{http_code}" -u x:<senha> https://dc360-painel-web.vercel.app/progresso` deve dar 200 e, sem senha, 401. A senha mora só na variável PROGRESSO_SENHA do projeto `dc360-progresso` na Vercel; NUNCA a escreva em arquivo, relatório ou commit.
5. **Entregar** a Rafael, em no máximo 10 linhas: o link (https://dc360-painel-web.vercel.app/progresso), o que mudou na semana (3 linhas), a estimativa (ritmo medido, fim provável com a faixa, o que a meta de 31/12 exigiria), os avisos da coleta (STATUS não commitado, estado gerado desatualizado) e a frase: "Não enviei nada a ninguém. A revisão e o envio são seus."

## Atualização a cada etapa

Ao fim de cada etapa (commit candidato e registro de validação), rode `node scripts/roadmap/publicar-progresso.mjs`: os números (indicadores, barras, quadro de etapas, blocos e estimativa) se atualizam sozinhos a partir do STATUS; o texto fica o da semana. Se a CLI da Vercel pedir login, avise Rafael (o login é dele, na máquina, e não se guarda token em arquivo).

## Regras que valem sempre

- NUNCA envie nada a ninguém. NUNCA faça commit sem Rafael pedir. Atualizar a página protegida do próprio projeto não é enviar a ninguém.
- O texto nunca é mais forte que o status registrado (vocabulário em `.claude/agents/relatorio-semanal-visual.md`).
- A estimativa é uma conta sobre o ritmo medido, com premissas à vista, e não uma promessa. Quem altera meta ou parâmetros é Rafael.
- Sem travessão, sem segredo, sem dado real de pessoa.
