# Defesa Civil Operacional 360

Documento de apresentação da Fase 0. Escrito para ser lido sem ver o protótipo.

---

## O problema

A Defesa Civil municipal trabalha hoje, na maior parte dos municípios brasileiros, com uma combinação de caderno, planilha, grupo de WhatsApp e pasta de fotos no celular do agente.

Isso gera três problemas concretos, que aparecem todo dia:

1. **O chamado se perde entre o telefone e a rua.** Alguém anota, alguém repassa, alguém vai. Não existe um número único que amarre a solicitação, a vistoria e o desfecho.
2. **A vistoria feita em campo não vira documento sozinha.** O agente volta com fotos no celular e anotações no papel, e alguém no escritório redigita tudo. O retrabalho é grande e a informação se degrada no caminho.
3. **Não há como provar o que foi feito.** Quando o Ministério Público, o Tribunal de Contas ou o próprio morador pergunta o que a Defesa Civil fez naquele endereço, a resposta depende da memória de quem estava lá.

O agravante é que, justamente no dia em que o sistema mais importa (chuva forte, muitas ocorrências ao mesmo tempo), é quando o sinal de celular falha e a equipe está toda na rua.

---

## A solução

Um sistema de gestão operacional que cobre o ciclo diário completo da Defesa Civil, com uma exigência inegociável: **funcionar sem internet no campo**.

O ciclo que o sistema cobre:

**Entrada** → o chamado é registrado com solicitante, endereço, tipo e descrição, e recebe um protocolo único. O sistema avisa se já existe chamado no mesmo endereço.

**Triagem** → o operador classifica gravidade e registra se há vulnerabilidade presente (idoso, criança, mobilidade reduzida). Isso muda a prioridade na fila.

**Despacho** → o coordenador atribui a ocorrência a uma equipe, com prazo. A partir daí o prazo corre e a ocorrência aparece na fila do agente.

**Vistoria em campo** → o agente recebe a tarefa no celular, executa o checklist, tira fotos, captura GPS e colhe a assinatura do morador. **Tudo isso funciona sem sinal.** O que foi feito offline fica numa fila no aparelho.

**Sincronização** → quando o sinal volta, a fila esvazia item a item. Nada se perde, nada duplica, e o documento final registra as duas marcas de tempo: quando foi coletado em campo e quando chegou ao servidor.

**Documento** → o relatório de vistoria e o termo de interdição parcial saem prontos, com brasão, protocolo, checklist respondido, fotos com legenda, autoria e matrícula. É o documento que sai do sistema, não um que alguém redigita depois.

**Providência** → o que depende de outra secretaria é encaminhado com prazo e responsável, e passa a aparecer como pendência no painel do coordenador.

**Encerramento** → só com motivo obrigatório. A ocorrência sai da fila ativa e a linha do tempo fica completa: quem fez o quê, quando, e se foi do escritório ou do campo.

---

## Fluxo tela a tela

| Perfil | Tela | O que faz |
| --- | --- | --- |
| Operador | Abrir ocorrência | Registra o chamado, com aviso de possível duplicidade no mesmo endereço |
| Operador | Triagem | Classifica gravidade e marca vulnerabilidade presente |
| Coordenador | Painel | Fila do dia por prioridade e prazo, com indicadores de atraso e de casos críticos |
| Coordenador | Detalhe da ocorrência | Despacha para a equipe, acompanha, encaminha providência, encerra |
| Coordenador | Mapa | Distribuição geográfica das ocorrências, com filtro por tipo e por status |
| Agente de campo | Minhas tarefas | Fila do agente, com indicador de conexão e contadores de pendente, atrasada e concluída |
| Agente de campo | Vistoria | Checklist, fotos, GPS, assinatura. Funciona sem sinal |
| Coordenador | Relatório de vistoria | Documento oficial gerado a partir dos dados coletados |
| Coordenador | Termo de interdição parcial | Documento oficial de interdição, com a mesma identidade documental |
| Coordenador | Usuários e equipes | Cadastro de colaboradores e composição das equipes |
| Coordenador | Configurações | Tipos de ocorrência, prazos padrão por severidade, equipes |

---

## Os diferenciais

**O offline é real, não é enfeite.** A vistoria inteira acontece sem sinal, e a sincronização é o momento em que o sistema prova que não perde nem duplica nada. Esse é o problema mais difícil deste tipo de produto, e é onde a maioria das ferramentas genéricas de fiscalização municipal não chega.

**A taxonomia é a da área, não uma inventada.** Os tipos de ocorrência usam os nomes da COBRADE (Codificação Brasileira de Desastres): deslizamento, inundação, alagamento, enxurrada, vendaval, granizo, colapso de edificação, incêndio urbano. Isso importa porque é a linguagem que a Defesa Civil já usa e que o reconhecimento federal cobra.

**O documento é o produto.** O relatório de vistoria e o termo de interdição saem com aparência de documento oficial de prefeitura, com autoria, matrícula, data, versão e as evidências anexadas. O servidor público julga o software pelo papel que sai dele.

**A trilha é auditável por construção.** Cada evento da linha do tempo registra autor, papel, data, hora e origem (campo ou escritório). Não é um log técnico: é a resposta pronta para quando alguém perguntar o que foi feito.

---

## O que este produto explicitamente não é

Isto precisa ficar claro antes de qualquer conversa avançar:

- **Não substitui o S2ID.** O S2ID é o sistema federal de reconhecimento de desastre e de solicitação de recursos. Este produto organiza a operação diária do município; ele não envia nada ao governo federal por conta própria.
- **Não substitui o Defesa Civil Alerta nem o Cemaden.** Não é sistema de monitoramento meteorológico nem de alerta antecipado de desastre.
- **Não é aplicativo de alerta à população.** Não manda SMS nem notificação para o cidadão.
- **Não substitui os telefones 190, 192 e 193.** Emergência com risco imediato à vida continua sendo chamada pelos canais de emergência.
- **Não decide nada sozinho.** Não há classificação automática de risco. A gravidade é definida por quem tem competência técnica para isso.

O que ele é: **registro e gestão operacional**. A ferramenta que organiza e comprova o trabalho da equipe.

---

## Situação atual e próximos passos

Este é um **protótipo de validação de conceito**, não um sistema em operação. Ele existe para responder uma pergunta: o fluxo mostrado corresponde ao trabalho real de uma Defesa Civil municipal?

Não há, nesta fase, preço definido, prazo de entrega estimado nem condição de contratação estabelecida.

O próximo passo depende da resposta a essa pergunta. Se o fluxo se confirmar, os caminhos possíveis são um piloto assistido com um município parceiro ou uma contratação pela via de solução inovadora, conforme o rito que o próprio órgão preferir adotar.

---

## Base normativa considerada

O produto foi desenhado considerando as seguintes normas, sem que nenhuma delas seja citada aqui como parecer jurídico:

- Lei 12.608/2012 (Política Nacional de Proteção e Defesa Civil), alterada pela Lei 14.750/2023
- Lei 13.709/2018 (LGPD)
- Lei 14.133/2021 (licitações e contratos administrativos)
- Lei Complementar 182/2021 (Marco Legal das Startups)
- Lei 14.129/2021 (Governo Digital)
- Lei 13.146/2015, artigo 63 (acessibilidade digital)
- COBRADE (Codificação Brasileira de Desastres)
