# Política de privacidade do Defesa Civil Operacional 360

- **Versão:** 1, de 09/09/2026
- **Situação:** redigida, **ainda não publicada**. Publicar é requisito das duas
  lojas de aplicativo e do contrato com o município.

> **Campos que dependem de decisão do Rafa e que EU NÃO POSSO PREENCHER.**
> Estão marcados como `[[assim]]` no texto. São razão social, CNPJ, endereço,
> nome e contato do encarregado, e o endereço definitivo de publicação. Inventar
> qualquer um deles produziria um documento jurídico falso, que é pior que um
> documento faltando. Enquanto houver `[[ ]]` no arquivo, ele não vai para o ar.

---

## 1. Quem é quem

A Lei 13.709/2018 (LGPD) separa dois papéis, e a separação decide quem responde
por quê. Neste produto ela é limpa:

| Papel | Quem é | O que decide |
| --- | --- | --- |
| **Controlador** | O município, pelo seu órgão de proteção e defesa civil | Por que os dados são tratados, quais são coletados, quem acessa, por quanto tempo ficam |
| **Operador** | `[[razão social]]`, CNPJ `[[CNPJ]]` | Trata os dados **exclusivamente** conforme instrução do município, e não os usa para finalidade própria |

O município é o controlador porque o tratamento decorre da competência dele:
atender chamado de risco, vistoriar, interditar, encaminhar providência. Nada
disso é escolha do fornecedor.

**O fornecedor não usa esses dados para nada além de operar o sistema para o
município que os gerou.** Não vende, não cede, não usa para treinar modelo, não
usa para publicidade, não cruza dado de um município com dado de outro, e não
gera relatório para terceiro.

**Encarregado pelo tratamento de dados pessoais (DPO):**
`[[nome]]`, `[[email]]`, `[[telefone]]`.
O encarregado atende tanto o titular quanto a autoridade nacional, e o município
mantém o próprio encarregado, que é o interlocutor primeiro do cidadão.

---

## 2. Que dados o sistema trata

### 2.1 Do cidadão que aciona a Defesa Civil

| Dado | Por que existe | Sem ele, o que quebra |
| --- | --- | --- |
| Nome | Identificar quem relatou, para retorno e para o laudo | O órgão não sabe com quem falou |
| Telefone ou contato | Retornar sobre o chamado, avisar de vistoria e de interdição | Ninguém consegue avisar a família de que a casa foi interditada |
| Endereço do imóvel | É o objeto do atendimento | Não há o que vistoriar |
| Coordenada geográfica | Achar o imóvel no morro, onde numeração muitas vezes não existe | A equipe não chega |
| Relato | O que a pessoa disse que aconteceu | A triagem não classifica |
| Descrição de vulnerabilidade social, quando houver | Priorizar quem corre mais risco: criança, idoso, pessoa com deficiência, gestante | A priorização vira ordem de chegada |
| Fotografias do imóvel | Prova técnica que sustenta o laudo e o ato de interdição | O laudo vira palavra contra palavra |
| Assinatura de quem estava no local | Prova de que a pessoa foi cientificada da interdição | O ato administrativo fica sem ciência comprovada |
| Contagem de pessoas atingidas | Dimensionar abrigo e assistência | O município não sabe quantas vagas precisa |

**A descrição de vulnerabilidade social é dado sensível** na acepção da LGPD
sempre que revelar condição de saúde ou deficiência. Ela é tratada com três
restrições próprias, e as três já estão no produto ou entram nesta onda:

1. Não aparece em nenhuma lista, nenhum resumo, nenhum cartão de apoio e nenhum
   documento que não seja o laudo da própria ocorrência.
2. Não sai por exportação de nível básico, que é o padrão. O nível que a leva
   exige a conta de administrador do município, justificativa escrita, um teto
   de linhas, e deixa registro em dois lugares.
3. Todo acesso a ela é registrado: abrir o dossiê da ocorrência e emitir o laudo
   gravam quem leu, quando e com que finalidade. O registro guarda o acesso e
   nunca o conteúdo lido, porque um registro que copiasse o dado sensível seria
   uma segunda cópia dele, com a mesma exposição e sem a mesma retenção.

### 2.2 Do servidor público que usa o sistema

Nome, matrícula, email institucional, papel, equipe, e o registro do que ele
fez: cada ato administrativo relevante fica na trilha de auditoria com autor,
data e hora.

**Isso é intencional e não é opcional.** Quem assina laudo e quem determina
interdição responde pelo ato, e a trilha é o que permite ao próprio servidor
provar o que fez e quando. Por isso usuário **não se apaga**: se desativa. Um
usuário apagado deixaria laudos assinados por ninguém.

### 2.3 Do aparelho de campo

Identificador do aparelho e ficha de notificação, para a mensagem de prazo
chegar ao agente certo. Revogados no encerramento da sessão.

### 2.4 O que o sistema NÃO coleta

Sem rastreamento de publicidade. Sem identificador de propaganda. Sem análise de
comportamento. Sem localização em segundo plano: a coordenada é lida no momento
da vistoria, com o aplicativo aberto, e serve para carimbar aquela vistoria.
Sem cookie de terceiro no painel. Sem acesso a contatos, agenda, microfone ou
biblioteca de fotos além da fotografia que o agente tira na hora.

---

## 3. Com quem os dados são compartilhados

**Com ninguém, fora dos operadores de infraestrutura listados em
`SUBPROCESSADORES.md`.** Aquele documento nomeia cada empresa, o que ela
processa, onde ficam os servidores e por quê.

Dois esclarecimentos que a declaração das lojas precisa refletir:

- Os dados **saem do aparelho** e vão para servidor operado pelo fornecedor em
  nome do município. É por isso que a declaração de loja não pode dizer "não
  compartilha com terceiros" sem qualificação.
- Compartilhamento com **outro órgão** (bombeiros, assistência social, obras)
  acontece por ato do município, quando a vistoria indica acionamento. Nesse
  caso sai o **número do ofício e um endereço de uso único**, e não o dado em
  si: quem abre o link fica registrado, e o link expira. O dado sensível não
  viaja por email.

---

## 4. Por quanto tempo os dados ficam

O ato administrativo é permanente; o dado pessoal, não. A regra é a
**minimização por prazo**, e ela é executada por uma varredura do próprio
sistema, de hora em hora, não por lembrete:

| O que | Prazo | O que acontece no fim |
| --- | --- | --- |
| Nome e contato do solicitante | `[[prazo definido pelo município]]`, contado do encerramento da ocorrência | Viram marcador de "removido por prazo". Protocolo, endereço, fatos, laudo e trilha permanecem |
| Descrição de vulnerabilidade social | `[[prazo definido pelo município]]`, nunca maior que o anterior | Idem. Quando o município fixa só o primeiro prazo, a descrição sai junto com o nome, nunca depois |
| Fotografias | `[[prazo definido pelo município]]` | **Previsto, ainda não implantado.** Hoje elas permanecem. Ver a seção 6 |
| Protocolo, endereço, tipo, severidade, decisão técnica, trilha | Permanente | Nada. É o registro do ato |
| Registro de quem acessou e de quem exportou | Permanente | Nada. É prova de acesso, e prova de acesso não se descarta junto com o dado que ela protege |
| Conta de servidor público desativada | Permanente | Nada. Ele assina laudo e aparece na trilha |

**Por que o endereço fica e o nome sai:** o endereço é atributo do imóvel
vistoriado e do ato praticado sobre ele; o nome é atributo da pessoa que ligou.
Manter o segundo depois que ele deixou de ser necessário é acúmulo sem
finalidade, que é exatamente o que a lei manda evitar.

**Marcador, e não campo vazio.** O nome é substituído pelo texto "removido por
prazo", e não apagado para nulo. Um campo vazio não distingue "nunca teve nome"
de "o nome foi descartado no prazo", e é o segundo que o município precisa
conseguir demonstrar numa fiscalização. Cada remoção também entra na trilha da
própria ocorrência, dizendo em que dia aconteceu e quais campos saíram, porque
sem isso minimização e perda de dado seriam indistinguíveis.

**O relógio começa no encerramento**, e não na abertura. Enquanto o atendimento
corre, o nome e o contato continuam necessários: é por eles que o órgão avisa a
família da vistoria e da interdição. A consequência, dita porque é real: uma
ocorrência que nunca é encerrada mantém o dado do solicitante indefinidamente.

**Município que ainda não fixou o prazo não perde nada.** O sistema não traz
número de fábrica: enquanto o município não decidir, a varredura simplesmente
pula as ocorrências dele. Quem fixa é a conta de administrador do município, e a
mudança fica na trilha administrativa com o valor anterior e o novo.

**O que não é minimizado, e por quê:**

- **Registro de acesso e registro de exportação** (quem leu, quem exportou, com
  que finalidade, de qual endereço de rede). São a prova de que o dado circulou,
  e é justamente ela que responde ao titular com quem os dados dele foram
  compartilhados. Descartá-la junto com o nome apagaria a testemunha.
- **Observações escritas no ofício encaminhado a outro órgão.** O ofício é
  documento oficial numerado, e o órgão destinatário tem cópia dele. Alterar o
  nosso lado não alteraria o dele: faria as duas versões divergirem. Por isso
  vale a orientação operacional: **não escrever nome de cidadão no campo de
  observações do ofício**, porque ali ele é permanente.
- **Nome de quem assinou a ciência da interdição.** É a prova de que a pessoa
  foi cientificada do ato administrativo, e faz parte do ato.

O prazo é decisão do município, porque ele é o controlador. O fornecedor entrega
o mecanismo, não o número.

---

## 5. Direitos do titular

O cidadão pode pedir ao município: confirmação de que existe tratamento, acesso
aos dados, correção do que estiver errado, anonimização ou eliminação do que for
desnecessário ou excessivo, informação sobre com quem foi compartilhado, e
revisão de decisão automatizada.

Duas coisas ditas com todas as letras, porque a alternativa é criar expectativa
falsa:

- **O sistema não toma decisão automatizada sobre pessoas.** Severidade,
  interdição e prioridade são decisão humana de servidor identificado, e a
  trilha diz quem decidiu.
- **Eliminação tem limite legal.** O que sustenta ato administrativo (o laudo, a
  interdição, a trilha) não pode ser eliminado a pedido, porque cumprir
  obrigação legal e exercer competência pública são bases próprias de
  tratamento. O que pode sair é o dado pessoal que já não é necessário, e é
  disso que trata a seção 4.

Para exercer: procure o município (controlador). O encarregado do fornecedor,
nomeado na seção 1, apoia o município no atendimento.

---

## 6. Segurança

O que está implementado hoje, sem promessa de futuro:

- **Isolamento entre municípios no banco**, com segurança em nível de linha
  ativada e forçada em toda tabela de negócio, e papel de aplicação que não é
  dono nem superusuário. O município vem sempre do token verificado, nunca de
  parâmetro de requisição. Recurso de outro município responde "não existe".
- **Trilha de auditoria que não se reescreve**, por ausência de permissão de
  alteração e de remoção no próprio banco. Correção entra como evento novo.
- **Senha guardada com derivação de chave de custo alto**, nunca em texto.
- **Conexão com o banco cifrada e com a autoridade certificadora conferida.**
  A afirmação depende de um parâmetro na string de conexão
  (`sslmode=verify-full`), e por isso ela deixou de ser só uma promessa
  escrita: desde 09/09/2026 a partida em produção **recusa subir** com uma
  `DATABASE_URL` que não peça verificação. Antes disso, a URL colada do
  painel do provedor, que não traz o parâmetro, fazia a conexão subir
  cifrada e **não autenticada**, em silêncio, e este documento continuava
  afirmando o contrário.
- **Fotografia entregue por endereço temporário e assinado**, não por link
  público.
- **Teto de tentativas** de autenticação, e a conta trava depois de insistência.
- **Segunda etapa de autenticação para quem administra o município**, com o
  código de seis dígitos do aplicativo de autenticação (não por SMS, que é
  interceptável por troca de chip e depende da operadora justamente no dia do
  temporal). O segredo dessa segunda etapa é guardado **cifrado**, com chave
  que vive fora do banco, então um vazamento do banco não a leva junto; o
  código usado não vale uma segunda vez; e o teto de tentativas dela é
  separado do teto da senha. Quem perde o telefone entra pelos códigos de
  recuperação, entregues uma única vez e guardados só como resumo. Ligar e
  desligar ficam na trilha administrativa, e desligar exige a senha atual.
  Cada município decide se a exige, na configuração do servidor.
- **Controle de acesso conferido no servidor antes de tocar no banco.** Esconder
  o botão na tela não é controle de acesso.
- **O segredo que assina a sessão pode ser trocado sem derrubar quem está em
  campo.** O servidor aceita uma lista de segredos: assina sempre com o
  primeiro e aceita qualquer um dela na verificação. Rotacionar é acrescentar o
  novo na frente, esperar os tokens antigos vencerem (quinze minutos no padrão,
  uma hora no teto configurável)
  e tirar o velho. Isso importa porque a alternativa era não rotacionar nunca:
  a troca derrubava toda sessão aberta no instante em que o processo reiniciava,
  o que num município significa derrubar o plantão no meio de um temporal.
  **O caso do vazamento é o oposto e está previsto:** segredo comprometido sai
  da lista na hora, e aí derrubar todo mundo é o comportamento certo, porque
  quem tem o segredo fabrica sessão de administrador enquanto ele valer.
- **Registro de quem leu dado de cidadão**, gravado na mesma transação da
  leitura: quem, quando, qual recurso e com que finalidade. Ele registra o
  acesso e nunca o conteúdo lido, e não se altera nem se apaga, pelo mesmo
  mecanismo da trilha.
- **Minimização por prazo executada pelo sistema**, com a decisão do prazo na
  mão do município e cada remoção registrada na trilha da ocorrência.
- **Exportação em dois níveis**, com o nível sem dados pessoais como padrão.

O que **ainda não** está pronto, dito aqui porque omitir seria enganar:

- **Calendário** de rotação do segredo de sessão: o mecanismo existe (seção
  acima), mas quem decide a data ainda é uma pessoa, e não um lembrete do
  sistema.
- Registro separado de evento de segurança com alerta: previsto, não implantado.
- **Descarte de fotografia por prazo: previsto, não implantado.** Remover uma
  foto exige apagar o arquivo no armazenamento, que é outro sistema e falha de
  outro jeito (o arquivo some e o registro fica, ou o contrário). Até isso
  entrar, a fotografia de vistoria permanece, e a seção 4 diz isso com todas as
  letras em vez de descrever como se já funcionasse.
- **A listagem da fila de ocorrências ainda não gera registro de acesso.** O
  registro cobre o dossiê e os documentos oficiais, que são onde o dado pessoal
  se concentra. A listagem do painel, recarregada o dia inteiro por todo mundo,
  ficou de fora por volume, e ela ainda devolve nome e contato junto: estreitar
  as colunas dela é o passo que falta.

## 7. Incidente

Havendo incidente de segurança com risco relevante, o fornecedor comunica o
município em até **24 horas** da detecção, com o que se sabe até ali, e não
espera investigação concluída para avisar. O município, como controlador,
comunica a autoridade nacional e os titulares. O procedimento operacional está
em `INDISPONIBILIDADE.md`.

## 8. Menores

Crianças e adolescentes aparecem como pessoas atingidas em ocorrência, e a
presença delas é justamente o que faz uma ocorrência subir de prioridade. O
tratamento é feito no melhor interesse delas, é limitado ao necessário para o
atendimento, e a descrição correspondente segue as três restrições da seção 2.1.
O sistema não é dirigido a menores e não tem cadastro de menor como usuário.

## 9. Alterações

Mudança nesta política é comunicada ao município com antecedência, e a versão
com data fica registrada. O histórico vive no repositório do produto, então toda
alteração tem autor e data.

## 10. Contato

Encarregado: `[[nome]]`, `[[email]]`.
Operador: `[[razão social]]`, `[[endereço]]`.
Controlador: o órgão municipal de proteção e defesa civil que opera o sistema.

---

## Pendências desta política, para não passarem em branco

1. Preencher os `[[ ]]`. Enquanto houver um, não publica.
2. Publicar num endereço estável e público, e apontar as duas lojas para ele.
   O painel serve arquivo estático, então a rota pode sair dele.
3. O município precisa fixar os prazos da seção 4. O mecanismo está pronto e a
   conta de administrador do município já configura os dois primeiros no
   sistema; enquanto não configurar, nada é removido. O terceiro (fotografia)
   depende do descarte no armazenamento, que ainda não existe.
4. Rever quando entrarem: notificação por push, envio de ofício por email,
   console do fornecedor e mapa do Google. Os quatro mudam esta política.
