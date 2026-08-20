# Prompt inicial (cole este texto na primeira sessão do Claude Code)

Leia CLAUDE.md e docs/CONTEXTO.md antes de qualquer coisa.

Sua primeira tarefa é SOMENTE planejamento. Não escreva nenhuma linha do protótipo ainda.

1. Crie docs/ROADMAP_FASE0.md com o plano completo da Fase 0 em checkpoints numerados (CP1, CP2, ...). Para cada checkpoint, defina:
   - objetivo em uma frase;
   - entregáveis (arquivos e telas);
   - critérios de aceite verificáveis, no formato "ao fazer X, acontece Y";
   - gate de QA: o que o agente revisor-qa vai verificar;
   - gate de UX: o que o agente revisor-ux vai verificar;
   - o que fica explicitamente de fora do checkpoint.

2. Use esta estrutura como base, refinando o que julgar melhor:
   - CP1: esqueleto do protótipo importando design-system/tokens.css como fonte única de estilos (nenhuma cor, sombra ou duração fora dos tokens --ds-*), modo claro e escuro completos com alternância visível, navegação entre telas e dados mock.
   - CP2: painel do coordenador com fila de ocorrências, prioridades, prazos e contador de atrasadas.
   - CP3: abertura de ocorrência, aviso de possível duplicidade, triagem (tipo COBRADE, gravidade, vulnerabilidade) e despacho para equipe com prazo.
   - CP4: visão do agente em moldura de celular: lista de tarefas, checklist de vistoria, foto simulada, GPS com precisão exibida e o simulador de offline com fila de sincronização funcional.
   - CP5: documento de vistoria simulado com aparência de documento oficial (protocolo, checklist, fotos, autoria, data, versão e QR de validação) e linha do tempo auditável da ocorrência.
   - CP6: mapa estático com filtros por tipo e status, providência encaminhada a outra secretaria com prazo, e encerramento com motivo obrigatório.
   - CP7: docs/APRESENTACAO.md, documento humano para a reunião (problema, solução, fluxo, diferenciais, o que não é, próximos passos) e um roteiro de demo de 10 minutos.
   - CP8: rodada final de QA e UX no conjunto inteiro, correções e empacotamento para o pior caso de apresentação (máquina desconhecida, sem internet, projetor ruim): zip único com LEIA-ME.txt de abertura em 3 passos para leigos, mais um roteiro de gravação de vídeo de demonstração de 3 a 5 minutos como plano B da demo.

3. Apresente o roadmap e AGUARDE minha aprovação explícita antes de executar qualquer checkpoint.

Depois da aprovação, execute um checkpoint por vez, seguindo à risca o protocolo de checkpoints do CLAUDE.md: concluir, rodar revisor-qa, rodar revisor-ux, corrigir críticos, parar e me mostrar.
