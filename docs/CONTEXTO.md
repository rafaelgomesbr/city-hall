# Contexto do produto (resumo para a Fase 0)

## O que é
Defesa Civil Operacional 360 (nome provisório): SaaS multi-tenant de gestão operacional para Defesas Civis municipais e consórcios públicos. Cobre o ciclo diário completo: entrada da solicitação, protocolo único, triagem, despacho, vistoria de campo mesmo sem internet, evidências (foto, GPS, assinatura), documento técnico, providências encaminhadas a outras secretarias e encerramento com trilha auditável. Modo emergência (incidentes, abrigos) e logística humanitária são fases futuras: o protótipo apenas insinua essa evolução em uma tela simples de visão futura, sem detalhar.

## O que NÃO é (posicionamento obrigatório na apresentação)
Não substitui S2ID, Defesa Civil Alerta, Cemaden nem os telefones 190, 192 e 193. Não é aplicativo de alerta à população nem sistema de emergência. É registro e gestão operacional: a ferramenta que organiza e comprova o trabalho da equipe.

## Usuários que o protótipo mostra
- Coordenador: prioriza, distribui, acompanha fila, prazos, mapa e pendências.
- Operador ou plantonista: registra chamados e faz a triagem.
- Agente de campo: recebe a tarefa no celular, vistoria offline, coleta evidências.
- Apenas citar na documentação, sem tela própria: técnico responsável, órgão parceiro, gestor e auditor, cidadão.

## A história que a demo conta (fio condutor de todas as telas)
1. Chamado entra: rachadura em encosta após chuva forte, com moradora idosa no imóvel.
2. Operador registra; o sistema aponta possível duplicidade com um chamado do mesmo endereço; triagem classifica gravidade alta e vulnerabilidade presente.
3. Coordenador despacha para a equipe Alfa com prazo de 24 horas.
4. O agente, SEM SINAL, faz a vistoria completa: checklist, cinco fotos, GPS com precisão exibida, assinatura da moradora.
5. O sinal volta, a fila sincroniza item a item, nada se perde e nada duplica.
6. O sistema gera o relatório de vistoria com aparência de documento oficial e um termo de interdição parcial.
7. Providência encaminhada à Secretaria de Obras com prazo; o painel mostra a pendência e o vencimento.
8. Encerramento com motivo obrigatório e linha do tempo completa: quem fez o quê, quando.

## Tipos de ocorrência para os dados mock (nomes reais da COBRADE)
Deslizamento, inundação, alagamento, enxurrada, vendaval, granizo, colapso de edificação, incêndio urbano. Prioridades: baixa, média, alta, crítica.

## Normas que PODEM ser citadas na documentação (nenhuma outra)
- Lei 12.608/2012 (Política Nacional de Proteção e Defesa Civil), alterada pela Lei 14.750/2023
- Lei 13.709/2018 (LGPD)
- Lei 14.133/2021 (licitações e contratos administrativos)
- Lei Complementar 182/2021 (Marco Legal das Startups, CPSI)
- Lei 14.129/2021 (Governo Digital)
- Lei 13.146/2015, artigo 63 (acessibilidade digital)
- COBRADE (Codificação Brasileira de Desastres)

## Decisões já tomadas (não reabrir na Fase 0)
- Produto real, apenas em fase futura: React no web, React Native com Expo nos apps, PostgreSQL com RLS, hospedagem em região Brasil. Nada disso entra no protótipo.
- O protótipo é descartável e em HTML puro.
- Público-alvo inicial: município médio com Defesa Civil atuante ou consórcio intermunicipal.

## Condições da apresentação (assumir o pior caso)
O local e o equipamento da demonstração ainda não estão definidos. Empacote assumindo máquina desconhecida, sem internet e projetor de baixa qualidade. Consequências: zip único, abre com duplo clique, fontes generosas, contraste alto, e roteiro de vídeo de demonstração como plano B.

## Critério de sucesso da Fase 0
Demonstrar para pelo menos três Defesas Civis; o coordenador reconhecer o fluxo como o dele sem precisar de explicação longa; obter pelo menos duas manifestações formais de interesse (carta de intenção ou disposição a piloto pago).
