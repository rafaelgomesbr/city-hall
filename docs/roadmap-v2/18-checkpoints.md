# Checkpoints de decisão do Roadmap V2

Este arquivo reúne os 95 checkpoints (CP-01 a CP-95) do Roadmap V2: os 40 originais (CP-01 a CP-40) e os 55 criados pela revisão de escopo de 2026-10-01 (CP-41 a CP-95, decisões D-07 a D-29 em `01-decisoes-e-principios.md`, seção 11). Cada um está posicionado na fase e na etapa em que a decisão passa a ser necessária, e diz o que fica bloqueado enquanto ela não vem. Os arquivos de fase só citam o identificador `CP-nn`.

**Estado em 2026-10-02 dos 40 originais:** CP-01, CP-02, CP-18, CP-23 e CP-40 foram decididos por Rafael em 2026-10-01 (CP-02 e CP-18 como premissa a confirmar); CP-20 e CP-30 ficaram parciais (a parte decidida está em cada bloco, a pendente continua aberta). Os demais seguem em aberto. A decisão não apaga a recomendação anterior: cada bloco guarda o histórico e marca como SUPERADA a parte que a decisão contradiz.

**Os 55 novos nascem em aberto.** Eles vieram dos nomes provisórios (prefixo "NOVO" mais o assunto, por exemplo `NOVO-LICENCAS`) que os arquivos de fase usavam enquanto a revisão corria. Quando o mesmo assunto aparecia sob mais de um nome ou grafia, foi unificado em um único número, e o bloco diz quais nomes ele absorveu. Depois da troca nos arquivos de fase, nenhum deles deve citar mais um nome provisório: só o número `CP-nn`.

**Como ler:**

- Um checkpoint é uma decisão HUMANA. O roadmap não decide por Rafael, Alyson, município, jurídico ou DPO: ele recomenda tecnicamente quando o assunto é técnico e descreve o que se implementa sem decidir quando o assunto é jurídico.
- Marcador 🛑 = decisão de Rafael e/ou Alyson (negócio, competência, política). Marcador ⚖️ = decisão jurídica, de DPO ou do município: o roadmap NÃO escolhe.
- A numeração `CP-nn` (com hífen) é da V2. Os checkpoints `CP1` a `CP9` de `docs/ROADMAP_FASE0.md` são do protótipo e não têm relação com estes.
- Origem usa os identificadores do Decision Pack (`DP:K`, `DP:J`, `DP:R`), das decisões do pedido (`PR:A-02`) e dos relatórios de auditoria (`REL:NN`).
- A decisão é registrada em `docs/evidencias-v2/CP-nn/decisao.md` (data em formato ISO, quem decidiu, alternativa escolhida, justificativa em poucas linhas). Sem segredo, token, contrato com valor confidencial ou dado pessoal.
- Um checkpoint em aberto não impede escrever nem planejar o que vem depois: ele só trava as etapas listadas em "O que fica bloqueado". Quando um checkpoint ainda não foi decidido na hora de executar a etapa que ele trava, a execução PARA nessa etapa e pergunta.

## Índice

| CP | Assunto | Origem | Fase e etapa que ele trava | Quem decide |
| --- | --- | --- | --- | --- |
| CP-01 | Capacidade, custo e plano da onda (DECIDIDO: 1 pessoa dedicada, D-28) | DP:R1, PR:D-28 | antes de F00 | 🛑 Rafael |
| CP-02 | Saída a campo: implementar ou retirar a promessa (DECIDIDO: implementar, D-25, premissa) | DP:K14, PR:D-25 | F00-E24, F14-E01 | 🛑 Rafael, Alyson |
| CP-03 | Política de npm audit | PR:D-04 | F00-E19, F01-E06 | 🛑 Rafael |
| CP-04 | Entidade, domínio, contas de loja, marca e bundle ids | DP:R5 | F01-E10, F01-E13 | 🛑 Rafael, Alyson |
| CP-05 | Contratação do ambiente de homologação | DP:R6 | F01-E11 | 🛑 Rafael |
| CP-06 | Ferramenta de erro e de log, residência do dado | DP:K13, DP:J7 | F01-E14 | 🛑 Rafael e ⚖️ jurídico |
| CP-07 | Segunda pessoa com acesso e plantão | DP:K15 | F01-E16, F21-E06, F27-E02 | 🛑 Rafael |
| CP-08 | MFA obrigatório para usuário de órgão | DP:K4 | F03-E11, F12-E06 | 🛑 Alyson |
| CP-09 | Conteúdo do dossiê mínimo e o que desce ao agente | DP:K3, DP:J6 | F04-E04, F12-E04, F19-E01 | 🛑 Alyson e ⚖️ DPO, município |
| CP-10 | Retenção padrão, IP e user-agent, documento emitido | DP:K6, DP:J4 | F05-E09, F05-E12, F09-E12 | 🛑 município e ⚖️ jurídico |
| CP-11 | Privacidade: base legal, política, termos, aceite, menores, titular, encarregado | DP:J1, J2, J3, J5, J13 | F05-E06 a E08, F15-E15, F17-E14, F28-E03 | ⚖️ jurídico, DPO |
| CP-12 | PDF da secretaria antes do scanner completo | DP:K11 | F06-E14 | 🛑 Rafael |
| CP-13 | Cotas e limites de anexo | DP:K10 | F06-E09, F27-E06 | 🛑 Rafael |
| CP-14 | Aprovação, nomenclatura jurídica e marca d'água | DP:K16, DP:J8 | F09-E08, F09-E14, F28-E06 | 🛑 município, Alyson e ⚖️ jurídico |
| CP-15 | PDF oficial acessível (tagged) | DP:K21 | F09-E15, F23-E06 | 🛑 Rafael |
| CP-16 | QR de validação de autenticidade | PR:Prompt-F09 | F09-E13 | 🛑 Alyson |
| CP-17 | Encerramento com providência em aberto | DP:K5 | F10-E13 | 🛑 Alyson |
| CP-18 | Foto de perfil no painel (DECIDIDO: construir, D-26, premissa) | BZ-N:N.8, PR:D-26 | F10-E09 | 🛑 Rafael |
| CP-19 | Contratação para uso externo (e-mail, storage, banco, erro) | DP:R6 | F00-E10, F11-E17, F12-E02, F15-E04, F22-E01, F27-E01 | 🛑 Rafael |
| CP-20 | Secretaria piloto, estados e atribuição do encaminhamento (PARCIAL: devolução só antes do aceite, D-23) | DP:K1, DP:K22, DP:R2, PR:D-23 | F12-E02 | 🛑 Alyson |
| CP-21 | Percentuais de lembrete e cadeia de escalonamento | DP:K2 | F12-E03 | 🛑 Alyson, município |
| CP-22 | Ofício por link: manter ou desligar | REL:05 D13 | F10-E14, F12-E06 | 🛑 Alyson |
| CP-23 | Reabertura de ocorrência x ocorrência vinculada (DECIDIDO: reabrir por 30 dias e depois vinculada, D-21) | DP:K17, PR:D-21 | F13-E06, F13-E10 | 🛑 Alyson |
| CP-24 | Detalhes do app do agente | DP:K14 | F14-E01, F14-E04, F14-E06 | 🛑 Rafael, Alyson |
| CP-25 | Papel PostgreSQL da API pública | PR:A-02 | F15-E01 | 🛑 Rafael (decisão técnica com evidência) |
| CP-26 | Trote, abuso e conteúdo ilícito | DP:J11 | F15-E11, F18-E09 | ⚖️ jurídico |
| CP-27 | Anti-abuso além da base | DP:K9 | G17, F27-E06 | 🛑 Rafael |
| CP-28 | Habilitação do canal por município e processo de triagem | PR:D-03 | F15-E13, F27-E01 | 🛑 município, Alyson |
| CP-29 | O que se preserva de município eliminado | DP:J12 | F05-E05, F20-E04 | ⚖️ jurídico, município |
| CP-30 | Suporte do fornecedor e acesso assistido (PARCIAL: somente leitura, D-10; falta o parecer J10) | DP:J10, PR:D-10 | F20-E01, F20-E11 | ⚖️ jurídico e 🛑 Rafael |
| CP-31 | RPO, RTO e disponibilidade a prometer | DP:R7 | F22-E01, F22-E02, F28-E05 | 🛑 Rafael, Alyson |
| CP-32 | Acessibilidade: aplicabilidade legal e teste com pessoa com deficiência | DP:J9 | F23-E05, F23-E07 | ⚖️ jurídico e 🛑 Alyson |
| CP-33 | Pentest externo: contratação e escopo | DP:T34 | F25-E12 | 🛑 Rafael |
| CP-34 | Piloto municipal: prefeitura, secretaria, agentes, período | DP:R2 | F27-E01 | 🛑 Rafael, Alyson, município |
| CP-35 | Revalidação dos itens fora da V2 | DP:K8, K12, K19, K20 | F28-E12 | 🛑 Rafael, Alyson |
| CP-36 | Replanejamento de capacidade e custo da próxima onda | DP:R1 | G08, G12, G19 | 🛑 Rafael |
| CP-37 | Resultado da medição de RPO e RTO | DP:K7 | F22-E07 | 🛑 Rafael |
| CP-38 | Orientação do aparelho e layout de tablet no app do cidadão | DP:K18 | F17-E15 | 🛑 Alyson |
| CP-39 | Alternativa à assinatura por traço de dedo na vistoria | BZ-D:A11-27 | F14, F23-E08 | 🛑 Alyson |
| CP-40 | Lacunas do MVP do documento do Alyson (DECIDIDO: L1 a L26 entram na V2, D-20) | ALY (REL:09), PR:D-20 | G10, G28 | 🛑 Alyson, Rafael |
| CP-41 | Provedor de assinatura externa: escolha, tarifa e contrato | PR:D-09 | F09-E22, F09-E27, F10-E32, F10-E35, F28-E15 | 🛑 Rafael, município e ⚖️ jurídico |
| CP-42 | Texto e fundamento legal da notificação ao responsável pelo imóvel | PR:D-20 (L8) | F09-E17, F10-E36, F33-E10 | ⚖️ município e jurídico dele |
| CP-43 | Licenças de dependência permitidas e proibidas | PR:D-19 | F01-E19, F25-E01, F25-E21 | 🛑 Rafael e ⚖️ jurídico |
| CP-44 | PostGIS no provedor gerenciado de HML e de produção | PR:D-16 | F01-E22, F16-E05, F32-E02, F32-E16 | 🛑 Rafael |
| CP-45 | VLibras: integração no app e script do governo nas telas web | PR:D-12 | F08-E12, F11-E30, F17-E15, F23-E10, F35-E12 | 🛑 Rafael |
| CP-46 | CPF obrigatório no relato identificado: base legal e finalidade | PR:D-07 | F15-E15, F16-E16, F17-E20, F18-E13 | ⚖️ jurídico, DPO e 🛑 Rafael |
| CP-47 | Custo de armazenamento e de máquina do vídeo do relato | PR:D-07 | F07-E11, F22-E02, F24-E10, F34-E04 | 🛑 Rafael |
| CP-48 | Destino da foto de vistoria sinalizada pelo antivírus | PR:D-20 (L6) | F06-E23, F14-E22 | 🛑 Alyson e ⚖️ jurídico |
| CP-49 | Pessoa global: parecer do encarregado sobre identidade global | PR:D-08 | F03-E15, F20-E18 | ⚖️ DPO e 🛑 Rafael |
| CP-50 | Segundo fator e redefinição de acesso da pessoa com vários municípios | PR:D-08 | F03-E11, F11-E23, F20-E02 | 🛑 Rafael e Alyson |
| CP-51 | Termo, base legal e piloto do órgão externo | PR:D-08 | F03-E17, F11-E24, F12-E08 | ⚖️ jurídico e 🛑 Rafael, Alyson |
| CP-52 | Níveis de sigilo da ocorrência e quem vê cada um | PR:D-20 (L12) | F03-E21, F10-E31 | 🛑 Alyson e ⚖️ jurídico, DPO |
| CP-53 | Escalonamento por município e rigor da competência do órgão | PR:D-18 | F04-E15, F04-E16 | 🛑 Alyson e município |
| CP-54 | Prazo padrão e teto do acesso assistido do fornecedor | PR:D-10 | F10-E16, F20-E01, F20-E11 | 🛑 Rafael e Alyson |
| CP-55 | Lista final de motivos de encerramento da ocorrência | PR:D-20 (L18) | F10-E27 | 🛑 Alyson |
| CP-56 | Definição de taxa de atendimento e tempo de resposta por órgão | PR:D-19 | F10-E21 | 🛑 Alyson |
| CP-57 | Agente que perde o aparelho e os códigos: desligar o segundo fator dele | PR:D-27 | F14-E16 | 🛑 Rafael |
| CP-58 | Fonte, licença e custo dos tiles do mapa offline | PR:D-20 (L23) | F14-E21 | 🛑 Rafael |
| CP-59 | Tokens de municípios diferentes na mesma sessão do portal | PR:D-08 | F11-E29 | 🛑 Rafael |
| CP-60 | Destino, país e retenção dos traces (OpenTelemetry) | PR:D-13 | F21-E10, F21-E12, F21-E14 | 🛑 Rafael |
| CP-61 | Planos, valores, excedente, nota fiscal e cobrança por gateway | PR:D-19 | F20-E14 | 🛑 Rafael e Alyson |
| CP-62 | Escala de níveis do incidente e estrutura de comando | PR:D-15 | F29-E01, F29-E03 | 🛑 Alyson |
| CP-63 | Papéis de incidente e de logística | PR:D-15 | F29-E01, F30-E02 | 🛑 Rafael e Alyson |
| CP-64 | Conteúdo do relatório de situação do incidente | PR:D-15 (INC-04) | F29-E15 | 🛑 Alyson |
| CP-65 | Cadastro nominal de abrigados | PR:D-15 (ABR-01) | F29-E09 | 🛑 Rafael e ⚖️ jurídico, DPO |
| CP-66 | Saldo negativo de estoque com o agente offline | PR:D-15 (RN-09) | F30-E01, F30-E04, F30-E14 | 🛑 Rafael |
| CP-67 | Quem aprova ajuste de estoque | PR:D-15 (RN-09) | F30-E06 | 🛑 Alyson |
| CP-68 | Categorias padrão e itens controlados do catálogo | PR:D-15 (LOG-02) | F30-E03 | 🛑 Alyson e ⚖️ jurídico |
| CP-69 | Dados de doador e de recebedor: finalidade e retenção | PR:D-15 (LOG-05, LOG-06) | F30-E08, F30-E09, F30-E17 | ⚖️ jurídico e DPO |
| CP-70 | Valores finais dos alertas de estoque | PR:D-15 (LOG-04) | F30-E11 | 🛑 Alyson |
| CP-71 | Regra final de kits permanentes e de inventários simulados | PR:D-15 (LOG-07) | F30-E10 | 🛑 Alyson |
| CP-72 | Operação degradada da logística sem o sistema | PR:D-15 (RNF-15) | F30-E16 | 🛑 Alyson e município |
| CP-73 | Revisão das traduções em inglês e em espanhol | PR:D-12 | F23-E11, F35-E11, F35-E14 | 🛑 Rafael |
| CP-74 | Dono e orçamento das rotinas recorrentes de segurança e de DR | PR:D-19 | F25-E21, F28-E16 | 🛑 Rafael |
| CP-75 | Quais módulos novos entram no piloto | PR:D-15, PR:D-16, PR:D-07 | F27-E07, F27-E08, F27-E09 | 🛑 Rafael, Alyson e município |
| CP-76 | Credenciais de integração real que o piloto usa | PR:D-14 | F27-E09, F28-E15 | 🛑 Rafael, Alyson e município |
| CP-77 | Onde mora a chave mestra dos segredos de integração por município | PR:D-14 | F31-E01, F31-E03 | 🛑 Rafael |
| CP-78 | WhatsApp oficial: provedor, conta, modelos e contrato | PR:D-14 | F31-E09 | 🛑 Rafael |
| CP-79 | Relato de cidadão por WhatsApp diante de conta e CPF obrigatórios | PR:D-07, PR:D-14 | F31-E10 | 🛑 Rafael e ⚖️ jurídico |
| CP-80 | Fontes, licença e serviços WMS das camadas GIS | PR:D-14 | F31-E11, F31-E12 | ⚖️ município |
| CP-81 | Existe API pública utilizável do Cemaden | PR:D-14 | F31-E14 | 🛑 Rafael |
| CP-82 | Credenciamento do município no S2ID | PR:D-14 | F31-E15 | ⚖️ município |
| CP-83 | Credenciamento e instância do SEI do município | PR:D-14 | F31-E16 | ⚖️ município |
| CP-84 | Credenciamento para o Defesa Civil Alerta | PR:D-14 | F31-E17 | ⚖️ município |
| CP-85 | Malha municipal do IBGE: fonte, versão, simplificação e carga | PR:D-16 | F32-E03, F16-E05 | 🛑 Rafael |
| CP-86 | Áreas de risco: origem, licença e quem vê | PR:D-16 | F32-E05, F32-E06 | ⚖️ município e 🛑 Alyson |
| CP-87 | O que identifica um imóvel (inscrição, matrícula, endereço) | PR:D-16, PR:D-20 (L4) | F32-E07 | 🛑 município e Alyson |
| CP-88 | Quem publica uma versão de configuração e se precisa de segundo aprovador | PR:D-17 | F33-E04 | 🛑 Alyson e Rafael |
| CP-89 | Quem escreve as perguntas técnicas do checklist por tipo | PR:D-17 (L16) | F33-E05 | 🛑 Alyson |
| CP-90 | Campos, estados e protocolo legado importáveis por CSV | PR:D-17 (OCO-08) | F33-E12, F33-E13 | 🛑 Alyson e município |
| CP-91 | Login gov.br: credenciamento, homologação, escopos e uso da marca | PR:D-07 | F34-E13, F34-E17 | 🛑 Rafael e ⚖️ jurídico |
| CP-92 | Provedor de SMS: preço, teto diário e contrato de dados | PR:D-07 | F34-E15 | 🛑 Rafael |
| CP-93 | Login social: contas de desenvolvedor, regra da Apple e privacidade | PR:D-07 | F34-E16, F34-E17 | 🛑 Rafael |
| CP-94 | Quem responde o chat do relato, em que horário e com que prazo | PR:D-07 | F34-E07 | 🛑 Alyson e município |
| CP-95 | Declaração de uso da imagem do logotipo do município | PR:D-11 | F35-E01, F35-E03 | ⚖️ jurídico |

---

🛑 **CHECKPOINT CP-01: Capacidade, custo e plano da onda**

**Origem:** DP:R1; pedido do roadmap, seção 15.

**Pergunta:** quantas horas por semana de desenvolvimento, quem executa, e qual o teto mensal de custo (infraestrutura, ferramentas, contas de loja, parecer jurídico, teste de acessibilidade, pentest, uso de IA)?

**Por que decidir agora:** o levantamento do projeto fala em uma pessoa com cerca de dez horas por semana. O roadmap tem 352 etapas e cinco superfícies. Sem o número real, as ondas não podem ser dimensionadas e nenhuma promessa de prazo é defensável.

**Alternativas:**
- A: manter a capacidade atual e cortar escopo (o corte natural é adiar o canal do cidadão e partes de F21 a F25).
- B: ampliar a capacidade (segunda pessoa de código ou de revisão e orçamento mensal definido).
- C: executar em ondas, com um marco de decisão de investimento entre elas (CP-36).

**Recomendação técnica:** C. As ondas sugeridas são: 1 (F00 a F08, fundação), 2 (F09 a F12, documentos, painel e portal homologado), 3 (F13 e F14, reinspeção e app do agente), 4 (F15 a F19, canal do cidadão), 5 (F20 a F25, console, operação e segurança), 6 (F26 a F28, POC, piloto e candidata). Cada onda tem critério de saída mensurável (os gates).

**Decisão de 2026-10-01 (D-28):** a capacidade é de UMA pessoa dedicada. Ficam fixados junto: um commit por etapa aprovada, com mensagem `V2-Fnn-Enn: resumo`; repositório privado; seção "Retomada do Roadmap V2" no `CLAUDE.md`. A recomendação C (ondas com marco de decisão) continua valendo. SUPERADA apenas a lista de ondas acima e a contagem de 352 etapas do texto "Por que decidir agora": a V2 ampliada acrescenta as fases F29 a F35 e muitas etapas novas, e a ordem de execução passa a ser a tabela de `STATUS.md` (D-29), não a numeração das fases. Com uma pessoa só, o teto mensal de custo e as horas por semana ainda precisam ser registrados na evidência.

**Quem decide:** Rafael (Alyson para o escopo comercial). Decidido quanto à capacidade; o teto mensal de custo segue a registrar.

**O que fica bloqueado:** o dimensionamento e a ordem de execução das ondas. Não impede preparar a F00, que é obrigatória por D-04.

**Evidência necessária:** `docs/evidencias-v2/CP-01/decisao.md` com horas, pessoas (uma, por D-28), teto mensal de custo e a onda aprovada.

---

🛑 **CHECKPOINT CP-02: Saída a campo, implementar no app ou retirar a promessa**

**Origem:** DP:K14; BZ-N:N.6.

**Pergunta:** a declaração de saída a campo (declarar, prorrogar, retorno) será implementada no app do agente, ou a promessa será retirada da documentação até haver implementação?

**Por que decidir agora:** a API e o painel têm a funcionalidade (rota `POST /saida-a-campo` e afins, 27 testes), mas o app de campo não chama nenhuma delas. `SEGURANCA-DO-AGENTE.md`, o cartão de bolso e a apresentação de 2026-09-15 dizem que o agente declara a saída no app. É promessa de segurança física sem entrega.

**Alternativas:**
- A: implementar no app (F14-E01) e, até lá, ressalvar a documentação como "em construção".
- B: retirar a promessa da documentação e da apresentação até haver decisão.
- C: antecipar uma versão mínima no app antes de qualquer demonstração.

**Recomendação técnica:** A com B imediato: a F00-E24 ajusta a documentação agora e a implementação fica em F14-E01. C só se houver demonstração marcada que dependa dela.

**Decisão de 2026-10-01 (D-25, PREMISSA a confirmar por Rafael):** implementar a saída a campo no app (alternativa A). A recomendação A com B imediato continua válida: a F00-E24 ressalva a documentação como "em construção" até a F14-E01 entregar a funcionalidade. A alternativa B (retirar a promessa) fica descartada, salvo se a premissa for revertida.

**Quem decide:** Rafael e Alyson (a promessa é feita a municípios). Decidido por premissa em 2026-10-01.

**O que fica bloqueado:** qualquer demonstração a município que mencione a funcionalidade antes da F14-E01 entregue. O escopo de F14-E01 está fixado (declarar, prorrogar, retorno e `/minha`).

**Evidência necessária:** `docs/evidencias-v2/CP-02/decisao.md` (com a confirmação da premissa D-25) e o diff dos documentos ajustados (F00-E24).

---

🛑 **CHECKPOINT CP-03: Política de npm audit**

**Origem:** PR:D-04; regra do CLAUDE.md "npm audit precisa fechar em zero"; BZ-F:P0-SEG.

**Pergunta:** qual é a política aprovada para vulnerabilidade de dependência: tolerância zero em qualquer severidade e qualquer árvore, ou zero em tempo de execução e aviso (com prazo) em ferramenta de desenvolvimento?

**Por que decidir agora:** hoje `npm audit --audit-level=low` fica vermelho (1 moderada em tempo de execução na raiz; 4 no app de campo, 1 delas alta em árvore de desenvolvimento). O CI tende a ficar vermelho sem mudança de código. O Gate G00 não fecha sem a regra.

**Alternativas:**
- A: zero em tudo, sem exceção.
- B: política já codificada em `scripts/auditar.mjs`: dependência de tempo de execução com vulnerabilidade conhecida reprova (é bug, não pendência); ferramenta de desenvolvimento aparece sem reprovar; exceção só nomeada, com dono e prazo.
- C: tolerar moderadas.

**Recomendação técnica:** B, mantendo a regra do CLAUDE.md para tempo de execução e exigindo exceção nomeada com prazo para o restante.

**Quem decide:** Rafael (a regra está no CLAUDE.md).

**O que fica bloqueado:** G00 (F00-E19) e F01-E06.

**Evidência necessária:** política registrada no `README.md` (seção de segurança) e saída de `npm run auditar` verde.

---

🛑 **CHECKPOINT CP-04: Entidade, domínio, contas de loja, marca e bundle ids**

**Origem:** DP:R5; REL:10.

**Pergunta:** em nome de quem ficam as contas Apple e Google, a marca do app e o domínio próprio? O bundle id `com.solerte.dc360.campo` é definitivo?

**Por que decidir agora:** não existe domínio próprio (só `fly.dev` e `vercel.app`), necessário para remetente de e-mail verificado, política de privacidade em URL estável e as lojas. O bundle id é definitivo depois de publicado. `apps/campo/eas.json` tem campos Apple "PREENCHER". App em loja pública com dado sensível pode exigir conta de organização (a confirmar).

**Alternativas:**
- A: contas e domínio em nome da empresa do fornecedor, marca DC360 única para todos os municípios.
- B: contas e domínio em nome de pessoa física no piloto, com migração depois.
- C: conta e marca por município.

**Recomendação técnica:** A. B repete o problema do bundle definitivo; C multiplica lojas e revisões.

**Quem decide:** Rafael e Alyson. A escolha da entidade controladora é também jurídica (CP-11).

**O que fica bloqueado:** DNS e CORS por ambiente (F01-E10), perfil EAS de HML (F01-E13), primeiro build externo (F14-E11, F17-E17), remetente de e-mail do OTP (F15-E14), lojas (F28-E07).

**Evidência necessária:** `docs/evidencias-v2/CP-04/decisao.md` com entidade, domínio, marca e bundle ids (sem credenciais).

---

🛑 **CHECKPOINT CP-05: Contratação do ambiente de homologação**

**Origem:** DP:R6 (parte "a"); DP:T30.

**Pergunta:** autoriza o segundo conjunto de serviços de homologação (app Fly, projeto Supabase, bucket, e-mail de teste e domínio de teste)?

**Por que decidir agora:** hoje não existe homologação e o piloto roda como produção com marca d'água. O levantamento proíbe dado de produção em ambiente de teste. O custo mensal é NÃO CONFIRMADO.

**Alternativas:**
- A: conjunto completo e separado.
- B: mínimo viável (projeto gratuito onde couber, e-mail de teste por log) com limites conhecidos.
- C: adiar (o portal e o cidadão não saem).

**Recomendação técnica:** A, na ordem: banco e storage de HML primeiro, depois e-mail de teste.

**Quem decide:** Rafael.

**O que fica bloqueado:** F01-E11 em diante (HML, deploy de HML, observabilidade em HML), F03-E10 (convite com e-mail real de teste), F06-E15.

**Evidência necessária:** custo mensal estimado e confirmado, sem credenciais.

---

⚖️ **CHECKPOINT CP-06: Ferramenta de erro e de log, residência do dado**

**Origem:** DP:K13; DP:J7. DECISÃO RAFAEL e DECISÃO JURÍDICA / DPO.

**Pergunta:** qual ferramenta de erro e de log entra, onde o dado fica (inclusive fora do país) e como isso entra na lista de subprocessadores?

**Por que decidir agora:** a observabilidade P0 (F01-E14) envia erro e contexto a um destino. `docs/SUBPROCESSADORES.md` exige aviso de 30 dias e conversa com o município antes de ligar um novo. A cópia de storage em outra conta (F22-E02) é outro subprocessador.

**Alternativas:** (A) ferramenta hospedada com SDK compatível com Sentry; (B) alternativa com residência no Brasil; (C) logs do próprio provedor de hospedagem até haver parecer.

**Recomendação técnica:** adaptador com destino configurável (A ou B sem reescrita) e começar por C em HML, com dados sintéticos, enquanto o parecer não vem.

**Quem decide:** Rafael (ferramenta) e jurídico/DPO (transferência internacional, base, prazo).

**O que o roadmap implementa sem decidir:** o adaptador de destino configurável, a retirada de dado pessoal do evento de erro, a retenção configurável do log.

**O que fica bloqueado:** ligar erro centralizado com dado de produção (F01-E14), retenção e destino finais (F21-E08), cópia off-site de storage (F22-E02).

**Quando vira bloqueador:** antes do primeiro usuário externo real.

**Evidência necessária:** decisão, atualização de `docs/SUBPROCESSADORES.md` e aviso aos municípios (quando aplicável).

---

🛑 **CHECKPOINT CP-07: Segunda pessoa com acesso e plantão**

**Origem:** DP:K15; REL:10 (fator de ônibus 1).

**Pergunta:** quem é a segunda pessoa com acesso a Fly, Supabase, GitHub, Apple, Google e ao cofre de segredos, e existe plantão (quem lê o alerta e quando)?

**Por que decidir agora:** hoje segredos vivem em `fly secrets` e no chaveiro de uma máquina macOS. Alerta que ninguém lê não detecta incidente.

**Alternativas:** (A) segunda pessoa técnica com acesso completo; (B) segunda pessoa só com acesso de recuperação (cofre selado); (C) sem segunda pessoa no piloto, com risco aceito por escrito.

**Recomendação técnica:** B no mínimo antes de qualquer SLA; A antes da produção municipal.

**Quem decide:** Rafael.

**O que fica bloqueado:** runbooks completos (F01-E16), plantão e canal de alerta (F21-E06), suporte do piloto (F27-E02), qualquer SLA (F28-E05).

**Evidência necessária:** `docs/evidencias-v2/CP-07/decisao.md` (nomes não são necessários; funções e canal sim).

---

🛑 **CHECKPOINT CP-08: MFA obrigatório para usuário de órgão**

**Origem:** DP:K4; DP:T03.

**Pergunta:** o atrito do segundo fator (TOTP) para usuário de secretaria é aceitável? Qual o plano para perda de dispositivo?

**Por que decidir agora:** o portal expõe dado de família a pessoas de fora da Defesa Civil. O TOTP não depende do provedor de e-mail, mas exige reset de segundo fator de terceiros, que hoje não existe.

**Alternativas:** (A) obrigatório para todo usuário de órgão, coordenador e administrador; (B) obrigatório só para gestor do órgão e administradores; (C) opcional.

**Recomendação técnica:** A, com reset feito pelo posto imediatamente acima, registrado em trilha.

**Quem decide:** Alyson (junto da secretaria piloto na F12).

**O que fica bloqueado:** a política final de F03-E11 e o portal em produção; a validação com a secretaria em F12-E06.

**Evidência necessária:** decisão e taxa de ativação medida no piloto.

---

⚖️ **CHECKPOINT CP-09: Conteúdo do dossiê mínimo e o que desce ao agente**

**Origem:** DP:K3; DP:J6. DECISÃO ALYSON e DECISÃO JURÍDICA / DPO / MUNICÍPIO.

**Pergunta:** o que cada órgão pode ver do dossiê (nome do solicitante, endereço, vulnerabilidade, fotos)? O mesmo dossiê serve a todos os tipos de demanda? O que desce ao aparelho do agente?

**Por que decidir agora:** o ofício atual imprime nome, relato e descrição de vulnerabilidade a quem abrir o link, em tensão com o texto da política de privacidade. O dossiê é o dado que a Defesa Civil compõe e que o portal mostra; o aparelho do agente guarda SQLite e fotos sem criptografia própria.

**Alternativas:** (A) mesmo dossiê para todos os órgãos; (B) dossiê por categoria de demanda; (C) mínimo fixo mais campos que a Defesa Civil marca caso a caso.

**Recomendação técnica:** C como padrão técnico (a composição é da Defesa Civil), com lista de campos mínimos fixa em código e teste.

**Quem decide:** Alyson (conteúdo operacional) e DPO/município (o que é lícito expor).

**O que o roadmap implementa sem decidir:** o dossiê como dado (snapshot), a lista de campos configurável, o registro de consulta nominal.

**O que fica bloqueado:** o primeiro encaminhamento real (F04-E04 em produção), a validação do conteúdo (F12-E04), o que desce ao agente (F19-E01 e E03).

**Quando vira bloqueador:** antes do primeiro encaminhamento com dado real.

**Evidência necessária:** decisão e a lista de campos aprovada.

---

⚖️ **CHECKPOINT CP-10: Retenção padrão, IP e user-agent, documento emitido**

**Origem:** DP:K6; DP:J4; BZ-D:IDN-29. DECISÃO DO MUNICÍPIO e DECISÃO JURÍDICA / DPO.

**Pergunta:** quais prazos de retenção valem por classe (relato não convertido, anexo de cidadão, anexo de secretaria, IP e user-agent, logs, documento emitido), e como o backup se relaciona com a eliminação?

**Por que decidir agora:** hoje o padrão de retenção é vazio e nada expira. O documento emitido congelado (F09) mantém dado pessoal depois do prazo, e a cópia de backup está fora do alcance da eliminação.

**Alternativas:** (A) prazos por município, definidos no onboarding; (B) prazos padrão do fornecedor sobrescritos por município; (C) manter vazio e decidir só na produção.

**Recomendação técnica:** A com mecanismo de classe de retenção por tabela (F05-E09) e derivado redigido para documento emitido (F09-E12).

**Quem decide:** município (prazo) e jurídico/DPO (base e backup).

**O que o roadmap implementa sem decidir:** classes de retenção, jobs configuráveis com padrão vazio, derivado redigido, expurgo de IP e user-agent (F05-E12).

**O que fica bloqueado:** ativar jobs de retenção com prazo real.

**Quando vira bloqueador:** antes da produção e antes de abrir o canal do cidadão.

**Evidência necessária:** prazos aprovados por município.

---

⚖️ **CHECKPOINT CP-11: Privacidade, base legal, política, termos, aceite, menores, direitos do titular e encarregado**

**Origem:** DP:J1, DP:J2, DP:J3, DP:J5, DP:J13. DECISÃO JURÍDICA / DPO. O roadmap NÃO decide.

**Pergunta:** qual a base legal por canal e finalidade; quem é o controlador dos dados da conta do cidadão num app único para vários municípios; qual o texto da política e dos termos; como tratar menores; como atender direitos do titular; quem é o encarregado e qual o canal?

**Por que decidir agora:** a política de privacidade está redigida e não publicada, com campos em aberto, e foi escrita para dado ditado por operador, não para coleta direta do titular. Não há encarregado nem canal. O levantamento diz que a base da Defesa Civil não é consentimento.

**Alternativas:** não cabem ao roadmap; o parecer jurídico escolhe.

**Recomendação técnica:** implementar o mecanismo genérico antes do texto, para que o parecer entre sem reescrever código.

**O que o roadmap implementa sem decidir:** tabela de aceite versionado com revogação, versionamento e publicação de política, fila de pedidos de titular com exportação por titular, campo de classificação etária declarada, retenção configurável, HML sintético com aviso de privacidade para testadores (F05-E06 a E08, F15-E15, F17-E14).

**O que fica atrás do parecer:** o texto, a base legal, os prazos, quem atende e quanto tempo.

**Quando vira bloqueador:** J1, J2, J3, J5 e J13 bloqueiam a ABERTURA PÚBLICA do canal do cidadão e o beta externo. Não bloqueiam tabelas, versionamento, aceites, código de retenção configurável nem HML sintético.

**O que fica bloqueado:** abertura pública do cidadão, beta externo, F28-E03.

**Evidência necessária:** parecer arquivado (referência, sem conteúdo sigiloso) e política publicada em URL estável.

---

🛑 **CHECKPOINT CP-12: PDF da secretaria antes do scanner completo**

**Origem:** DP:K11; DP:T24.

**Pergunta:** o portal pode aceitar PDF da secretaria antes de o scanner antivírus e a validação estrutural estarem prontos?

**Por que decidir agora:** secretaria costuma responder com documento; restringir a imagem pode travar o portal. PDF é a superfície de ataque mais perigosa dos tipos permitidos.

**Alternativas:** (A) só imagem na primeira versão do portal; (B) PDF somente depois do scanner (F06-E14); (C) PDF antes, com isolamento em worker e sem pré-visualização.

**Recomendação técnica:** B. Se o portal travar sem PDF, reabrir como C com isolamento (F07).

**Quem decide:** Rafael.

**O que fica bloqueado:** PDF no portal (F06-E14 e F11-E13 para esse tipo).

**Evidência necessária:** decisão e, quando B, resultado do scanner na suíte maliciosa (F06-E16).

---

🛑 **CHECKPOINT CP-13: Cotas e limites de anexo**

**Origem:** DP:K10; DP:T24.

**Pergunta:** quais os valores iniciais e quando revisar (5 fotos por relato, 10 MB, 25 megapixels para o cidadão; 15 MB para imagem de secretaria; 20 MB para PDF)?

**Por que decidir agora:** a cota por classe impede que abuso de cidadão trave a evidência de campo. Os valores iniciais são hipótese; a estimativa de armazenamento só com fotos é de cerca de 24 GB por município por ano.

**Alternativas:** (A) valores da T24; (B) mais restritivos no início; (C) mais folgados.

**Recomendação técnica:** A, ajustáveis por município, revisados com custo real após o piloto (F27-E06).

**Quem decide:** Rafael.

**O que fica bloqueado:** cotas em produção (F06-E09).

**Evidência necessária:** custo de armazenamento por relato medido no piloto.

---

🛑 **CHECKPOINT CP-14: Aprovação, nomenclatura jurídica e marca d'água**

**Origem:** DP:K16; DP:J8; PR:D-06; PR:A-04. DECISÃO MUNICÍPIO / ALYSON e DECISÃO JURÍDICA.

**Pergunta:** quem aprova laudo e termo (competência), há dupla aprovação, quem é o responsável técnico e qual o registro profissional; qual a nomenclatura e a validade jurídica do mecanismo (simples, avançada, ICP-Brasil, provedor externo); quando a marca "DOCUMENTO DE VALIDAÇÃO" deixa de ser impressa?

**Por que decidir agora:** o termo de interdição retira famílias de casa e vai para processo. Em produção, `fly.toml:69` mantém a marca d'água. Até o parecer, o mecanismo técnico se chama APROVAÇÃO AUTENTICADA, não assinatura eletrônica.

**Alternativas:** não cabem ao roadmap para a parte jurídica; para a parte técnica: (A) política por município e tipo (exige aprovação, dupla aprovação), (B) aprovação fixa por papel.

**Recomendação técnica:** A, com assinatura como interface plugável e só a aprovação autenticada implementada.

**O que o roadmap implementa sem decidir:** estados de aprovação, políticas por município e tipo, registro com usuário nominal, MFA, versão, hash, decisão e instante (F09-E06 a E08).

**O que fica atrás do parecer:** o nome "assinatura", o nível, o fundamento legal por tipo de documento, o fim da marca d'água.

**O que fica bloqueado:** retirar a marca d'água (F09-E14, F28-E06) e chamar o mecanismo de assinatura.

**Quando vira bloqueador:** antes da produção municipal.

**Evidência necessária:** parecer arquivado e a configuração aprovada.

---

🛑 **CHECKPOINT CP-15: PDF oficial acessível (tagged)**

**Origem:** DP:K21; DP:T29.

**Pergunta:** o PDF oficial será gerado marcado (tagged) e validado, ou a acessibilidade do documento fica fora da V2?

**Por que decidir agora:** o PDF atual não é marcado. A marcação depende de revisar a estrutura semântica do HTML que o gera.

**Alternativas:** (A) marcar e validar na V2; (B) deixar a versão HTML acessível como alternativa; (C) fora da V2.

**Recomendação técnica:** A depois que o documento imutável estiver pronto (F09), validando em F23-E06.

**Quem decide:** Rafael.

**O que fica bloqueado:** declarar o documento oficial acessível.

**Evidência necessária:** relatório de validação do PDF marcado.

---

🛑 **CHECKPOINT CP-16: QR de validação de autenticidade**

**Origem:** pedido do roadmap, F09 ("QR/validação se aprovado no escopo"); DP:T26.

**Pergunta:** o documento emitido terá QR e página pública de conferência de autenticidade?

**Por que decidir agora:** o identificador atual é um hash curto de dado não secreto. Um QR expõe uma rota pública e pede decisão de privacidade sobre o que ela revela.

**Alternativas:** (A) sim, com página que confirma apenas existência, versão e hash; (B) não na V2.

**Recomendação técnica:** B na primeira entrega e A se um município pedir, sem expor dado pessoal na rota pública.

**Quem decide:** Alyson.

**O que fica bloqueado:** F09-E13.

**Evidência necessária:** decisão registrada.

---

🛑 **CHECKPOINT CP-17: Encerramento com providência obrigatória em aberto**

**Origem:** DP:K5; ALY:RN-05; REL:05.

**Pergunta:** o encerramento de ocorrência com providência obrigatória em aberto deve avisar, exigir justificativa ou bloquear?

**Por que decidir agora:** hoje só avisa e registra `providenciasSemResposta` na trilha; a especificação pede "verificação das providências obrigatórias". Com o portal, a providência passa a ter dono externo.

**Alternativas:** (A) avisar e registrar (atual); (B) exigir justificativa de dispensa; (C) bloquear.

**Recomendação técnica:** B, para casar com ALY:FLU-02 (resposta ou justificativa de dispensa).

**Quem decide:** Alyson.

**O que fica bloqueado:** a regra de encerramento no portal e no painel (F10-E13).

**Evidência necessária:** decisão e teste da regra.

---

🛑 **CHECKPOINT CP-18: Foto de perfil no painel**

**Origem:** BZ-N:N.8.

**Pergunta:** manter a foto de perfil (o app de campo já a envia e a tela diz que "a coordenação passa a ver esta foto") e construir a interface no painel, ou retirar a promessa?

**Por que decidir agora:** a promessa na tela do agente é falsa hoje porque o painel não exibe a foto.

**Alternativas:** (A) construir no painel; (B) retirar a promessa e a coleta.

**Recomendação técnica:** A se a foto serve ao reconhecimento em campo; senão B. Em qualquer caso, corrigir o texto da tela já em F00 se a decisão demorar.

**Decisão de 2026-10-01 (D-26, PREMISSA a confirmar por Rafael):** construir a foto de perfil no painel (alternativa A). A recomendação anterior fica atendida; a correção do texto da tela em F00 só se aplica se a F10-E09 demorar a entrar. A alternativa B só volta se a premissa for revertida.

**Quem decide:** Rafael. Decidido por premissa em 2026-10-01.

**O que fica bloqueado:** nada além do próprio escopo da F10-E09 (enviar, remover e mostrar a foto). Nada crítico.

**Evidência necessária:** decisão registrada.

---

🛑 **CHECKPOINT CP-19: Contratação para uso externo**

**Origem:** DP:R6 (parte "b").

**Pergunta:** autoriza e-mail com domínio verificado, storage real com versionamento, plano do banco com recuperação em ponto no tempo, ferramenta de erro e demais provedores de produção?

**Por que decidir agora:** hoje e-mail e push estão desligados em produção (`EMAIL_ATIVO`, `RECUPERACAO_ATIVA=nao`), o armazenamento real nunca foi exercitado segundo o README e não há plano de banco com recuperação em ponto no tempo confirmado. Sem isso, convite, OTP e recuperação de senha não funcionam para pessoas reais.

**Alternativas:** (A) conjunto completo, em ordem de bloqueio (e-mail e storage primeiro); (B) só e-mail e storage agora; (C) adiar.

**Recomendação técnica:** A em ordem. Cada novo provedor passa por `docs/SUBPROCESSADORES.md` (CP-06).

**Quem decide:** Rafael.

**O que fica bloqueado:** recuperação de senha em produção (F00-E10), notificações do portal (F11-E17), sessões com secretaria real (F12-E02), OTP do cidadão (F15-E04), PITR (F22-E01), produção do piloto (F27-E01).

**Evidência necessária:** custos e confirmação dos provedores, sem credenciais.

---

🛑 **CHECKPOINT CP-20: Secretaria piloto, estados e atribuição do encaminhamento**

**Origem:** DP:K1; DP:K22; DP:R2.

**Pergunta:** qual secretaria e qual pessoa validam o fluxo? Os sete estados do encaminhamento bastam? A competência por destino explícito basta? O encaminhamento é atribuído a uma pessoa do órgão ou só ao órgão (o gestor atribui, e com qual evento)? Um encaminhamento já aceito pode ser devolvido, ou só o `enviado` (hoje F04-E03 e F04-E08 só devolvem em `enviado`)?

**Por que decidir agora:** o modelo do encaminhamento só pode ser congelado depois de rodar com dados reais de uma secretaria. Hoje `responsavel` é texto livre.

**Alternativas:** (A) manter sete estados, destino explícito e atribuição nominal após o aceite; (B) ajustar estados com base na sessão; (C) competência por tipo de demanda.

**Recomendação técnica:** A como ponto de partida e revisão com 3 casos reais da secretaria (F12-E02).

**Decisão de 2026-10-01 (D-23):** o encaminhamento só pode ser devolvido ANTES do aceite. Isso fecha a última pergunta do bloco: depois do aceite, quem descobre que o item não é do órgão usa o pedido de esclarecimento, e a F04-E03, a F04-E08 e a F04-E17 (regra explícita, mensagem e testes de borda) já se comportam assim. A recomendação A segue de pé e nada nela ficou SUPERADO.

**Continua em aberto (PARCIAL):** qual é a secretaria piloto e quem a representa; se os sete estados bastam; e a atribuição nominal após o aceite, a validar com 3 casos reais.

**Quem decide:** Alyson, com a secretaria piloto.

**O que fica bloqueado:** congelar o modelo (F12-E05 em diante). A devolução antes do aceite já está decidida e não bloqueia nada.

**Evidência necessária:** ata da sessão e a decisão sobre estados e atribuição.

---

🛑 **CHECKPOINT CP-21: Percentuais de lembrete e cadeia de escalonamento**

**Origem:** DP:K2; DP:T12.

**Pergunta:** quais percentuais de prazo disparam lembrete (valores iniciais: sem aceite aos 25 por cento, lembrete aos 75, vencido aos 100), por qual canal, e há cadeia acima do gestor do órgão?

**Por que decidir agora:** hoje providência vencida não gera aviso. Percentuais evitam inventar prazo absoluto, mas precisam de validação por quem recebe.

**Alternativas:** (A) valores iniciais da T12; (B) valores definidos pela secretaria; (C) cadeia política acima do gestor.

**Recomendação técnica:** A, com a cadeia acima do órgão fora da V2 (decisão do município).

**Decisão de 2026-10-01 (D-18):** o escalonamento acima do gestor do órgão e a competência por COBRADE ou território ENTRAM na V2 (F04-E15, F04-E16). A parte da recomendação "com a cadeia acima do órgão fora da V2" fica SUPERADA. Os percentuais iniciais de lembrete (alternativa A) continuam valendo; os níveis, os prazos da cadeia acima do gestor e o rigor da competência passam a ser o CP-53.

**Quem decide:** Alyson e o município.

**O que fica bloqueado:** valores finais dos lembretes (F12-E03).

**Evidência necessária:** quantidade de lembretes por encaminhamento tolerada, medida na sessão.

---

🛑 **CHECKPOINT CP-22: Ofício por link, manter ou desligar**

**Origem:** REL:05, decisão D13.

**Pergunta:** depois que o portal existir, o ofício por link de uso único (`/publico/oficio/:token`) continua, é desligado ou fica como alternativa para órgão sem conta?

**Por que decidir agora:** o link abre uma vez, é só leitura, expira em 72 horas e registra IP e user-agent sem identidade; não gera consulta nominal.

**Alternativas:** (A) manter para órgão sem conta; (B) desligar ao adotar o portal; (C) manter só como notificação que aponta para o portal.

**Recomendação técnica:** C, com A como transição controlada até a secretaria piloto adotar o portal.

**Quem decide:** Alyson.

**O que fica bloqueado:** desativar o link público (F10-E14, F12-E06).

**Evidência necessária:** decisão e plano de transição.

---

🛑 **CHECKPOINT CP-23: Reabertura de ocorrência x ocorrência vinculada**

**Origem:** DP:K17; DP:T14; ALY:FLU-04; PR:D-21 (decisão que resolve o checkpoint). Estado: DECIDIDO em 2026-10-01.

**Pergunta (reescrita pela decisão):** ALY:FLU-04 pede "encerrar e reabrir ocorrência com motivo". O texto original do roadmap fechava "ocorrência encerrada é terminal; fato novo vira ocorrência nova com vínculo (`vinculada_a`)" e pedia ao Alyson aceitar o desvio. A pergunta passou a ser: por quanto tempo a ocorrência encerrada pode ser reaberta com motivo, e o que acontece depois desse prazo?

**Por que decidir agora:** a regra "registro não se apaga, se encerra com motivo" continua valendo: reabrir não apaga o encerramento, acrescenta um evento novo à trilha append-only e deixa o encerramento anterior no histórico. O documento do Alyson pede a reabertura, e a F13 precisava saber se escreve a aresta `encerrada -> triagem` ou só a ocorrência vinculada.

**Alternativas:**
- A: encerrada é terminal e fato novo vira ocorrência vinculada (recomendação original, SUPERADA).
- B: permitir reabertura com motivo e evento explícito, sem prazo.
- C: ambos, com reabertura só até um prazo e, depois do prazo, ocorrência vinculada.

**Decisão de 2026-10-01 (D-21):** alternativa C. Reabrir a ocorrência encerrada é permitido com motivo por 30 dias, prazo configurável por município. Depois do prazo, só ocorrência vinculada, com tipo e motivo e vínculo imutável. A decisão atende ALY:FLU-04.

**Recomendação técnica anterior (A): SUPERADA.** O texto dizia "A. Reinspeção é nova rodada de vistoria na mesma ocorrência enquanto ela está aberta (F13-E01 e E02)". A parte sobre reinspeção continua correta; a parte "encerrada é terminal" deixa de valer. Recomendação vigente: C como decidido, com a aresta de reabertura exigindo motivo e permissão (F13-E06), o prazo lido da configuração do município, o documento emitido mantido intacto (F13-E11) e a ocorrência vinculada para fato novo fora do prazo (F13-E09), com a tela de reabertura e do prazo restante na F13-E10.

**Quem decide:** Rafael decidiu em 2026-10-01 (D-21). Alyson não precisa mais aceitar um desvio: a decisão atende o requisito dele. Resta a Alyson apenas confirmar o valor padrão de 30 dias e o limite máximo permitido à configuração do município.

**O que fica bloqueado:** nada deste checkpoint. As etapas F13-E06, F13-E09, F13-E10 e F13-E11 podem ser executadas; só o valor padrão e o teto do prazo seguem a confirmar.

**Evidência necessária:** `docs/evidencias-v2/CP-23/decisao.md` com a decisão e o prazo padrão; a divergência conhecida de ALY:FLU-04 registrada em `01-decisoes-e-principios.md` (conflito 9 da tabela de conflitos) fica SUPERADA por D-21.

---

🛑 **CHECKPOINT CP-24: Detalhes do app do agente**

**Origem:** DP:K14 (parte técnica).

**Pergunta:** o app terá criptografia local do SQLite e das fotos, sincronização em segundo plano e atualização remota (OTA)? A tarefa é por equipe ou por pessoa? O agente aceita ou devolve antes do prazo?

**Por que decidir agora:** o aparelho guarda SQLite e fotos em claro. Atualização de código sem loja precisa de política. Há decisão de produto na tarefa por equipe ou pessoa.

**Alternativas:** (A) criptografia local, segundo plano e OTA na V2; (B) criptografia local e OTA, sem segundo plano; (C) nenhum dos três, com risco aceito.

**Recomendação técnica:** B no mínimo: a criptografia local reduz o dano de aparelho perdido; o segundo plano pode esperar.

**Quem decide:** Rafael e Alyson, com agentes em entrevista.

**O que fica bloqueado:** F14-E01, F14-E04 e F14-E06.

**Evidência necessária:** decisão e ata das entrevistas com agentes.

---

🛑 **CHECKPOINT CP-25: Papel PostgreSQL da API pública**

**Origem:** PR:A-02 (ajuste ao Decision Pack T02).

**Pergunta:** a API pública do cidadão continua com o papel `dc360_app` ou recebe um papel PostgreSQL próprio de menor privilégio?

**Por que decidir agora:** o Decision Pack recomendou reutilizar `dc360_app` para não reabrir o portão de privilégios de `db/test/isolamento.test.ts`. Isso NÃO é definitivo. A API pública fica exposta à internet aberta e, com `dc360_app`, uma falha nela teria o alcance de todas as tabelas de negócio.

**Alternativas:**
- A: continuar com `dc360_app` (mais simples de manter; um papel para provisionar e testar).
- B: papel próprio de menor privilégio (menor alcance; mais grants e funções para manter; o portão de privilégios do `isolamento.test.ts` e o job `implantavel` do CI, que cria os papéis, precisam acomodar o terceiro papel; o provedor gerenciado precisa permitir criá-lo).

**Recomendação técnica:** decidir pela EVIDÊNCIA que a F15-E01 produz, não por elegância: (1) grants reais do `dc360_app` por tabela e função (a lista do que a API pública NÃO deveria alcançar); (2) funções `SECURITY DEFINER` executáveis; (3) RLS disponível; (4) superfície de ataque; (5) testes negativos (a API pública tentando ler `ocorrencias` com cada papel: negada por permissão, não só por RLS); (6) custo de manutenção. A inclinação técnica é B se o subconjunto de tabelas da API pública for pequeno (cidadãos, relatos, anexos, aceites), que é o caso esperado.

**Quem decide:** Rafael, com a tabela comparativa.

**O que fica bloqueado:** publicar a API do cidadão (F15-E08 em diante) e a definição das migrations de grants.

**Evidência necessária:** `docs/evidencias-v2/CP-25/` com a tabela comparativa, a saída dos testes negativos e a ADR 0015.

---

⚖️ **CHECKPOINT CP-26: Trote, abuso e conteúdo ilícito**

**Origem:** DP:J11. DECISÃO JURÍDICA.

**Pergunta:** quais termos, consequências e procedimentos de moderação valem para denúncia falsa, abuso e conteúdo ilícito num canal que cai numa fila humana de emergência?

**Por que decidir agora:** o relato entra na triagem humana; o bloqueio de conta tem consequência para a pessoa.

**Alternativas:** não cabem ao roadmap.

**O que o roadmap implementa sem decidir:** registro de moderação append-only, bloqueio manual com motivo estruturado e efeito imediato (vigência), remoção de anexo com motivo (F15-E11, F18-E09, F06-E13). A política é "sem decisão automatizada sobre pessoas": nenhum bloqueio por heurística.

**O que fica atrás do parecer:** os termos, a consequência e o prazo de guarda do registro.

**Quando vira bloqueador:** abertura pública do canal do cidadão.

**Evidência necessária:** parecer e termos.

---

🛑 **CHECKPOINT CP-27: Anti-abuso além da base**

**Origem:** DP:K9; PR:A-03.

**Pergunta:** a base (conta verificada por e-mail, limite em duas camadas, bloqueio manual, moderação humana) basta, ou entram anonimato, atestação de aplicativo ou CAPTCHA?

**Por que decidir agora:** a V2 não tem esses itens por decisão (D-03). Só se justificam com abuso observado: CAPTCHA em emergência é atrito e problema de acessibilidade.

**Alternativas:** (A) manter a base; (B) acrescentar atestação de aplicativo; (C) acrescentar CAPTCHA.

**Recomendação técnica:** A, medindo taxa de rejeição e de spam por semana no beta e no piloto.

**Quem decide:** Rafael.

**O que fica bloqueado:** nada na V2 (é evolução medida).

**Evidência necessária:** métricas do beta (G17) e do piloto (F27-E06).

---

🛑 **CHECKPOINT CP-28: Habilitação do canal por município e processo de triagem**

**Origem:** PR:D-03.

**Pergunta:** o município que liga o canal do cidadão tem processo, equipe e horário de triagem de relatos? O canal fica desligado por padrão e a prefeitura o liga quando tiver processo.

**Por que decidir agora:** um canal ligado sem triagem frustra quem usa o app em emergência. O canal não substitui 190, 192 e 193 e isso aparece no app.

**Alternativas:** (A) opt-in por município, desligado por padrão (decidido); (B) ligado após treinamento acompanhado pelo fornecedor.

**Recomendação técnica:** A, com checklist de prontidão (equipe, horário, quem responde) antes de o administrador do município habilitar.

**Quem decide:** o município (e Alyson para o checklist).

**O que fica bloqueado:** ligar o canal em qualquer município (F15-E13, F27-E01).

**Evidência necessária:** checklist assinado por município e registro de habilitação auditado.

---

⚖️ **CHECKPOINT CP-29: O que se preserva de município eliminado**

**Origem:** DP:J12; REL:04 (D3). DECISÃO JURÍDICA e DO MUNICÍPIO.

**Pergunta:** quando um município é eliminado, o que se preserva (trilha, laudos, interdições) e por quanto tempo? A suspensão imediata ao agendar a eliminação é aceitável?

**Por que decidir agora:** hoje a eliminação apaga a trilha do município e a suspensão ocorre na hora, sem aviso, impedindo até a exportação. O desenho em `SAIDA-DE-MUNICIPIO.md` diz o contrário em dois pontos.

**Alternativas:** não cabem ao roadmap.

**O que o roadmap implementa sem decidir:** classificação no manifesto (F05-E05), extrato mínimo sob custódia se decidido, aviso ao município antes de suspender (F20-E04).

**O que fica atrás do parecer:** o que preservar e por quanto tempo.

**Quando vira bloqueador:** antes da produção municipal.

**Evidência necessária:** parecer e regra aprovada.

---

⚖️ **CHECKPOINT CP-30: Suporte do fornecedor e acesso assistido**

**Origem:** DP:J10; DP:T38. DECISÃO JURÍDICA e 🛑 RAFAEL.

**Pergunta:** qual o papel do fornecedor no suporte? Pode haver acesso assistido a dado do município, depois do piloto?

**Por que decidir agora:** as ADRs 0006 e 0008 vedam credencial que veja dois municípios. A V2 não tem impersonation. O volume de chamados cresce com as novas superfícies.

**Alternativas:** (A) sem impersonation (decidido) com pacote de diagnóstico sem dado pessoal; (B) após o piloto, usuário temporário nominal, com MFA, prazo curto e somente leitura, concedido pelo administrador do município; (C) impersonation completa (descartada).

**Decisão de 2026-10-01 (D-10):** o suporte assistido do fornecedor ENTRA na V2, na forma da alternativa B: o administrador do município libera um acesso temporário, nominal, com MFA, de prazo curto (por exemplo 2 horas) e SOMENTE LEITURA, com trilha no município. A impersonation completa (alternativa C) continua descartada. O pacote de diagnóstico sem dado pessoal (F20-E08) continua existindo.

**Recomendação técnica anterior ("A na V2; B só depois do piloto, com parecer"): SUPERADA** quanto ao calendário. B deixa de ser pós-piloto: a liberação pelo administrador entra na F10-E16, a ADR 0018 na F20-E01, a leitura só com concessão vigente na F20-E11 e a prova de segurança na F25-E15. A frase "a V2 não o tem" do bloqueio abaixo também fica SUPERADA. Continua valendo que o recurso só pode ser ligado com dado real depois do parecer J10; o prazo padrão e o teto da concessão são o checkpoint CP-54.

**O que o roadmap implementa sem decidir:** a concessão nominal com MFA, o prazo curto configurável, a leitura somente, a trilha visível ao município (F20-E16 mostra à prefeitura os atos do fornecedor) e o encerramento automático da concessão.

**O que fica atrás do parecer J10:** se o acesso assistido é lícito para o dado que o município trata, sob que base e com que contrato com o fornecedor.

**Quem decide:** jurídico (parecer J10) e Rafael. Estado PARCIAL: a forma está decidida, falta o parecer.

**O que fica bloqueado:** ligar o acesso assistido com dado real de município (F20-E11 em produção). A construção e os testes com dado sintético não ficam bloqueados.

**Evidência necessária:** ADR 0018, o parecer J10 arquivado (referência, sem conteúdo sigiloso) e a decisão do prazo em CP-54.

---

🛑 **CHECKPOINT CP-31: RPO, RTO e disponibilidade a prometer**

**Origem:** DP:R7; ALY:RNF-01; ALY:RNF-06.

**Pergunta:** que perda de dados (RPO) e que tempo de restauração (RTO) o produto aceita prometer ao município?

**Por que decidir agora:** a especificação dá hipótese de 24 horas e 8 horas e 99,5 por cento de disponibilidade; o levantamento recomenda 15 minutos e 4 horas. Nada é medido hoje.

**Alternativas:** (A) piloto 24 h e 8 h, produção municipal 15 min e 4 h, com restore periódico provado; (B) 24 h e 8 h também na produção; (C) valores por município em contrato.

**Recomendação técnica:** A. B expõe o dia de temporal; C multiplica configuração e prova.

**Quem decide:** Rafael e Alyson. Os valores do roadmap são referência técnica, não promessa.

**O que fica bloqueado:** escolha do plano do banco e do storage (F22-E01, F22-E02), contrato e SLA (F28-E05).

**Evidência necessária:** decisão e relatório de restore (F22-E04) que a sustente.

---

⚖️ **CHECKPOINT CP-32: Acessibilidade, aplicabilidade legal e teste com pessoa com deficiência**

**Origem:** DP:J9. DECISÃO JURÍDICA e 🛑 ALYSON.

**Pergunta:** quais exigências de acessibilidade (LBI e eMAG) alcançam cada superfície? Há recrutamento de pessoas com deficiência para teste?

**Por que decidir agora:** o levantamento fala em WCAG como piso e eMAG como referência de governo. O alvo técnico do roadmap é WCAG 2.2 AA (o documento do Alyson cita 2.1 AA; a 2.2 mantém quase todos os critérios dela e acrescenta alvo de toque, foco e autenticação acessível). O teste com pessoas tem custo e envolve dado pessoal dos participantes.

**O que o roadmap implementa sem decidir:** o alvo técnico, os portões automáticos e a validação com leitor de tela em aparelho real (F23).

**O que fica atrás do parecer:** a aplicabilidade por superfície e a declaração de conformidade.

**Quem decide:** jurídico (aplicabilidade) e Alyson (teste com pessoas).

**O que fica bloqueado:** declarar conformidade (F23-E07, F28-E04).

**Evidência necessária:** relatório de conformidade e parecer.

---

🛑 **CHECKPOINT CP-33: Pentest externo, contratação e escopo**

**Origem:** DP:T34; pedido do roadmap, F25.

**Pergunta:** quem contrata, qual o escopo (API de servidor, API pública, portal, apps, console, arquivos) e quando?

**Por que decidir agora:** antes de abrir o App do Cidadão publicamente, o pentest externo é obrigatório. Tem custo e prazo de agendamento.

**Alternativas:** (A) pentest completo antes do beta externo; (B) pentest do que já existe (servidor, portal) agora e do cidadão antes da abertura pública; (C) só testes internos (não recomendado para canal aberto).

**Recomendação técnica:** B, com escopo e janela combinados com antecedência.

**Quem decide:** Rafael.

**O que fica bloqueado:** abrir o App do Cidadão publicamente (F25-E12, G25).

**Evidência necessária:** contrato (sem valores sigilosos), relatório do teste e re-teste (F25-E13).

---

🛑 **CHECKPOINT CP-34: Piloto municipal**

**Origem:** DP:R2; pedido do roadmap, F27.

**Pergunta:** qual prefeitura, qual secretaria, quais agentes e usuários, qual período, qual suporte, qual critério de parada e quais métricas?

**Por que decidir agora:** o piloto não pode virar produção comercial silenciosamente. Precisa de combinação escrita com o município.

**Alternativas:** (A) um município com Defesa Civil atuante, uma secretaria e poucos agentes; (B) mais de um município; (C) piloto só com a Defesa Civil.

**Recomendação técnica:** A.

**Quem decide:** Rafael, Alyson e o município.

**O que fica bloqueado:** F27-E01 em diante.

**Evidência necessária:** termo do piloto com período, escopo, suporte e critério de parada.

---

🛑 **CHECKPOINT CP-35: Revalidação dos itens fora da V2**

**Origem:** DP:K8 (SMS), DP:K12 (vídeo), DP:K19 (white-label), DP:K20 (idiomas e Libras), entre outros em `21-fora-da-v2.md`.

**Pergunta:** algum item fora da V2 passa a ser necessário com base em dado real do piloto?

**Por que decidir agora:** o registro evita que esses itens reapareçam escondidos numa etapa. Cada item tem um gatilho em `21-fora-da-v2.md`.

**Alternativas:** manter fora; promover um item a próxima versão com custo e justificativa.

**Recomendação técnica:** decidir com o dado do piloto (por exemplo, proporção de cidadãos sem e-mail para SMS).

**Decisão de 2026-10-01 (D-07, D-11, D-12, D-15 a D-20):** vários itens citados na origem deixaram de ser "fora da V2": SMS (DP:K8) entra pela D-07 (CP-92), vídeo (DP:K12) entra pela D-07 (CP-47), white-label (DP:K19) entra pela D-11 (CP-95) e idiomas e VLibras (DP:K20) entram pela D-12 (CP-45, CP-73). A parte deste bloco que os trata como fora da V2 fica SUPERADA para esses itens. O que continua fora até nova decisão de Rafael está em `21-fora-da-v2.md` e em `01-decisoes-e-principios.md` (seção 11), e este checkpoint passa a revalidar só esses itens.

**Quem decide:** Rafael e Alyson.

**O que fica bloqueado:** nada (backlog).

**Evidência necessária:** backlog atualizado.

---

🛑 **CHECKPOINT CP-36: Replanejamento de capacidade e custo da próxima onda**

**Origem:** DP:R1 (recorrente).

**Pergunta:** com o que foi medido na onda que terminou, a capacidade e o custo da próxima onda se mantêm?

**Por que decidir agora:** a V2 é longa para uma equipe pequena. Cada marco é ponto seguro para parar, ajustar ou ampliar. Ocorre em G08 (antes do portal), G12 (antes do cidadão) e G19 (antes da operação e segurança).

**Alternativas:** seguir; reduzir escopo da onda; ampliar capacidade.

**Recomendação técnica:** decidir com horas reais gastas por etapa nas ondas anteriores (tamanho previsto x realizado).

**Quem decide:** Rafael.

**O que fica bloqueado:** início da onda seguinte.

**Evidência necessária:** `docs/evidencias-v2/CP-36/` com o balanço da onda.

---

🛑 **CHECKPOINT CP-37: Resultado da medição de RPO e RTO**

**Origem:** DP:K7.

**Pergunta:** o RPO e o RTO medidos em restore real atendem ao que CP-31 aprovou?

**Por que decidir agora:** prometer um número que não foi medido é risco contratual.

**Alternativas:** aceitar; ajustar o plano; ajustar a promessa.

**Recomendação técnica:** ajustar o plano ou a promessa conforme a medição, nunca o relatório.

**Quem decide:** Rafael.

**O que fica bloqueado:** G22.

**Evidência necessária:** tempos e perda medidos em HML (F22-E07).

---

🛑 **CHECKPOINT CP-38: Orientação do aparelho e layout de tablet no app do cidadão**

**Origem:** DP:K18; DP:T29.

**Pergunta:** o app do cidadão trava a orientação ou libera a rotação? Há layout de tablet?

**Por que decidir agora:** acessibilidade motora (aparelho fixo em suporte) pede rotação livre. A tela de relato com mapa muda com a orientação.

**Alternativas:** (A) rotação livre; (B) retrato fixo; (C) retrato em telefone e livre em tablet.

**Recomendação técnica:** A, coerente com o alvo de acessibilidade (T29).

**Quem decide:** Alyson.

**O que fica bloqueado:** nada crítico (F17-E15).

**Evidência necessária:** decisão registrada.

---

🛑 **CHECKPOINT CP-39: Alternativa à assinatura por traço de dedo na vistoria**

**Origem:** BZ-D:A11-27; ALY:VIS-06; REL:11.

**Pergunta:** quem não consegue desenhar a assinatura na tela (limitação motora, luva, mão ferida) tem qual alternativa na vistoria?

**Por que decidir agora:** a assinatura de campo (`apps/campo/src/ui/Assinatura.tsx`) é só por traço de dedo. A F23 valida a acessibilidade e registra a lacuna em `achados.md`, mas a alternativa muda o que a vistoria registra e o que o laudo diz sobre o ato: é decisão de produto, não de interface.

**Alternativas:**
- A: manter o traço e registrar a impossibilidade com motivo estruturado (por exemplo "morador não pôde assinar") e a identificação do agente que presenciou.
- B: oferecer uma confirmação alternativa pelo agente (por exemplo código lido em voz alta e registrado), com o valor jurídico atrás de J8.
- C: manter só o traço e declarar a limitação.

**Recomendação técnica:** A, porque preserva a evidência e a trilha sem criar um mecanismo cujo valor jurídico ainda não foi definido (CP-14).

**Quem decide:** Alyson.

**O que fica bloqueado:** nada crítico. Se a decisão for A ou B, uma etapa nova entra na F14 no replanejamento (CP-36); até lá a F23-E08 só registra a lacuna.

**Evidência necessária:** decisão registrada em `docs/evidencias-v2/CP-39/decisao.md`.

---

🛑 **CHECKPOINT CP-40: Lacunas do MVP do documento do Alyson que a V2 não fecha**

**Origem:** ALY:GEO-01, ALY:OCO-02, ALY:OCO-04, ALY:OCO-05, ALY:VIS-04, ALY:VIS-08, ALY:DOC-02, ALY:FLU-01, ALY:REL-01, ALY:AUD-01, ALY:AUT-02, ALY:AUT-03, ALY:RNF-07, ALY:RNF-08, ALY:RNF-14, ALY:RN-04, ALY:CA-01; REL:09; achados da matriz de rastreabilidade (`17-rastreabilidade.md`).

**Pergunta:** o roadmap da V2 cobre as cinco superfícies, a identidade, os arquivos, os documentos e a operação, mas a matriz de rastreabilidade encontrou 16 lacunas parciais do MVP do documento do Alyson (várias de prioridade M, "indispensável ao MVP") que nenhuma etapa fecha. A V2 fecha alguma delas, todas, ou as aceita como dívida para depois?

**Por que decidir agora:** o documento do Alyson é a origem dos requisitos e dos critérios de aceite do MVP (ALY:CA-01 a CA-10); declarar a V2 candidata a produção com requisitos M abertos, sem decisão escrita, esconderia a lacuna. A lista, o que a V2 já cobre de cada uma e a proposta técnica estão em `21-fora-da-v2.md`, seção "Lacunas do MVP do Alyson que a V2 não fecha".

**Alternativas:**
- A: incluir todas como etapas novas (a maioria é S ou M; o conjunto seria uma fase de fechamento do MVP antes do piloto).
- B: aceitar todas como dívida pós-V2, com a decisão por escrito e o impacto nos critérios CA-01 a CA-10.
- C: triagem: incluir só as que o piloto exigir (a recomendação cita L1, L9, L10 e L2 como as mais visíveis para o município) e aceitar o resto como dívida.

**Recomendação técnica anterior (C, triagem): SUPERADA.** Ela propunha incluir só as lacunas que o piloto exigisse e aceitar o resto como dívida.

**Decisão de 2026-10-01 (D-20):** as lacunas L1 a L26 ENTRAM na V2, DISTRIBUÍDAS como etapas novas ao fim das fases donas de cada uma, em vez de uma fase única de fechamento. É a alternativa A, na forma distribuída. A L15 (papel do operador em ALY:CA-01) foi resolvida pela decisão de papel D-24 (só a coordenação classifica e despacha; o critério ALY:CA-01 é corrigido nesse sentido) e não custa etapa. Etapas já escritas nas fases donas: L1 em F10-E23, L2 em F10-E29, L3 em F10-E24, L9 em F10-E20, L10 em F10-E25, L11 em F10-E30, L12 em F10-E31 (e no banco em F03-E21), L14 em F10-E26, L18 em F10-E27, L22 em F10-E28, L20 em F20-E16, L24 em F20-E17, L19 em F05-E15, L5 em F02-E09, L26 em F14-E16, L4 em F32-E07, L16 em F33-E05, L6 em F06-E23 e F14-E22, L8 em F09-E17 e F10-E36. As demais seguem a tabela de `17-rastreabilidade.md` e de `STATUS.md`.

**Quem decide:** Alyson (dono do documento) e Rafael (capacidade, CP-01 e CP-36). Decidido por Rafael em 2026-10-01.

**O que fica bloqueado:** o fechamento do G10 (painel consolidado) e do G28 quanto aos critérios de aceite do MVP passa a exigir as etapas de lacuna concluídas, cada uma com a sua evidência; nenhuma etapa da V2 depende dele para começar.

**Evidência necessária:** `docs/evidencias-v2/CP-40/decisao.md` com a lista de lacunas, a etapa que fecha cada uma e a confirmação de Alyson de que o conjunto atende ALY:CA-01 a CA-10.

---

⚖️ **CHECKPOINT CP-41: Provedor de assinatura externa: escolha, tarifa e contrato**

**Origem:** PR:D-09 (estende D-06); F09 (E19 a E28), F10 (E32, E35), F25-E16, F28-E15; relacionado a CP-14 (nomenclatura jurídica, parecer J8).

**Pergunta:** qual provedor externo de assinatura avançada e de ICP-Brasil será contratado, com que tarifa, quem paga (fornecedor ou município) e qual contrato de tratamento de dados vale entre o fornecedor, o provedor e o município?

**Por que decidir agora:** a D-09 faz a assinatura avançada e a ICP-Brasil entrarem na V2 por provedor externo via API. O roadmap constrói a interface `ProvedorDeAssinatura` (F09-E20) com provedor em memória e sandbox em HML, mas o adaptador real, o envio de documento de município e a cota por município dependem de contrato, de credenciais e de uma decisão de custo. O provedor também recebe o documento emitido, que contém dado pessoal, e por isso é um novo subprocessador (CP-06).

**Alternativas:**
- A: um único provedor nacional, contratado pelo fornecedor, com o custo repassado ao município por documento assinado.
- B: um provedor por município, contratado pelo próprio município, com o adaptador recebendo a credencial do município.
- C: dois ou mais provedores atrás da interface, com a escolha por município e por tipo de documento.

**Recomendação técnica:** C como arquitetura (a interface já é plugável) e A para o primeiro provedor do piloto. Critérios técnicos de escolha: sandbox gratuito ou barato, API documentada com retorno do PDF assinado e da prova, consulta ou webhook autenticado, custo por documento previsível, residência dos dados informada, validação posterior da assinatura guardada. A nomenclatura continua APROVAÇÃO AUTENTICADA até o parecer J8; o nome "assinatura" só entra com o parecer (CP-14). Valores e planos de provedor são NÃO CONFIRMADOS.

**O que o roadmap implementa sem decidir:** a interface, o provedor em memória, o sandbox em HML, a fila com reenvio idempotente, a guarda do PDF assinado, a validação posterior, a cota e o custo por município (F09-E20 a E27).

**Quem decide:** Rafael e o município, com o jurídico (contrato e nomenclatura).

**O que fica bloqueado:** o adaptador real, o envio real de documento de município e a cota com valor real (F09-E22, F09-E27), o pedido e o acompanhamento em produção (F10-E32, F10-E35), o escopo do teste de segurança com provedor real (F25-E16) e o estado de integrações em produção (F28-E15). O ADR (F09-E19) e a interface (F09-E20) não ficam bloqueados.

**Evidência necessária:** `docs/evidencias-v2/CP-41/decisao.md` com decisão com o provedor, a tarifa, quem paga e a referência do contrato (sem valores sigilosos).

---

⚖️ **CHECKPOINT CP-42: Texto e fundamento legal da notificação ao responsável pelo imóvel**

**Origem:** PR:D-20 (lacuna L8, ALY:DOC-02); F09-E17, F10-E36, F33-E10.

**Pergunta:** qual é o texto do modelo de notificação ao responsável pelo imóvel e qual o fundamento legal que ele cita, para cada município?

**Por que decidir agora:** a notificação chega a um particular e pode gerar obrigação ou consequência. O roadmap constrói o modelo versionado e o texto por município (F33-E10), mas não pode inventar o fundamento nem a redação. Sem decisão, a notificação sairia com texto sem respaldo.

**Alternativas:** não cabem ao roadmap: texto e fundamento são do município e do jurídico dele.

**Recomendação técnica:** implementar o modelo versionado, com o texto como dado do município e um texto-padrão marcado "rascunho, sem validade jurídica", para que o texto aprovado entre sem reescrever código. Nenhuma norma é citada pelo sistema sem estar no texto aprovado pelo município.

**O que o roadmap implementa sem decidir:** o modelo versionado no snapshot do documento, o texto configurável por município, a emissão avulsa e o relatório fotográfico avulso (F09-E17, F10-E36, F33-E10).

**O que fica atrás do parecer:** o texto, o fundamento legal e a validade da notificação.

**Quem decide:** o município e o jurídico dele.

**O que fica bloqueado:** ligar a notificação em produção com texto real (F09-E17, F10-E36) e o texto por município (F33-E10). Os testes com texto sintético não ficam bloqueados.

**Evidência necessária:** `docs/evidencias-v2/CP-42/decisao.md` com texto aprovado por município (referência, sem conteúdo sigiloso) e a versão publicada.

---

🛑 **CHECKPOINT CP-43: Licenças de dependência permitidas e proibidas**

**Origem:** PR:D-19 (SBOM, licenças e scan de contêiner); F01-E19, F25-E01, F25-E21; relacionado a CP-03.

**Pergunta:** quais licenças de dependência são permitidas, quais são proibidas e quais exigem exceção nomeada?

**Por que decidir agora:** a V2 gera SBOM por release e confere licenças (F01-E19). Sem uma lista aprovada, a conferência só pode avisar e não reprova. Uma licença com obrigação de abrir o código pode contaminar um produto fechado vendido a prefeituras.

**Alternativas:**
- A: lista de licenças permissivas permitidas; qualquer outra exige exceção nomeada, com dono e prazo.
- B: lista de proibidas (por exemplo licenças de copyleft forte) e o resto só avisa.
- C: só avisar, sem reprovar.

**Recomendação técnica:** A, no mesmo espírito da política de `npm audit` (CP-03): dependência de tempo de execução com licença fora da lista reprova; ferramenta de desenvolvimento aparece sem reprovar; exceção só nomeada, com dono e prazo.

**Quem decide:** Rafael, com o jurídico (a lista é também uma decisão de licenciamento).

**O que fica bloqueado:** a reprovação automática por licença em F01-E19 (sem a lista a conferência só avisa) e a rotina anual de licenças (F25-E01, F25-E21).

**Evidência necessária:** `docs/evidencias-v2/CP-43/decisao.md` com a lista aprovada no `README.md` (seção de segurança) e a saída da conferência de licenças.

---

🛑 **CHECKPOINT CP-44: PostGIS no provedor gerenciado de HML e de produção**

**Origem:** PR:D-16 (reverte DP:T36); F01-E22, F16-E05, F32-E01, F32-E02, F32-E16.

**Pergunta:** o provedor gerenciado do banco deixa criar a extensão `postgis` (e em qual esquema e versão) em HML e em produção?

**Por que decidir agora:** a D-16 faz o PostGIS e a busca por raio, imóvel e área de risco entrarem. Os testes rápidos usam PGlite, que não tem PostGIS, então a prova espacial só vale em Postgres real. Se o provedor não permitir `CREATE EXTENSION postgis`, a F32 não fecha e a resolução do município por polígono (F16-E05) fica sem a base de que depende.

**Alternativas:**
- A: manter o provedor atual, se a conferência da F01-E22 confirmar a extensão.
- B: trocar de plano ou de provedor para um que permita a extensão.
- C: adiar o PostGIS e manter o cálculo no servidor (contradiz a D-16 e só vale com nova decisão de Rafael).

**Recomendação técnica:** verificar em HML antes de qualquer outra coisa (F01-E22) e escrever a migration de forma condicional (F32-E02), de modo que o ambiente sem a extensão falhe de forma explícita e nunca silenciosa. A se a conferência passar; B se não passar. Custo e plano são NÃO CONFIRMADOS.

**Quem decide:** Rafael.

**O que fica bloqueado:** a prova espacial em Postgres real e a F32 inteira (F32-E02, F32-E16), a resolução do município por polígono do IBGE (F16-E05) e a conferência de HML (F01-E22).

**Evidência necessária:** `docs/evidencias-v2/CP-44/decisao.md` com saída do `CREATE EXTENSION` em HML e em produção, versão da extensão e custo do plano, sem credenciais.

---

🛑 **CHECKPOINT CP-45: VLibras: integração no app e script do governo nas telas web**

**Origem:** PR:D-12 (estende DP:K20); F08-E12, F08-E13, F11-E30, F17-E15, F23-E10, F35-E12.

**Pergunta:** como o app integra o VLibras (o recurso oficial é um script web, não um componente nativo) e o script do governo pode carregar nas telas web, com que política de segurança e privacidade?

**Por que decidir agora:** a D-12 inclui o VLibras nas telas web e nos apps. Carregar um script de terceiros numa tela com dado pessoal é risco de privacidade e de segurança; a integração no aplicativo nativo exige um contêiner web, cujo comportamento ainda não foi confirmado. Sem a decisão, só se constrói o ponto de integração.

**Alternativas:**
- A: script oficial nas telas web sem dado pessoal e dentro de um contêiner web no app, carregado só por clique do usuário.
- B: só em páginas públicas e na tela de ajuda, nunca nas telas com dado pessoal.
- C: hospedar uma cópia própria do script (a permissão de redistribuição é NÃO CONFIRMADA).

**Recomendação técnica:** A com um único ponto de integração (F08-E12), carregamento somente por clique, fora das telas com dado pessoal (F23-E10) e com a política de conteúdo restrita à origem do script. C só se a licença permitir por escrito.

**Quem decide:** Rafael.

**O que fica bloqueado:** a ativação em produção nas telas web e no app (F11-E30, F17-E15, F35-E12) e a prova de acessibilidade do botão (F23-E10). O ponto de integração (F08-E12) não fica bloqueado.

**Evidência necessária:** `docs/evidencias-v2/CP-45/decisao.md` com a forma de integração escolhida, os domínios liberados na política de conteúdo e a captura que mostra o recurso fora das telas com dado pessoal.

---

⚖️ **CHECKPOINT CP-46: CPF obrigatório no relato identificado: base legal e finalidade**

**Origem:** PR:D-07 (reverte DP:T19, "CPF não coletar"); F05-E13, F05-E14, F15-E02, F15-E15, F15-E16, F16-E16, F17-E20, F18-E13; relacionado a CP-11.

**Pergunta:** qual a base legal e a finalidade do CPF obrigatório no relato identificado, por quanto tempo ele é retido e quem pode vê-lo?

**Por que decidir agora:** a D-07 torna o CPF obrigatório no relato identificado e proíbe o relato anônimo. O CPF é dado de alto valor e a coleta precisa de finalidade escrita antes de abrir o canal ao público. O levantamento original recomendava não coletar CPF; a decisão o reverte.

**Alternativas:** não cabem ao roadmap; o parecer jurídico e o DPO escolhem a base, a finalidade, a retenção e o acesso.

**Recomendação técnica:** implementar o mecanismo genérico antes do texto: validação, cifra, hash para unicidade, máscara, revelação somente com finalidade registrada, acesso auditado, retenção própria configurável (padrão vazio), saída por titular e `cpf_pendente` quando o CPF ainda não foi informado. O parecer entra sem reescrever código.

**O que o roadmap implementa sem decidir:** a cifra, a máscara, a unicidade, a revelação com finalidade e trilha, a retenção configurável, a saída por titular e o aceite versionado com a finalidade do CPF (F05-E13, F05-E14, F15-E15, F15-E16, F16-E16, F17-E20, F18-E13).

**O que fica atrás do parecer:** a base legal, o texto da finalidade, o prazo de retenção e quem tem direito de revelar o CPF.

**Quem decide:** jurídico e DPO, com Rafael.

**O que fica bloqueado:** a coleta de CPF real e a ABERTURA PÚBLICA do canal do cidadão (F15-E15, F16-E16, F17-E20). Não bloqueia as tabelas, a cifra nem os testes com CPF sintético.

**Evidência necessária:** `docs/evidencias-v2/CP-46/decisao.md` com parecer arquivado (referência, sem conteúdo sigiloso) e a finalidade publicada no aceite.

---

🛑 **CHECKPOINT CP-47: Custo de armazenamento e de máquina do vídeo do relato**

**Origem:** PR:D-07 (vídeo de até 30 s e 50 MB, 1 por relato); F07-E11, F22-E02, F24-E10, F34-E04; relacionado a CP-13 (cotas).

**Pergunta:** qual o custo de armazenamento e de máquina de transcodificação do vídeo do relato, e qual o teto por município que se aceita pagar?

**Por que decidir agora:** vídeo é o tipo de arquivo mais caro e mais perigoso do canal. A estimativa de armazenamento só com fotos já é de cerca de 24 GB por município por ano (CP-13); o vídeo multiplica isso e exige um worker de transcodificação isolado. Valores de provedor são NÃO CONFIRMADOS.

**Alternativas:**
- A: `video_cidadao` desligado por padrão, ligado por município com cota mensal.
- B: ligado para todos os municípios, com a cota global do fornecedor.
- C: manter desligado em produção até o custo ser medido no piloto.

**Recomendação técnica:** A, com C como estado inicial: o tipo de arquivo existe e é testado em HML com vídeo sintético, mas só liga em produção depois de medir o custo real por relato (F07-E11, F24-E10).

**Quem decide:** Rafael.

**O que fica bloqueado:** `video_cidadao` em produção (F34-E04), a capacidade do worker (F07-E11), a cópia de storage com vídeo (F22-E02) e o teste de carga de transcodificação (F24-E10).

**Evidência necessária:** `docs/evidencias-v2/CP-47/decisao.md` com custo medido por relato em HML e o teto por município decidido.

---

⚖️ **CHECKPOINT CP-48: Destino da foto de vistoria sinalizada pelo antivírus**

**Origem:** PR:D-20 (lacuna L6, ALY:VIS-04 e ALY:RNF-08); F06-E23, F14-E22.

**Pergunta:** o que acontece com uma foto de vistoria que o antivírus sinaliza, sabendo que ela é prova e não pode ser alterada nem recodificada?

**Por que decidir agora:** a foto de vistoria é evidência do ato do agente. Apagar, recodificar ou recusar a foto quebra a cadeia de custódia; aceitá-la sem verificação põe um arquivo possivelmente malicioso na tela da coordenação. A F06-E23 escaneia sem recodificar, mas o destino do arquivo sinalizado é uma decisão operacional e jurídica.

**Alternativas:**
- A: quarentena do original imutável (com hash e motivo), sem exibição nem recodificação, vistoria marcada como "foto retida para análise".
- B: recusar o envio no aparelho e pedir nova foto (perde a prova original).
- C: aceitar a foto com a marca "não verificada" e exibir normalmente.

**Recomendação técnica:** A: nunca apagar nem alterar, isolar em quarentena com registro append-only e permitir que o agente anexe outra foto sem perder a retida. A cadeia de custódia e o prazo de guarda do arquivo retido são decisão jurídica.

**Quem decide:** Alyson e o jurídico.

**O que fica bloqueado:** ligar a varredura antivírus da foto de vistoria em produção (F06-E23) e a prova do envio retomável e da varredura no aparelho (F14-E22).

**Evidência necessária:** `docs/evidencias-v2/CP-48/decisao.md` com decisão registrada e o teste com arquivo de teste padrão de antivírus mostrando a quarentena.

---

⚖️ **CHECKPOINT CP-49: Pessoa global: parecer do encarregado sobre identidade global**

**Origem:** PR:D-08 (revoga D-02 e A-01); F03-E01, F03-E15, F20-E18, F25-E14. UNIFICA os nomes provisórios NOVO-PESSOA-GLOBAL e NOVO-pessoa-global.

**Pergunta:** o encarregado aprova uma identidade global de servidores e de órgãos externos (uma conta da pessoa, com vínculo em cada município e órgão)? Quais dados ficam na pessoa e quais no vínculo? Quem é o controlador de cada um?

**Por que decidir agora:** a D-08 revoga a regra anterior de que nenhuma credencial vê dois municípios. O token continua valendo para UM município por vez e a pessoa escolhe o município ao entrar, mas passa a existir um dado de pessoa fora do isolamento por município (exceção nomeada ao isolamento, F03-E15). Isso tem implicação de privacidade que não é decisão técnica.

**Alternativas:** não cabem ao roadmap; o parecer do encarregado escolhe.

**Recomendação técnica:** implementar o mínimo na pessoa (e-mail, nome, segredo do segundo fator) e todo o resto no vínculo do município, de modo que o parecer possa restringir ainda mais sem reescrever. Nunca expor a um município o vínculo da pessoa em outro.

**O que o roadmap implementa sem decidir:** a ADR 0009, as tabelas de pessoa, conta e vínculo, o backfill sem perda, a exceção nomeada e testada ao isolamento, e a provisão do primeiro administrador com pessoa e vínculo (F03-E01, F03-E15, F20-E18).

**O que fica atrás do parecer:** a base legal da identidade global, a retenção da pessoa sem vínculo e quem atende o pedido do titular que tem vários vínculos.

**Quem decide:** Rafael e o DPO.

**O que fica bloqueado:** a mesma pessoa em mais de um município em produção (F03-E15 em produção, F20-E18). A construção e os testes com dado sintético não ficam bloqueados.

**Evidência necessária:** `docs/evidencias-v2/CP-49/decisao.md` com parecer arquivado (referência, sem conteúdo sigiloso) e a ADR 0009.

---

🛑 **CHECKPOINT CP-50: Segundo fator e redefinição de acesso da pessoa com vários municípios**

**Origem:** PR:D-08; F03-E11, F11-E05, F11-E23, F12-E08, F20-E02; relacionado a CP-08. UNIFICA os nomes provisórios NOVO-RESET-PESSOA-MULTIMUNICIPIO, NOVO-reset-de-pessoa-multimunicipio e NOVO-MFA-PESSOA-GLOBAL: são a mesma decisão de segurança, com duas perguntas.

**Pergunta:** (1) quem redefine o segundo fator e a senha de uma pessoa vinculada a vários municípios? (2) a troca de município no seletor pede um novo código de segundo fator?

**Por que decidir agora:** o CP-08 previa o reset feito pelo posto imediatamente acima, no município. Com a pessoa global, o superior de um município não pode ter poder sobre o acesso da mesma pessoa em outro município. O seletor de município (F11-E23) também precisa decidir se o segundo fator vale pela sessão ou por município.

**Alternativas:**
- A: o superior do município só suspende e reabilita o vínculo no município dele (derruba sessões ali); a redefinição do segundo fator da pessoa é feita pela própria pessoa com código de recuperação ou pelo fornecedor no console, com verificação e trilha.
- B: o superior de qualquer um dos municípios redefine o fator global (um município passa a poder tomar a conta global da pessoa).
- C: redefinição só pelo console do fornecedor, em qualquer caso.

**Recomendação técnica:** A. A troca de município dentro de uma sessão com segundo fator recente não pede novo código; um novo código é pedido quando a verificação passa de uma idade máxima a decidir (valor a definir por Rafael). A alternativa B quebra a ideia de que o município só controla o que é dele. A recomendação do CP-08 ("reset feito pelo posto imediatamente acima") fica SUPERADA para a pessoa com mais de um município; para a pessoa com um só município ela continua valendo.

**Quem decide:** Rafael e Alyson, com a visão de segurança.

**O que fica bloqueado:** a redefinição em produção de pessoa com vários municípios (F03-E11, F20-E02), a troca de município com a regra final do segundo fator (F11-E23) e o cenário do órgão externo multimunicípio (F12-E08).

**Evidência necessária:** `docs/evidencias-v2/CP-50/decisao.md` com decisão registrada e o teste de que o superior de um município não alcança o vínculo de outro.

---

⚖️ **CHECKPOINT CP-51: Termo, base legal e piloto do órgão externo**

**Origem:** PR:D-08; F03-E17, F11-E24, F12-E07, F12-E08, F26-E11, F27-E09, F28-E02, F28-E16; relacionado a CP-09. UNIFICA os nomes provisórios NOVO-TERMO-ORGAO-EXTERNO, NOVO-termo-de-orgao-externo, NOVO-TERMO-DE-ORGAO-EXTERNO e NOVO-ORGAO-EXTERNO: é a mesma decisão (termo e instrumento de tratamento para o órgão externo), com uma parte jurídica e uma parte de escolha do piloto.

**Pergunta:** qual termo e qual base legal permitem a um órgão externo (concessionária, órgão estadual, bombeiros) ver o dossiê, qual instrumento de tratamento de dados vale entre o fornecedor, o município e o órgão, e qual órgão externo é o piloto?

**Por que decidir agora:** a D-08 faz o órgão externo entrar no portal com pessoa global e vínculos. O órgão externo não é do município e vê dado pessoal do dossiê. A escolha do piloto é de Rafael e Alyson; o termo e a base são do jurídico.

**Alternativas:** a parte jurídica não cabe ao roadmap. Para o piloto: (A) uma concessionária de serviço público, (B) um órgão estadual, (C) o corpo de bombeiros.

**Recomendação técnica:** implementar o catálogo de órgão externo por município, a conta de órgão externo, o dossiê mínimo do CP-09, o registro de consulta nominal e o aceite versionado do termo no primeiro acesso, com o texto a vir. Para o piloto, escolher o órgão com maior volume de encaminhamentos reais na secretaria piloto (CP-20).

**O que o roadmap implementa sem decidir:** o catálogo, a conta, o dossiê mínimo, o registro de consulta e o aceite versionado (F03-E17, F11-E24).

**O que fica atrás do parecer:** o texto do termo, a base legal, o instrumento de tratamento de dados e a retenção do que o órgão externo viu.

**Quem decide:** o jurídico (termo e base) e Rafael e Alyson (órgão do piloto).

**O que fica bloqueado:** convidar um órgão externo real e criar conta real de órgão externo (F03-E17, F11-E24 em produção) e o cenário com órgão real (F12-E08).

**Evidência necessária:** `docs/evidencias-v2/CP-51/decisao.md` com parecer e termo arquivados (referência), e o órgão do piloto registrado em `docs/evidencias-v2/CP-51/decisao.md`.

---

⚖️ **CHECKPOINT CP-52: Níveis de sigilo da ocorrência e quem vê cada um**

**Origem:** PR:D-20 (lacuna L12, ALY:AUT-03); F03-E21, F10-E31. UNIFICA os nomes provisórios NOVO-NIVEL-DE-SIGILO, NOVO-NIVEIS-DE-SIGILO e NOVO-nivel-de-sigilo.

**Pergunta:** quais níveis de sigilo uma ocorrência pode ter e quem vê cada nível (coordenação, operador, agente, órgão, órgão externo)?

**Por que decidir agora:** o nível de sigilo restringe quem vê a ocorrência e é aplicado no banco, não só na tela. Definir os níveis é decisão operacional (Alyson) e de proteção de dado (jurídico e DPO). Um nível mal definido ou esconde dado de quem precisa para agir, ou expõe dado a quem não deve.

**Alternativas:**
- A: dois níveis (normal e restrito à coordenação).
- B: três níveis (normal, restrito ao órgão e à coordenação, reservado a pessoas nomeadas).
- C: níveis configuráveis por município.

**Recomendação técnica:** o mecanismo aceita uma lista configurável de níveis e aplica a regra no banco (F03-E21); a recomendação técnica é começar com o menor número de níveis que atende (A) e ampliar por configuração. A definição de quem vê cada nível, em dado pessoal ou sensível, passa pelo DPO.

**O que o roadmap implementa sem decidir:** a coluna de nível, a política no banco, a tela do painel (F03-E21, F10-E31) e o padrão "normal".

**O que fica atrás do parecer:** a lista final de níveis e a regra de visibilidade por nível.

**Quem decide:** Alyson, com o jurídico e o DPO.

**O que fica bloqueado:** o uso em produção do nível de sigilo (F03-E21 e F10-E31). A construção e os testes de isolamento por nível não ficam bloqueados.

**Evidência necessária:** `docs/evidencias-v2/CP-52/decisao.md` com a lista de níveis aprovada e a matriz de visibilidade em `docs/roadmap-v2/20-matrizes.md`.

---

🛑 **CHECKPOINT CP-53: Escalonamento por município e rigor da competência do órgão**

**Origem:** PR:D-18 (emenda DP:T10 e T12); F04-E15, F04-E16, F04-E17; relacionado a CP-21. UNIFICA os nomes provisórios NOVO-ESCALONAMENTO-E-COMPETENCIA e NOVO-escalonamento-e-competencia.

**Pergunta:** quantos níveis de escalonamento existem acima do gestor do órgão, com que prazos, e o quão rígida é a competência do órgão por COBRADE ou território (apenas sugere, ou impede o encaminhamento a órgão não competente)?

**Por que decidir agora:** a D-18 retira o escalonamento acima do gestor e a competência por COBRADE ou território do rol de itens fora da V2. Os níveis, os prazos e o rigor da competência dependem da estrutura política e administrativa de cada município e não são decisão técnica.

**Alternativas:**
- A: a competência só sugere e valida com aviso; quem decide é a Defesa Civil, com justificativa registrada.
- B: a competência impede o encaminhamento a órgão não competente.
- C: escalonamento com níveis e prazos configuráveis por município.

**Recomendação técnica:** A para a competência (a F04-E15 já descreve "a Defesa Civil escolhe, a competência sugere e valida") e C para o escalonamento, com a cadeia como dado do município e eventos append-only. Valores de prazo são hipótese, a validar com a secretaria piloto (CP-20).

**Quem decide:** Alyson e o município.

**O que fica bloqueado:** ligar o escalonamento e a competência em produção (F04-E15, F04-E16) e os valores finais dos lembretes além do gestor (ligados ao CP-21).

**Evidência necessária:** `docs/evidencias-v2/CP-53/decisao.md` com a cadeia e os prazos aprovados por município e a decisão sobre o rigor da competência.

---

🛑 **CHECKPOINT CP-54: Prazo padrão e teto do acesso assistido do fornecedor**

**Origem:** PR:D-10; F10-E16, F20-E01, F20-E11; relacionado a CP-30 (parecer J10).

**Pergunta:** qual o prazo padrão e o teto máximo de uma concessão de acesso assistido, e ela pode ser renovada?

**Por que decidir agora:** a D-10 faz entrar o suporte assistido temporário, nominal, com MFA e somente leitura, e dá como exemplo 2 horas. O prazo real é um equilíbrio entre resolver o chamado e limitar a exposição do dado do município.

**Alternativas:**
- A: padrão de 2 horas, teto de 8 horas, sem renovação automática (nova liberação exige novo ato do administrador).
- B: padrão de 1 hora e teto de 4 horas.
- C: padrão de 24 horas, com renovação.

**Recomendação técnica:** A como valor de partida (curto, sem renovação automática), configurável pelo município dentro do teto. Os números são referência técnica, não promessa. O prazo só liga com dado real depois do parecer J10 (CP-30).

**Quem decide:** Rafael e Alyson.

**O que fica bloqueado:** o valor padrão e o teto da concessão (F10-E16, F20-E01) e a ligação da concessão com dado real (F20-E11), junto do parecer J10 do CP-30.

**Evidência necessária:** `docs/evidencias-v2/CP-54/decisao.md` com decisão registrada com o padrão, o teto e a regra de renovação.

---

🛑 **CHECKPOINT CP-55: Lista final de motivos de encerramento da ocorrência**

**Origem:** PR:D-20 (lacuna L18, GAP-P1O-07); F10-E27; relacionado a CP-17.

**Pergunta:** qual é a lista final de motivos de encerramento da ocorrência?

**Por que decidir agora:** hoje o motivo mínimo do encerramento é 1 caractere. A F10-E27 traz uma lista proposta e um mínimo de texto; a lista final precisa ser validada por quem encerra ocorrências, porque os motivos viram dado de relatório.

**Alternativas:**
- A: a lista proposta pela etapa, com o motivo "outro" e texto obrigatório.
- B: lista por município, editável por configuração (F33).
- C: texto livre, sem lista.

**Recomendação técnica:** A para começar, com a edição por configuração do município depois (F33). C não permite relatório.

**Quem decide:** Alyson.

**O que fica bloqueado:** a lista final (F10-E27); a etapa pode ser executada com a lista proposta marcada como provisória.

**Evidência necessária:** `docs/evidencias-v2/CP-55/decisao.md` com a lista aprovada registrada em `docs/evidencias-v2/CP-55/decisao.md`.

---

🛑 **CHECKPOINT CP-56: Definição de taxa de atendimento e tempo de resposta por órgão**

**Origem:** PR:D-19 (indicadores por órgão); F10-E21, F10-E36.

**Pergunta:** como se definem a taxa de atendimento e o tempo de resposta por órgão: o que conta como atendido, quando o relógio começa e para, e o que acontece com a pausa por reinspeção?

**Por que decidir agora:** o indicador por órgão no painel é lido por quem decide sobre os órgãos. Uma definição ruim cria um ranking injusto; a V2 exibe sem ranking, mas a definição precisa ser aprovada. A F10-E21 traz uma definição proposta.

**Alternativas:**
- A: a definição proposta pela etapa.
- B: definição própria de cada município.
- C: só contagens, sem taxa nem tempo.

**Recomendação técnica:** A, com o relógio parado durante pedido de esclarecimento e reinspeção, sem ranking. Os valores de referência são do município.

**Quem decide:** Alyson.

**O que fica bloqueado:** exibir os indicadores como oficiais (F10-E21). Com a definição proposta, a tela pode ser construída marcada como provisória.

**Evidência necessária:** `docs/evidencias-v2/CP-56/decisao.md` com a definição aprovada e um exemplo calculado à mão.

---

🛑 **CHECKPOINT CP-57: Agente que perde o aparelho e os códigos: desligar o segundo fator dele**

**Origem:** PR:D-27 (PREMISSA: segundo fator do agente opcional, com tela de código no app); F14-E16 (e o gate da F14); relacionado a CP-08.

**Pergunta:** o agente que perde o aparelho e os códigos de recuperação pode ter o segundo fator desligado pelo administrador do município?

**Por que decidir agora:** a D-27 mantém o segundo fator do agente de campo como opcional e cria a tela de código no app. Ativá-lo pode trancar o agente fora justamente em emergência, quando ele não tem como recuperar a conta. É preciso decidir quem pode desfazer o fator e com que trilha.

**Alternativas:**
- A: o administrador do município desliga o fator do agente, com trilha, e o agente precisa enrolar de novo no próximo acesso.
- B: só o fornecedor desliga, pelo console, com verificação fora da banda.
- C: o fator do agente nunca bloqueia: o acesso com senha continua possível, sem o fator, e a ativação do fator é só por escolha do agente.

**Recomendação técnica:** A, com o MFA do próprio administrador no ato e o evento na trilha do município, porque o risco operacional de trancar o agente fora supera o risco de um desligamento auditado. Valores e regras de recuperação são decisão de Rafael.

**Quem decide:** Rafael.

**O que fica bloqueado:** ativar o segundo fator para agente em produção (F14-E16). A tela de código e os testes não ficam bloqueados.

**Evidência necessária:** `docs/evidencias-v2/CP-57/decisao.md` com decisão registrada e o teste de recuperação do agente sem o aparelho.

---

🛑 **CHECKPOINT CP-58: Fonte, licença e custo dos tiles do mapa offline**

**Origem:** PR:D-20 (lacuna L23, GAP-P1P-43); F14-E21, F14-E22.

**Pergunta:** de onde vêm os tiles do mapa offline do app do agente, com que licença e a que custo?

**Por que decidir agora:** o app do agente precisa de um mapa de fundo sem sinal. Baixar tiles em massa de um servidor público costuma ser vedado pelas regras de uso do servidor (a confirmar por provedor); cada fonte tem licença e atribuição próprias, e o pacote da área de atuação ocupa espaço no aparelho.

**Alternativas:**
- A: provedor de tiles com licença que permite pacote offline, pago por volume.
- B: tiles próprios gerados de dado aberto e hospedados pelo fornecedor (custo de processamento e de armazenamento).
- C: sem mapa de fundo offline: só os pontos e a lista de ocorrências, com mapa online quando houver sinal.

**Recomendação técnica:** B ou A conforme o custo medido e a licença confirmada por escrito; C como degradação garantida em qualquer caso. Licença e custo são NÃO CONFIRMADOS.

**Quem decide:** Rafael.

**O que fica bloqueado:** o mapa offline com tiles reais (F14-E21). Os pontos sem sinal e a lista continuam funcionando.

**Evidência necessária:** `docs/evidencias-v2/CP-58/decisao.md` com a fonte, a licença, o tamanho do pacote por município e o custo, sem credenciais.

---

🛑 **CHECKPOINT CP-59: Tokens de municípios diferentes na mesma sessão do portal**

**Origem:** PR:D-08; F11-E29, F11-E30.

**Pergunta:** a F03 aceita que o portal guarde tokens de municípios diferentes na mesma sessão, para consolidar caixa e sino de todos os municípios no cliente?

**Por que decidir agora:** a D-08 mantém o token válido para UM município por vez. Consolidar a caixa e o sino "Todos" exige o portal falar com mais de um município. Se a API passar a aceitar dois tokens na mesma requisição, a regra número um do isolamento é afetada. Sem a decisão, o modo "Todos" da F11-E29 cai para contador por município.

**Alternativas:**
- A: o cliente guarda um token por município e consolida só no cliente; cada chamada à API usa um único token e a API nunca recebe dois.
- B: não aceitar: o modo "Todos" mostra só um contador por município, obtido com troca explícita de município.
- C: um endpoint de consolidação no servidor com dois tokens (rejeitada: quebra o isolamento).

**Recomendação técnica:** A somente se cada chamada continuar sendo de um único município e o teste de isolamento provar que nenhum endpoint aceita dois tokens; senão B. A decisão sai com a evidência dos testes de isolamento da F03, não por elegância.

**Quem decide:** Rafael.

**O que fica bloqueado:** o modo "Todos" da caixa e do sino (F11-E29). O portal funciona por município sem ele.

**Evidência necessária:** `docs/evidencias-v2/CP-59/decisao.md` com decisão registrada e a saída do teste de isolamento com dois tokens.

---

🛑 **CHECKPOINT CP-60: Destino, país e retenção dos traces (OpenTelemetry)**

**Origem:** PR:D-13 (PREMISSA: OpenTelemetry com destino configurável); F21-E10, F21-E12, F21-E14, F25-E19; relacionado a CP-06. UNIFICA as duas citações do mesmo nome provisório NOVO-TRACING-DESTINO.

**Pergunta:** qual ferramenta, em que país e com que prazo de retenção guardar os traces distribuídos?

**Por que decidir agora:** o tracing e o painel de SLO entram pela D-13. Trace pode carregar dado pessoal por engano e é um novo destino de dado, que entra na lista de subprocessadores e no aviso aos municípios (CP-06). Custo e residência são NÃO CONFIRMADOS.

**Alternativas:**
- A: ferramenta hospedada compatível com OpenTelemetry.
- B: coletor e armazenamento próprios, no país.
- C: coletor local em HML com dado sintético e sem destino de produção até a decisão.

**Recomendação técnica:** destino configurável (A ou B sem reescrita) e começar por C em HML. Amostragem com custo limitado (F21-E12) e sem dado pessoal no trace (F25-E19), qualquer que seja o destino.

**Quem decide:** Rafael.

**O que fica bloqueado:** o destino de produção do tracing (F21-E10, F21-E12) e o painel de SLO com dado de produção (F21-E14).

**Evidência necessária:** `docs/evidencias-v2/CP-60/decisao.md` com decisão, a atualização de `docs/SUBPROCESSADORES.md` e a retenção definida.

---

🛑 **CHECKPOINT CP-61: Planos, valores, excedente, nota fiscal e cobrança por gateway**

**Origem:** PR:D-19 (cobrança e contrato no console); F20-E14, F20-E18.

**Pergunta:** quais são os planos, os valores e o excedente, e a nota fiscal e a cobrança por gateway entram na V2?

**Por que decidir agora:** o console passa a registrar contrato, plano, vigência e demonstrativo de faturamento (F20-E14). Cobrar de verdade exige gateway, nota fiscal e regime tributário, que são decisão de negócio e de contabilidade, com obrigações próprias.

**Alternativas:**
- A: só o registro de contrato, plano e demonstrativo, sem cobrança no sistema.
- B: cobrança por gateway, sem nota fiscal no sistema.
- C: cobrança por gateway e emissão de nota fiscal.

**Recomendação técnica:** A na V2, com os valores como dado configurável e nenhum valor real até a decisão. B e C só com decisão e com o fluxo de gateway e de nota definido com apoio especializado.

**Quem decide:** Rafael e Alyson.

**O que fica bloqueado:** valor real e cobrança (F20-E14). O registro de contrato com valor sintético não fica bloqueado.

**Evidência necessária:** `docs/evidencias-v2/CP-61/decisao.md` com decisão registrada com os planos aprovados (sem valores sigilosos no repositório).

---

🛑 **CHECKPOINT CP-62: Escala de níveis do incidente e estrutura de comando**

**Origem:** PR:D-15 (INC-01 a INC-04); F29-E01, F29-E03.

**Pergunta:** qual a escala de níveis do incidente e qual a estrutura de comando (quem comanda e que funções existem)?

**Por que decidir agora:** o modo incidente agrupa ocorrências sem alterá-las e tem ciclo de vida próprio. Os níveis e a estrutura de comando dependem do modo como cada Defesa Civil se organiza e não são decisão técnica.

**Alternativas:**
- A: escala de níveis configurável por município, com um padrão de poucos níveis.
- B: escala fixa do produto, igual para todos.
- C: escala que segue a da Defesa Civil estadual (a confirmar).

**Recomendação técnica:** A, com os níveis como dado do município e a estrutura de comando como papéis atribuídos no incidente (ver CP-63). Nenhum termo oficial é fixado sem estar em `docs/CONTEXTO.md`.

**Quem decide:** Alyson.

**O que fica bloqueado:** a produção da F29 com a escala final (F29-E01, F29-E03). A construção com a escala padrão provisória não fica bloqueada.

**Evidência necessária:** `docs/evidencias-v2/CP-62/decisao.md` com a escala e a estrutura aprovadas por município piloto.

---

🛑 **CHECKPOINT CP-63: Papéis de incidente e de logística**

**Origem:** PR:D-15 (LOG-01, RN-08, RN-09); F29-E01, F30-E02; relacionado a CP-62 e CP-67.

**Pergunta:** que papéis existem no incidente e na logística (quem cadastra local, quem aprova ajuste, quem entrega, quem abre e fecha o incidente) e que permissão cada um tem?

**Por que decidir agora:** incidente e logística criam escritas novas, e toda escrita passa por `exigirPermissao`. Sem a matriz de papéis, as permissões novas ficam sem dono e o isolamento por papel não pode ser provado.

**Alternativas:**
- A: papéis novos atribuídos por incidente.
- B: reaproveitar os papéis existentes e acrescentar permissões novas a eles.
- C: um papel único de logística com todas as permissões.

**Recomendação técnica:** B primeiro (menor superfície de autorização), com papel novo só quando a permissão não couber nos existentes. Em qualquer caso, a matriz é atualizada em `docs/roadmap-v2/20-matrizes.md` e o negativo de autorização é testado.

**Quem decide:** Rafael e Alyson.

**O que fica bloqueado:** a produção da F29 e da F30 (F29-E01, F30-E02).

**Evidência necessária:** `docs/evidencias-v2/CP-63/decisao.md` com a matriz de papéis e permissões aprovada.

---

🛑 **CHECKPOINT CP-64: Conteúdo do relatório de situação do incidente**

**Origem:** PR:D-15 (INC-04); F29-E15.

**Pergunta:** o que entra no relatório de situação do incidente: período, campos, quem assina e o que vai ao PDF?

**Por que decidir agora:** o relatório de situação é imutável por período e guarda um PDF. Ele é lido por quem toma decisão em crise e pode ser usado oficialmente.

**Alternativas:**
- A: o conteúdo proposto pela F29-E15.
- B: conteúdo por município.
- C: só o quadro de situação sem relatório formal.

**Recomendação técnica:** A, sem dado pessoal sensível no relatório, e com a assinatura tratada como aprovação autenticada (CP-14, CP-41).

**Quem decide:** Alyson.

**O que fica bloqueado:** uso oficial do relatório (F29-E15). A geração com conteúdo provisório não fica bloqueada.

**Evidência necessária:** `docs/evidencias-v2/CP-64/decisao.md` com o modelo de relatório aprovado.

---

🛑 **CHECKPOINT CP-65: Cadastro nominal de abrigados**

**Origem:** PR:D-15 (ABR-01); F29-E09, F29-E18; relacionado a CP-11 e CP-52.

**Pergunta:** o cadastro nominal de abrigados (dado pessoal sensível: saúde, família, menores, deficiência) entra na V2?

**Por que decidir agora:** a D-15 traz abrigos completos, mas o cadastro por nome é uma ampliação com risco alto de privacidade: a lista de pessoas abrigadas é dado sensível e exposto numa crise.

**Alternativas:**
- A: só contagem agregada por local, com ocupação e necessidades, sem nome.
- B: cadastro nominal mínimo (nome, faixa etária e necessidade especial), com acesso restrito pelo nível de sigilo.
- C: cadastro nominal completo.

**Recomendação técnica:** A como escopo da F29-E09; B só com parecer (base legal, retenção, acesso) e com o nível de sigilo do CP-52; C não recomendado.

**Quem decide:** Rafael, com o jurídico e o DPO para a base legal.

**O que fica bloqueado:** somente a ampliação nominal: qualquer campo com nome de abrigado. A F29-E09 entrega ocupação e necessidades sem nomes.

**Evidência necessária:** `docs/evidencias-v2/CP-65/decisao.md` com decisão e, se B ou C, o parecer arquivado (referência).

---

🛑 **CHECKPOINT CP-66: Saldo negativo de estoque com o agente offline**

**Origem:** PR:D-15 (LOG-04, RN-09); F30-E01, F30-E04, F30-E14.

**Pergunta:** o saldo de estoque pode ficar negativo quando a saída é registrada por um agente offline?

**Por que decidir agora:** o saldo é derivado do razão de movimentos append-only. Duas saídas offline sobre o mesmo item podem somar mais do que o saldo, e na emergência a entrega não pode ser barrada por falta de sinal.

**Alternativas:**
- A: permitir o saldo negativo provisório, que aparece como divergência a conciliar.
- B: bloquear a saída offline quando o saldo local indicar insuficiente.
- C: aceitar a saída offline só dentro de uma cota reservada ao agente.

**Recomendação técnica:** A com alerta de divergência e correção por ajuste aprovado por outra pessoa (CP-67): registro nunca se apaga, a divergência entra como evento novo.

**Quem decide:** Rafael.

**O que fica bloqueado:** a produção da F30 com a regra de saldo (F30-E01, F30-E04, F30-E14).

**Evidência necessária:** `docs/evidencias-v2/CP-66/decisao.md` com decisão registrada e o teste de duas saídas offline concorrentes.

---

🛑 **CHECKPOINT CP-67: Quem aprova ajuste de estoque**

**Origem:** PR:D-15 (RN-09); F30-E01, F30-E06; relacionado a CP-63 e CP-66.

**Pergunta:** quem aprova um ajuste de estoque, e há limite de quantidade ou valor acima do qual a aprovação sobe?

**Por que decidir agora:** o ajuste de estoque é a única forma de corrigir o saldo derivado e é o ponto de fraude típico de logística. A regra pede aprovação de outra pessoa.

**Alternativas:**
- A: qualquer pessoa com permissão de logística, diferente de quem pediu.
- B: papel de coordenação de logística.
- C: dupla aprovação acima de um limite configurável.

**Recomendação técnica:** B com C acima de um limite configurável, com pedido, aprovador, motivo e instante em evento append-only.

**Quem decide:** Alyson.

**O que fica bloqueado:** a produção da F30 (F30-E06).

**Evidência necessária:** `docs/evidencias-v2/CP-67/decisao.md` com a regra aprovada e o teste de que o autor do pedido não aprova o próprio ajuste.

---

🛑 **CHECKPOINT CP-68: Categorias padrão e itens controlados do catálogo**

**Origem:** PR:D-15 (LOG-02); F30-E03.

**Pergunta:** quais são as categorias padrão do catálogo e quais itens são controlados (medicamento e outros com regra de guarda, validade ou acesso)?

**Por que decidir agora:** o catálogo guarda categorias, itens, unidades e lotes. Item controlado tem exigência própria de guarda e de acesso, que o sistema não pode inventar.

**Alternativas:**
- A: categorias configuráveis por município, sem lista pré-carregada além de exemplos sintéticos.
- B: lista padrão do produto, revisada pelo Alyson.
- C: sem itens controlados na V2.

**Recomendação técnica:** A, com marca de item controlado, controle de lote e validade e acesso restrito. Nenhuma regra legal de item controlado é codificada sem o texto aprovado pelo jurídico.

**Quem decide:** Alyson, com o jurídico para os itens controlados.

**O que fica bloqueado:** o uso real do catálogo (F30-E03).

**Evidência necessária:** `docs/evidencias-v2/CP-68/decisao.md` com a lista de categorias e a lista de itens controlados aprovadas.

---

⚖️ **CHECKPOINT CP-69: Dados de doador e de recebedor: finalidade e retenção**

**Origem:** PR:D-15 (LOG-05, LOG-06); F30-E08, F30-E09, F30-E17; relacionado a CP-11.

**Pergunta:** qual a finalidade e a retenção dos dados de doador e de recebedor (nome, documento, telefone, assinatura de recebimento)?

**Por que decidir agora:** a logística humanitária registra quem doou e quem recebeu. É dado pessoal de pessoas, muitas em situação de vulnerabilidade, e a prova de entrega pode exigir identificação.

**Alternativas:** não cabem ao roadmap; o parecer escolhe.

**Recomendação técnica:** minimizar por padrão (só o necessário), classificar o dado, deixar a retenção configurável com padrão vazio e implementar a saída por titular, para que o parecer entre sem reescrever código.

**O que o roadmap implementa sem decidir:** a minimização, a classificação, a retenção configurável, o manifesto, a saída e a eliminação isolada por município (F30-E17).

**O que fica atrás do parecer:** a finalidade, a base, o prazo de retenção e o que pode ser exigido de recebedor.

**Quem decide:** jurídico e DPO.

**O que fica bloqueado:** dado real de doador ou de recebedor (F30-E08, F30-E09, F30-E17).

**Evidência necessária:** `docs/evidencias-v2/CP-69/decisao.md` com parecer arquivado (referência, sem conteúdo sigiloso).

---

🛑 **CHECKPOINT CP-70: Valores finais dos alertas de estoque**

**Origem:** PR:D-15 (LOG-04); F30-E11.

**Pergunta:** quais são os valores finais dos alertas de validade, estoque mínimo, divergência tolerada e inventário atrasado?

**Por que decidir agora:** o alerta que dispara demais é ignorado e o que dispara de menos esconde o problema. A etapa traz valores iniciais; os finais dependem da operação real.

**Alternativas:**
- A: valores iniciais da F30-E11, ajustados após o piloto.
- B: valores definidos por município.
- C: sem alerta automático na V2.

**Recomendação técnica:** A, configuráveis por município, revisados com a taxa de alerta ignorado medida no piloto.

**Quem decide:** Alyson.

**O que fica bloqueado:** os valores finais (F30-E11). Os valores iniciais provisórios não bloqueiam a etapa.

**Evidência necessária:** `docs/evidencias-v2/CP-70/decisao.md` com os valores aprovados e a taxa de alertas medida.

---

🛑 **CHECKPOINT CP-71: Regra final de kits permanentes e de inventários simulados**

**Origem:** PR:D-15 (LOG-07); F30-E10.

**Pergunta:** qual a regra final de kits permanentes e de inventários simulados durante o ano: periodicidade, quem faz e como o simulado se distingue do movimento real?

**Por que decidir agora:** o simulado treina a operação sem alterar o estoque real. Se a regra não separar simulado de real, o saldo fica errado.

**Alternativas:**
- A: simulado em lote separado que nunca altera o saldo real; kit como composição de itens.
- B: simulado com efeito real reversível.
- C: sem simulado na V2.

**Recomendação técnica:** A, porque o saldo é derivado do razão e o simulado não pode entrar nele.

**Quem decide:** Alyson.

**O que fica bloqueado:** a regra final (F30-E10).

**Evidência necessária:** `docs/evidencias-v2/CP-71/decisao.md` com a regra aprovada e o teste de que o simulado não altera o saldo real.

---

🛑 **CHECKPOINT CP-72: Operação degradada da logística sem o sistema**

**Origem:** PR:D-15 (RNF-15); F30-E16.

**Pergunta:** como a logística opera quando o sistema está indisponível (papel, rádio, planilha), quem registra depois e em quanto tempo?

**Por que decidir agora:** a emergência não espera o sistema voltar. O roadmap oferece comprovante de entrega e relatório de contingência imprimíveis, mas o procedimento humano é do município.

**Alternativas:**
- A: formulário impresso e conciliação em até um prazo definido pelo município.
- B: planilha off-line padronizada, importada depois.
- C: sem procedimento formal.

**Recomendação técnica:** A, com o comprovante e o relatório imprimíveis (F30-E16) e a conciliação por movimento de ajuste aprovado (CP-67).

**Quem decide:** Alyson e o município.

**O que fica bloqueado:** a operação real com a contingência (F30-E16 em produção).

**Evidência necessária:** `docs/evidencias-v2/CP-72/decisao.md` com o procedimento aprovado pelo município.

---

🛑 **CHECKPOINT CP-73: Revisão das traduções em inglês e em espanhol**

**Origem:** PR:D-12; F23-E11, F35-E11, F35-E14. UNIFICA os nomes provisórios NOVO-REVISOR-DE-IDIOMAS e NOVO-REVISAO-DA-TRADUCAO: é a mesma decisão.

**Pergunta:** quem revisa as traduções em inglês (en) e em espanhol (es) e como o idioma é marcado como revisado?

**Por que decidir agora:** a D-12 inclui os idiomas inglês e espanhol. Tradução automática ou feita sem revisão pode errar um aviso de emergência. A F35-E11 exige a tradução completa e revisada das telas.

**Alternativas:**
- A: revisor humano por idioma, contratado ou voluntário nomeado.
- B: revisão pela equipe, com ferramenta e aviso "tradução não revisada" na tela.
- C: manter só pt-BR até haver revisor.

**Recomendação técnica:** A para as telas de emergência, com a marca `revisado` por idioma no repositório e o aviso de B nas demais. Os textos de documento oficial continuam em pt-BR (D-12).

**Quem decide:** Rafael.

**O que fica bloqueado:** marcar o idioma como revisado e concluir a F35 (F35-E11, F35-E14); a prova de idioma na acessibilidade (F23-E11).

**Evidência necessária:** `docs/evidencias-v2/CP-73/decisao.md` com o nome ou a função do revisor e a marca de revisado por idioma.

---

🛑 **CHECKPOINT CP-74: Dono e orçamento das rotinas recorrentes de segurança e de DR**

**Origem:** PR:D-19 (pentest recorrente, exercício anual de DR, licenças); F23-E13, F25-E21, F27-E09, F28-E16; relacionado a CP-01 e CP-33.

**Pergunta:** quem é o dono e qual é o orçamento do pentest recorrente, do exercício anual de recuperação de desastre e da renovação de licenças e certificados?

**Por que decidir agora:** a D-19 faz entrarem as rotinas recorrentes. Rotina sem dono e sem orçamento vira promessa vazia. Com uma pessoa dedicada (CP-01), é preciso dizer o que acontece quando ela não pode fazer.

**Alternativas:**
- A: calendário anual com dono nomeado e orçamento reservado.
- B: rotina só após mudança grande de arquitetura.
- C: sem promessa de recorrência.

**Recomendação técnica:** A no mínimo viável: calendário, dono nomeado, orçamento mínimo reservado e a segunda pessoa (CP-07) como suplente.

**Quem decide:** Rafael.

**O que fica bloqueado:** a promessa dessas rotinas ao município (F25-E21, F28-E16).

**Evidência necessária:** `docs/evidencias-v2/CP-74/decisao.md` com o calendário, o dono e o teto de orçamento.

---

🛑 **CHECKPOINT CP-75: Quais módulos novos entram no piloto**

**Origem:** PR:D-07, PR:D-15, PR:D-16; F26-E12, F27-E07, F27-E08, F27-E09; relacionado a CP-34.

**Pergunta:** quais dos módulos novos (incidentes, abrigos, logística, território, canal ampliado e idiomas) entram no piloto e em que ordem?

**Por que decidir agora:** o piloto é escalonado em degraus. Entrar com tudo de uma vez sobrecarrega a equipe do município e uma pessoa só de suporte.

**Alternativas:**
- A: todos os módulos, em degraus 4 a 6.
- B: só incidentes, abrigos e logística no piloto; o canal ampliado depois.
- C: só o núcleo anterior, e os módulos novos depois do piloto.

**Recomendação técnica:** B, porque os módulos de incidente e logística dependem menos de contratações externas e de pareceres (CP-46, CP-47) do que o canal ampliado.

**Quem decide:** Rafael, Alyson e o município.

**O que fica bloqueado:** os degraus 4 a 6 do piloto (F27-E07, F27-E08, F27-E09).

**Evidência necessária:** `docs/evidencias-v2/CP-75/decisao.md` com o termo do piloto atualizado com os módulos aceitos.

---

🛑 **CHECKPOINT CP-76: Credenciais de integração real que o piloto usa**

**Origem:** PR:D-14; F26-E12, F27-E09, F28-E15; relacionado a CP-41 e CP-78 a CP-84.

**Pergunta:** quais integrações reais o piloto usa (WhatsApp, assinatura, S2ID, SEI, alerta público, Cemaden) e com que credenciais?

**Por que decidir agora:** cada integração depende de contratação ou credenciamento próprios. O degrau 6 do piloto só liga as que tiverem credencial real; as demais ficam em sandbox.

**Alternativas:**
- A: apenas as integrações cujo credenciamento já estiver concluído.
- B: todas, adiando o piloto até concluir.
- C: nenhuma real; só sandbox.

**Recomendação técnica:** A, com o estado de cada integração (real ou sandbox) declarado no relatório do piloto (F28-E15).

**Quem decide:** Rafael, Alyson e o município.

**O que fica bloqueado:** o degrau 6 do piloto (F27-E09) e o estado de integrações em produção (F28-E15).

**Evidência necessária:** `docs/evidencias-v2/CP-76/decisao.md` com a lista de integrações reais do piloto, sem credenciais.

---

🛑 **CHECKPOINT CP-77: Onde mora a chave mestra dos segredos de integração por município**

**Origem:** PR:D-14; F31-E01, F31-E03, F31-E20; relacionado a CP-07.

**Pergunta:** onde fica a chave mestra que cifra os segredos de integração de cada município (WhatsApp, S2ID, SEI e outros), como é rotacionada e quem acessa?

**Por que decidir agora:** o segredo cifrado por município é guardado no banco. A chave mestra não pode morar no mesmo lugar que o dado cifrado, e hoje os segredos vivem em `fly secrets`. Sem decisão, a F31 não vai a produção com segredo real.

**Alternativas:**
- A: cofre ou serviço de chaves gerenciado.
- B: a chave mestra como segredo da plataforma de hospedagem, com rotação manual documentada.
- C: uma chave por município, derivada de uma chave mestra única.

**Recomendação técnica:** A se o custo couber; B como piso com rotação documentada; C em qualquer caso para limitar o raio de um vazamento. Nenhum segredo vai ao repositório.

**Quem decide:** Rafael.

**O que fica bloqueado:** a produção da F31 com segredo real (F31-E03). O ADR (F31-E01) não fica bloqueado.

**Evidência necessária:** `docs/evidencias-v2/CP-77/decisao.md` com a decisão e o runbook de rotação, sem segredos.

---

🛑 **CHECKPOINT CP-78: WhatsApp oficial: provedor, conta, modelos e contrato**

**Origem:** PR:D-14; F31-E09, F31-E10.

**Pergunta:** qual provedor e conta do WhatsApp oficial, quais modelos de mensagem são aprovados e qual contrato vale?

**Por que decidir agora:** o WhatsApp oficial exige conta empresarial, modelos de mensagem aprovados pela plataforma e contrato com o provedor. Custos e regras de aprovação são NÃO CONFIRMADOS.

**Alternativas:**
- A: provedor oficial direto da plataforma.
- B: provedor intermediário (revendedor autorizado).
- C: sem WhatsApp na V2.

**Recomendação técnica:** A ou B conforme custo e suporte, com o adaptador e o sandbox prontos (F31-E09) e o estado de entrega registrado.

**Quem decide:** Rafael.

**O que fica bloqueado:** o envio real de WhatsApp (F31-E09, F31-E10).

**Evidência necessária:** `docs/evidencias-v2/CP-78/decisao.md` com a conta, o provedor, a lista de modelos aprovados e o custo, sem credenciais.

---

⚖️ **CHECKPOINT CP-79: Relato de cidadão por WhatsApp diante de conta e CPF obrigatórios**

**Origem:** PR:D-07 e PR:D-14; F31-E10.

**Pergunta:** receber relato de cidadão por WhatsApp é aceitável, dado que o relato identificado exige conta e CPF e o relato anônimo não entra?

**Por que decidir agora:** o número de telefone não é uma conta verificada nem o CPF. Aceitar relato por WhatsApp pode contornar a regra de identificação da D-07.

**Alternativas:**
- A: não aceitar relato por WhatsApp: só orientar o cidadão a usar o app (a F31-E10 já nasce assim).
- B: aceitar com vínculo da conta e do CPF a um número verificado.
- C: aceitar como relato anônimo (contradiz a D-07 e fica descartada).

**Recomendação técnica:** A. B só depois do parecer sobre CPF (CP-46) e de uma decisão explícita de Rafael.

**Quem decide:** Rafael e o jurídico.

**O que fica bloqueado:** qualquer relato por WhatsApp (F31-E10). A orientação e a parada automática não ficam bloqueadas.

**Evidência necessária:** `docs/evidencias-v2/CP-79/decisao.md` com decisão registrada.

---

⚖️ **CHECKPOINT CP-80: Fontes, licença e serviços WMS das camadas GIS**

**Origem:** PR:D-14; F31-E11, F31-E12, F31-E13.

**Pergunta:** quais fontes de camada GIS (GeoJSON, KML, WMS) cada município usa, com que licença e que atribuição?

**Por que decidir agora:** as camadas vêm de órgãos e de serviços de terceiros, cada um com licença e termos próprios. O sistema só importa e exibe o que o município tem direito de usar.

**Alternativas:** não cabem ao roadmap: a fonte e a licença são do município.

**Recomendação técnica:** implementar a importação com a cadeia de arquivos, o WMS por referência com a imagem buscada pelo servidor (proteção contra requisições a rede interna), a atribuição obrigatória na legenda e o aceite de licença no cadastro da camada.

**O que o roadmap implementa sem decidir:** a importação, o WMS por referência, a legenda com atribuição e a lista alternativa acessível (F31-E11 a F31-E13).

**O que fica atrás do parecer:** a lista de fontes, a licença de cada uma e o direito de uso.

**Quem decide:** o município.

**O que fica bloqueado:** fonte real de camada (F31-E11, F31-E12). A importação de teste com arquivo sintético não fica bloqueada.

**Evidência necessária:** `docs/evidencias-v2/CP-80/decisao.md` com a lista de fontes aprovadas pelo município.

---

🛑 **CHECKPOINT CP-81: Existe API pública utilizável do Cemaden**

**Origem:** PR:D-14 ("dados do Cemaden a confirmar"); F31-E14.

**Pergunta:** o Cemaden oferece uma API pública utilizável (termos, formato, limites) e ela cabe no produto?

**Por que decidir agora:** a D-14 inclui o Cemaden condicionado à confirmação. Se não houver API pública utilizável, o conector não deve ser prometido. Existência, termos e limites são NÃO CONFIRMADOS.

**Alternativas:**
- A: API confirmada por documentação: conector real.
- B: acesso só por credenciamento ou convênio.
- C: não existe: fica a porta de avisos com entrada manual.

**Recomendação técnica:** decidir só depois da confirmação documentada (a F31-E14 inclui esse passo); C como degradação garantida; qualquer aviso exibido mostra origem e hora.

**Quem decide:** Rafael.

**O que fica bloqueado:** o conector real do Cemaden (F31-E14). A porta de avisos e a entrada manual não ficam bloqueadas.

**Evidência necessária:** `docs/evidencias-v2/CP-81/decisao.md` com a confirmação documentada (referência) e a decisão.

---

⚖️ **CHECKPOINT CP-82: Credenciamento do município no S2ID**

**Origem:** PR:D-14; F31-E15.

**Pergunta:** o município tem credenciamento no S2ID para o adaptador falar com ele, e com que perfil de acesso?

**Por que decidir agora:** a integração com o S2ID só funciona com o credenciamento do município. O roadmap constrói a porta, o registro canônico e o sandbox simulado, mas a ativação depende do ato do município.

**Alternativas:** não cabem ao roadmap.

**Recomendação técnica:** deixar o adaptador e o sandbox prontos e testados, com a ativação por município só depois de comprovado o credenciamento.

**O que o roadmap implementa sem decidir:** a porta, o registro canônico e o sandbox simulado (F31-E15).

**O que fica atrás do parecer:** o credenciamento e o perfil de acesso do município.

**Quem decide:** o município.

**O que fica bloqueado:** o adaptador real do S2ID (F31-E15).

**Evidência necessária:** `docs/evidencias-v2/CP-82/decisao.md` com a comprovação do credenciamento (referência, sem credencial).

---

⚖️ **CHECKPOINT CP-83: Credenciamento e instância do SEI do município**

**Origem:** PR:D-14; F31-E16.

**Pergunta:** o município tem uma instância do SEI e credenciamento para o adaptador enviar o documento emitido?

**Por que decidir agora:** o SEI é um sistema do município (ou de outro ente) e cada instância tem seu acesso. O roadmap constrói a porta e o sandbox simulado.

**Alternativas:** não cabem ao roadmap.

**Recomendação técnica:** deixar a porta de processo eletrônico e o sandbox prontos e ativar por município só com credenciamento comprovado.

**O que o roadmap implementa sem decidir:** a porta, o envio do documento emitido em sandbox e o registro canônico (F31-E16).

**O que fica atrás do parecer:** a instância, o credenciamento e o perfil de acesso.

**Quem decide:** o município.

**O que fica bloqueado:** o adaptador real do SEI (F31-E16).

**Evidência necessária:** `docs/evidencias-v2/CP-83/decisao.md` com a comprovação do credenciamento (referência, sem credencial).

---

⚖️ **CHECKPOINT CP-84: Credenciamento para o Defesa Civil Alerta**

**Origem:** PR:D-14; F31-E17.

**Pergunta:** o município está credenciado para emitir alerta pelo Defesa Civil Alerta, e com que regra de quem pode emitir?

**Por que decidir agora:** o alerta chega à população e um erro é irreversível. O roadmap constrói a aprovação por uma segunda pessoa e a simulação, mas só o credenciamento do município autoriza o envio real.

**Alternativas:** não cabem ao roadmap.

**Recomendação técnica:** aprovação por segunda pessoa e simulação sempre, mesmo com credencial real; o adaptador só liga por município depois do credenciamento.

**O que o roadmap implementa sem decidir:** a porta, a aprovação por segunda pessoa, a simulação e o sandbox (F31-E17).

**O que fica atrás do parecer:** o credenciamento e as regras de quem emite alerta.

**Quem decide:** o município.

**O que fica bloqueado:** o adaptador real do alerta (F31-E17).

**Evidência necessária:** `docs/evidencias-v2/CP-84/decisao.md` com a comprovação do credenciamento (referência, sem credencial).

---

🛑 **CHECKPOINT CP-85: Malha municipal do IBGE: fonte, versão, simplificação e carga**

**Origem:** PR:D-16; F32-E03, F32-E16, F16-E05.

**Pergunta:** de que fonte e versão vem a malha municipal do IBGE, com que simplificação dos polígonos, e quem a carrega e atualiza?

**Por que decidir agora:** a resolução do município por polígono depende da malha. Simplificação demais erra a divisa; de menos pesa na consulta. A malha é um dado comum a todos os municípios e fora do isolamento por município (camada comum).

**Alternativas:**
- A: carga feita pelo fornecedor, versionada por ano.
- B: carga por município.
- C: malha simplificada fixa no repositório.

**Recomendação técnica:** A, com a versão, a simplificação e a data registradas, e a tolerância na divisa testada com candidatos (F32-E16, F16-E05).

**Quem decide:** Rafael.

**O que fica bloqueado:** a malha real (F32-E03) e a resolução final do município na divisa (F16-E05). A construção com malha sintética não fica bloqueada.

**Evidência necessária:** `docs/evidencias-v2/CP-85/decisao.md` com a fonte, a versão e a simplificação adotadas.

---

⚖️ **CHECKPOINT CP-86: Áreas de risco: origem, licença e quem vê**

**Origem:** PR:D-16; F32-E05, F32-E06, F32-E16.

**Pergunta:** de onde vêm as áreas de risco de cada município, com que licença, e quem pode vê-las?

**Por que decidir agora:** área de risco pode afetar valor de imóveis e relações com a população. A origem pode ser mapeamento oficial, estudo técnico ou levantamento próprio, cada um com licença e responsabilidade.

**Alternativas:** a parte de licença e visibilidade não cabe ao roadmap; quem vê (internos, órgãos, público) é decisão do município e de Alyson.

**Recomendação técnica:** importar com prévia, relatório e idempotência (F32-E06), guardar versão e origem de cada área e aplicar o nível de sigilo do CP-52 para limitar quem vê.

**O que o roadmap implementa sem decidir:** o cadastro e as versões das áreas, a validação de geometria e a importação por GeoJSON e KML (F32-E05, F32-E06).

**O que fica atrás do parecer:** a origem, a licença e a regra de visibilidade.

**Quem decide:** o município e Alyson.

**O que fica bloqueado:** dado real de área de risco (F32-E05, F32-E06, F32-E16).

**Evidência necessária:** `docs/evidencias-v2/CP-86/decisao.md` com a origem, a licença e a regra de visibilidade aprovadas.

---

🛑 **CHECKPOINT CP-87: O que identifica um imóvel (inscrição, matrícula, endereço)**

**Origem:** PR:D-16, PR:D-20 (lacuna L4, ALY:OCO-05); F32-E07.

**Pergunta:** o que identifica um imóvel no sistema: inscrição cadastral, matrícula, coordenada, ou apenas o endereço?

**Por que decidir agora:** a F32-E07 cria o cadastro mínimo e o vínculo da ocorrência com o imóvel, sem mesclar registros. Inscrição e matrícula ligam o imóvel a um proprietário, o que é dado pessoal.

**Alternativas:**
- A: só endereço e coordenada.
- B: inscrição cadastral do município, como campo opcional.
- C: inscrição e matrícula.

**Recomendação técnica:** A como base e B opcional, sem vínculo ao nome do proprietário no cadastro do imóvel.

**Quem decide:** o município e Alyson.

**O que fica bloqueado:** os campos além do endereço (F32-E07).

**Evidência necessária:** `docs/evidencias-v2/CP-87/decisao.md` com a decisão sobre os campos de identificação do imóvel.

---

🛑 **CHECKPOINT CP-88: Quem publica uma versão de configuração e se precisa de segundo aprovador**

**Origem:** PR:D-17 (CFG-01, RN-10); F33-E01, F33-E04.

**Pergunta:** quem publica uma nova versão da configuração do município (tipos, severidades, prazos, formulários, modelos) e é preciso um segundo aprovador?

**Por que decidir agora:** a configuração versionada altera prazos, severidades e documentos de ocorrências futuras. Uma publicação errada afeta o atendimento do município inteiro.

**Alternativas:**
- A: o coordenador publica sozinho.
- B: sempre um segundo aprovador.
- C: segundo aprovador só para mudanças que alteram prazo, severidade ou modelo de documento.

**Recomendação técnica:** C, para equilibrar agilidade e risco; B no piloto. A versão publicada é imutável e não quebra ocorrência em andamento (F33-E04).

**Quem decide:** Alyson e Rafael.

**O que fica bloqueado:** a publicação de versão por coordenador (F33-E04).

**Evidência necessária:** `docs/evidencias-v2/CP-88/decisao.md` com a regra aprovada e o teste de que o autor não aprova a própria publicação.

---

🛑 **CHECKPOINT CP-89: Quem escreve as perguntas técnicas do checklist por tipo**

**Origem:** PR:D-17 (VIS-05), PR:D-20 (lacuna L16); F33-E05.

**Pergunta:** quem escreve e revisa as perguntas técnicas do checklist de vistoria por tipo de ocorrência (COBRADE)?

**Por que decidir agora:** o roadmap constrói o modelo de checklist com perguntas condicionais, mas o conteúdo técnico (o que perguntar sobre um deslizamento, uma inundação, um colapso) é de quem tem a competência. O sistema não inventa pergunta técnica.

**Alternativas:**
- A: a equipe técnica da Defesa Civil do município.
- B: modelo padrão do fornecedor, revisado pela Defesa Civil.
- C: a Defesa Civil estadual ou um engenheiro consultor.

**Recomendação técnica:** B como ponto de partida, com os exemplos sintéticos marcados como "exemplo" até a revisão da Defesa Civil.

**Quem decide:** Alyson.

**O que fica bloqueado:** o conteúdo por tipo em produção (F33-E05).

**Evidência necessária:** `docs/evidencias-v2/CP-89/decisao.md` com o checklist aprovado por tipo e quem o revisou.

---

🛑 **CHECKPOINT CP-90: Campos, estados e protocolo legado importáveis por CSV**

**Origem:** PR:D-17 (OCO-08); F33-E12, F33-E13.

**Pergunta:** quais campos, estados e protocolo legado um município pode importar por CSV?

**Por que decidir agora:** a importação de lote cria ocorrências a partir de dado antigo. Importar estado em andamento pode gerar prazos e lembretes falsos; o protocolo legado precisa ser preservado sem colidir com o protocolo novo.

**Alternativas:**
- A: só campos mínimos e ocorrências já encerradas (histórico).
- B: também ocorrências abertas.
- C: protocolo legado guardado como campo à parte, sem substituir o protocolo novo.

**Recomendação técnica:** A com C: histórico encerrado, protocolo legado em campo próprio e importação com prévia, idempotência e versão aplicada (F33-E12, F33-E13).

**Quem decide:** Alyson e o município.

**O que fica bloqueado:** dado real na importação (F33-E13). A prévia com CSV sintético não fica bloqueada.

**Evidência necessária:** `docs/evidencias-v2/CP-90/decisao.md` com a lista de campos e estados aceitos.

---

⚖️ **CHECKPOINT CP-91: Login gov.br: credenciamento, homologação, escopos e uso da marca**

**Origem:** PR:D-07; F34-E13, F34-E14, F34-E17; relacionado a CP-46.

**Pergunta:** como se obtém o credenciamento e a homologação do login gov.br, com que escopos, e como a marca do gov.br pode ser usada?

**Por que decidir agora:** o login gov.br traz o CPF verificado, que prevalece sobre o CPF só informado (F34-E14). A integração real exige credenciamento, homologação e regras de uso da marca, todos NÃO CONFIRMADOS.

**Alternativas:**
- A: credenciar e homologar para a V2.
- B: só login por e-mail e SMS na V2; gov.br depois.
- C: sem gov.br.

**Recomendação técnica:** A, com a integração OIDC com PKCE pronta em sandbox (F34-E13) e a ativação só depois da homologação. Escopos mínimos.

**Quem decide:** Rafael e o jurídico (marca e termos).

**O que fica bloqueado:** ativar o login gov.br (F34-E13, F34-E17).

**Evidência necessária:** `docs/evidencias-v2/CP-91/decisao.md` com a comprovação do credenciamento e da homologação, sem credenciais.

---

🛑 **CHECKPOINT CP-92: Provedor de SMS: preço, teto diário e contrato de dados**

**Origem:** PR:D-07 (reverte DP:K8); F34-E15.

**Pergunta:** qual provedor de SMS, a que preço, com que teto diário de envio e com que contrato de tratamento de dados?

**Por que decidir agora:** o login por SMS gera custo por mensagem e é alvo de abuso por envio em massa. A F34-E15 implementa a porta de provedor, o código de uso único e o teto de custo; o provedor real depende de contrato. Preços são NÃO CONFIRMADOS.

**Alternativas:**
- A: provedor de SMS nacional, com teto diário por município.
- B: provedor internacional.
- C: sem SMS na V2.

**Recomendação técnica:** A, com o teto de custo implementado no código, o limite por número e a entrada do provedor na lista de subprocessadores (CP-06).

**Quem decide:** Rafael.

**O que fica bloqueado:** o envio real de SMS (F34-E15).

**Evidência necessária:** `docs/evidencias-v2/CP-92/decisao.md` com o provedor, o teto e a referência do contrato, sem credenciais.

---

🛑 **CHECKPOINT CP-93: Login social: contas de desenvolvedor, regra da Apple e privacidade**

**Origem:** PR:D-07; F34-E16, F34-E17; relacionado a CP-04.

**Pergunta:** como ficam as contas de desenvolvedor do Google e da Apple, a regra da loja da Apple sobre oferecer login com Apple junto de outro login social, e o rótulo de privacidade das lojas?

**Por que decidir agora:** a D-07 inclui o login Google e Apple. A regra da loja da Apple sobre oferecer o login com Apple junto de outros logins sociais é NÃO CONFIRMADA e precisa ser verificada na diretriz vigente antes da submissão. As contas de loja dependem do CP-04.

**Alternativas:**
- A: Google e Apple, com o rótulo de privacidade preenchido.
- B: só Apple, se a regra da loja exigir.
- C: sem login social.

**Recomendação técnica:** A, depois de conferir a diretriz da Apple e de o CP-04 fixar a entidade das contas. O login social não substitui o CPF (CP-46).

**Quem decide:** Rafael.

**O que fica bloqueado:** o login Google e Apple em produção (F34-E16, F34-E17).

**Evidência necessária:** `docs/evidencias-v2/CP-93/decisao.md` com a conferência da diretriz, as contas e o rótulo de privacidade, sem credenciais.

---

🛑 **CHECKPOINT CP-94: Quem responde o chat do relato, em que horário e com que prazo**

**Origem:** PR:D-07; F34-E07, F34-E20; relacionado a CP-28.

**Pergunta:** quem responde a conversa do relato, em que horário e com que prazo de resposta?

**Por que decidir agora:** a conversa por relato é sem tempo real. O cidadão espera resposta; uma conversa sem responsável frustra e cria risco. A tela precisa dizer que o canal não substitui 190, 192 e 193.

**Alternativas:**
- A: equipe de triagem do município, em horário comercial, com prazo de resposta informado ao cidadão.
- B: plantão em todos os horários.
- C: sem chat.

**Recomendação técnica:** A, com o horário e o prazo mostrados ao cidadão na conversa e o aviso de emergência sempre visível.

**Quem decide:** Alyson e o município.

**O que fica bloqueado:** a conversa em produção (F34-E07, F34-E20).

**Evidência necessária:** `docs/evidencias-v2/CP-94/decisao.md` com o horário, o responsável e o prazo aprovados por município.

---

⚖️ **CHECKPOINT CP-95: Declaração de uso da imagem do logotipo do município**

**Origem:** PR:D-11; F35-E01, F35-E03, F35-E14.

**Pergunta:** que declaração ou termo autoriza o uso da imagem do logotipo do município (brasão e marca) na identidade visual do produto?

**Por que decidir agora:** a D-11 traz o logotipo, o nome e a cor de destaque por município. O brasão e a marca do município são imagem oficial, com regra própria de uso.

**Alternativas:** não cabem ao roadmap.

**Recomendação técnica:** implementar o envio do logotipo pela cadeia de arquivos (tipos permitidos, SVG recusado, tamanho e derivado) com um aceite versionado do termo de uso, para que o texto aprovado entre sem reescrever código.

**O que o roadmap implementa sem decidir:** o envio e a validação do logotipo, o derivado e o aceite versionado (F35-E03).

**O que fica atrás do parecer:** o texto da declaração e quem a assina pelo município.

**Quem decide:** o jurídico, com o município.

**O que fica bloqueado:** logotipo de município real (F35-E03, F35-E14). Os testes com logotipo sintético não ficam bloqueados.

**Evidência necessária:** `docs/evidencias-v2/CP-95/decisao.md` com a declaração arquivada por município (referência).
