# Roteiro de implantação e treinamento

- **Versão:** 1, de 09/09/2026

O produto pode estar certo e a implantação fracassar, e o motivo quase nunca é
técnico: é o agente que não confia no aplicativo depois que ele engoliu uma
vistoria, e é o coordenador que volta para a planilha porque a planilha ele já
sabe usar.

Este roteiro é escrito contra esses dois riscos.

---

## 1. Antes de qualquer tela

Nada disto é software, e tudo isto trava a implantação se ficar para depois.

| O que | Quem decide | Sem isso |
| --- | --- | --- |
| Os três prazos de retenção da seção 4 da política de privacidade | Município | A minimização não tem número para executar |
| Encarregado de dados do município | Município | O cidadão não tem a quem pedir seus direitos |
| Aceitar ou recusar o envio de coordenada ao Google, no mapa | Município | O mapa não pode ser ligado |
| Quem é o administrador do município | Município | Não há a quem entregar o primeiro acesso |
| Equipes, e quem está em cada uma | Município | Despacho não tem para quem despachar |
| Prazos por severidade | Município | O relógio de atraso não tem base |
| Lista de órgãos para acionamento | Município | O checklist trava justamente sem sinal |
| Aparelhos: quantos, de quem, iOS ou Android | Município | Não dá para preparar a instalação |

**Reunião única, com o coordenador e o administrador na sala, e uma ata.** Cada
linha acima vira uma decisão registrada. Implantação que começa com "isso a
gente resolve depois" chega no primeiro temporal com isso não resolvido.

---

## 2. Sequência

| Etapa | O que acontece | Duração |
| --- | --- | --- |
| 1 | Provisionamento do município e do primeiro administrador, por linha de comando. A senha inicial é impressa **uma vez** e entregue em mãos | 1 hora |
| 2 | O administrador cria equipes e usuários. Cada um troca a senha no primeiro acesso | 2 horas |
| 3 | Cadastro dos prazos por severidade e da lista de órgãos | 1 hora |
| 4 | Instalação do aplicativo nos aparelhos, e primeiro acesso de cada agente **com sinal**, para baixar a lista | 30 minutos por aparelho |
| 5 | **Operação assistida:** duas semanas com os dois sistemas em paralelo, o novo e o que existia | 2 semanas |
| 6 | Corte, com o antigo em modo de leitura por mais 30 dias | 1 dia |

A etapa 5 é a que não se corta. Ela existe para que o primeiro defeito real seja
descoberto **com rede de segurança**, e não com uma família esperando vistoria.

---

## 3. Treinamento por perfil

O treinamento é curto de propósito. Treinamento longo em prefeitura não é
assistido: o pessoal é chamado no meio.

### 3.1 Agente de campo, 40 minutos, no aparelho dele

O agente aprende sete coisas, nesta ordem, fazendo:

1. Entrar, e **baixar a lista antes de subir o morro**. Esta é a lição número
   um: o que não foi baixado não existe lá em cima.
2. Abrir uma tarefa e ler o cabeçalho: endereço, referência, relato, prazo.
3. **Abrir no aplicativo de mapas** para chegar no imóvel.
4. Preencher a vistoria: checklist, fotografia, contagem de pessoas.
5. **Colher a assinatura** de quem estava no local, e por que ela importa: é a
   prova de que a pessoa foi cientificada.
6. Concluir **sem sinal**, e ver o item entrar na fila. Depois ligar o sinal e
   ver a fila esvaziar.
7. "Salvar e sair" no meio de uma vistoria, e voltar depois, para saber que o
   trabalho não se perde.

**O exercício 6 é o coração do treinamento e é feito com o modo avião ligado, de
verdade.** O agente precisa ver com os próprios olhos que a vistoria não sumiu.
Quem não vê isso não confia, e quem não confia anota no papel "por garantia", e
aí existem dois sistemas.

Ele também sai sabendo três coisas que evitam chamado de suporte:

- Tarefa que sumiu da lista tem explicação, e o aplicativo diz qual.
- Ocorrência já coletada neste aparelho mostra aviso, e refazer é ato
  deliberado.
- Espera que passa de seis segundos avisa e oferece saída.

### 3.2 Operador de plantão, 30 minutos

1. Registrar chamado com a pessoa na linha, sem travar na conversa.
2. Reconhecer **duplicidade**: o sistema avisa quando já existe ocorrência no
   mesmo endereço, e o operador decide se é a mesma.
3. Preencher vulnerabilidade social quando houver, e **por que ela muda a
   prioridade**.
4. O que fazer quando falta informação: registrar com o que tem, porque
   protocolo aberto vale mais que formulário perfeito.

### 3.3 Coordenador, 1 hora

1. Painel: o que cada número significa, e o que é "atrasada".
2. Triagem: classificar tipo pela COBRADE e severidade, e o efeito no prazo.
3. Despachar para equipe, e acompanhar.
4. Ler o laudo que voltou e decidir: providência, interdição, encerramento.
5. **Encerrar com motivo**, e por que não existe apagar.
6. Emitir laudo e termo, imprimir, assinar.
7. Trilha de auditoria: onde ver quem fez o quê. É o que protege o próprio
   coordenador quando o ato for questionado.

### 3.4 Administrador, 30 minutos, além do treinamento de coordenador

1. Criar, desativar e trocar papel de usuário, e o limite: ninguém administra
   posto acima do seu.
2. Redefinir a senha de quem esqueceu, e que isso **derruba as sessões** da
   pessoa.
3. Alterar dados do órgão.
4. O que **não** dá para fazer pela tela, e por quê: provisionar município e
   apagar registro.

---

## 4. O que entregar por escrito

| Peça | Para quem | Estado |
| --- | --- | --- |
| Cartão de bolso do agente, uma página, plastificado | Agente | `CARTAO-DO-AGENTE.md` |
| Guia do coordenador | Coordenador | `GUIA-DO-COORDENADOR.md` |
| Política de privacidade | Município | `PRIVACIDADE.md`, com campos a preencher |
| Lista de subprocessadores | Município | `SUBPROCESSADORES.md` |
| Procedimento de indisponibilidade e contatos | Município | `INDISPONIBILIDADE.md` |
| Plano de saída | Município | `SAIDA-DE-MUNICIPIO.md` |
| Ata das decisões da seção 1 | Ambos | Feita na reunião |

O cartão de bolso do agente é o item de maior retorno da lista e o mais barato
de fazer: uma página, os sete passos da seção 3.1, e a frase "baixe a lista
antes de subir". Escrito em `CARTAO-DO-AGENTE.md`; falta a diagramação para
impressão e os contatos de suporte.

---

## 5. Como saber se deu certo

Medido na terceira semana, já depois do corte:

| Sinal | Meta | O que significa se falhar |
| --- | --- | --- |
| Vistorias registradas no sistema, sobre o total atendido | Acima de 90% | Existem dois sistemas, e o de papel venceu |
| Vistorias com assinatura coletada | Acima de 80% | O passo é ignorado, e os laudos saem sem ciência |
| Vistorias com fotografia | Acima de 95% | A prova técnica não está sendo feita |
| Chamados de suporte por semana | Abaixo de 5 | O treinamento não pegou, ou há defeito real |
| Ocorrências encerradas sem motivo útil | Zero | O campo virou formalidade, e a trilha perdeu valor |

**Esses números precisam sair do próprio sistema**, e não de pergunta ao
coordenador. Hoje eles saem de consulta ao banco. É exatamente para isso que
serve a tabela de métricas da ADR 0008.
