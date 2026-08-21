# Roteiro de demonstração, 10 minutos

Roteiro cronometrado para conduzir a demo do início ao fim. Qualquer pessoa que leia isto consegue apresentar, mesmo sem ter construído o protótipo.

**Antes de começar:** abra `index.html`, entre como **Coordenador** (qualquer usuário e senha funcionam, ou use o link "Entrar direto"), e deixe a tela do Painel aberta. Se tiver mexido no protótipo antes, clique no ícone de recarregar no topo (Reiniciar demonstração) para voltar ao estado inicial.

**A ocorrência âncora da história é a 000482/2026**: rachadura em encosta, Rua das Acácias 245, com moradora idosa no imóvel.

---

## Minuto 0 a 1: Abertura

**Fala de abertura, palavra por palavra se quiser:**

> "Antes de mostrar a tela, queria confirmar uma coisa com vocês. Hoje, quando entra um chamado de risco aqui, como é que ele é registrado? E depois que o agente vai na rua, como é que aquilo vira documento?"

Deixe a pessoa responder. **Anote a resposta.** O objetivo real desta reunião é essa informação, não a demonstração.

Depois:

> "O que eu vou mostrar é um protótipo de validação, não um sistema pronto à venda. Ele existe pra eu confirmar se o fluxo que eu desenhei bate com o de vocês. Se em algum ponto não bater, me interrompe, que é exatamente isso que eu vim buscar."

---

## Minuto 1 a 2: O painel do coordenador

Mostre a tela do Painel.

Aponte, nesta ordem:
- Os quatro indicadores no topo: total na fila, em campo, **atrasadas**, **críticas ativas**.
- A fila ordenada por prioridade: o que está atrasado sobe.
- Os selos: severidade, vulnerabilidade, prazo.

> "A primeira coisa que o coordenador vê de manhã é o que estourou o prazo e o que é crítico. Não é uma lista cronológica, é uma lista por urgência."

Clique no **sino de notificações** no topo, mostrando as ocorrências que precisam de atenção.

---

## Minuto 2 a 3,5: A entrada do chamado e a duplicidade

Troque o perfil para **Operador** (seletor no topo).

Na tela "Abrir ocorrência", preencha:
- Solicitante: um nome qualquer
- Canal: Telefone
- **Endereço: comece a digitar `Rua das Acácias, 245`**

> "Repara aqui."

O aviso de possível duplicidade aparece, mostrando o chamado anterior do mesmo endereço.

> "Esse endereço já teve chamado. O sistema não decide por você: ele mostra o chamado anterior e pergunta se é o mesmo caso ou um novo. Isso evita duas equipes indo no mesmo lugar."

Vá para a aba **Triagem**, classifique gravidade **Alta** e marque **vulnerabilidade presente**.

> "Aqui é onde entra o que o sistema chama de vulnerabilidade: idoso, criança, mobilidade reduzida. Isso muda a prioridade na fila do coordenador."

---

## Minuto 3,5 a 4,5: O despacho

Volte para o perfil **Coordenador**. No painel, clique no filtro **"Em triagem"** e abra a ocorrência **000488/2026** (Deslizamento, Alameda das Grevíleas, 60).

> "Essa aqui já passou pela triagem e está esperando equipe."

Mostre o bloco "Despachar para equipe": escolha a **Equipe Alfa**, prazo de 24 horas, e despache.

> "A partir de agora o prazo corre, e a ocorrência aparece no celular do agente."

**Por que não a 000482:** ela já vem despachada na carga inicial (é a que o agente vai vistoriar no próximo passo), então o bloco de despacho não aparece nela. Se quiser despachar a que você acabou de criar na triagem, ela também está nesse mesmo filtro, com o protocolo mais alto da lista.

---

## Minuto 4,5 a 7: o momento decisivo, a vistoria sem sinal

**Esta é a parte que decide a reunião. Não corra.**

Troque o perfil para **Agente de campo**. A tela vira uma moldura de celular.

Aponte a barra de status do celular, no topo: está escrito **Online**.

> "O agente chegou no local. E aqui é onde a coisa complica de verdade: área de risco, encosta, e o sinal cai."

Clique em **"Simular perda de sinal"**.

> "Perdeu o sinal. Agora repara que o app não travou."

A faixa fica vermelha: "Sem sinal, salvando neste aparelho". Abra a tarefa **000482/2026** (Deslizamento, Rua das Acácias, a da moradora idosa) e execute a vistoria inteira:

1. Marque todos os itens do **checklist**
2. **Capture uma foto** (ou duas)
3. **Capture o GPS**, mostre a precisão melhorando em etapas até estabilizar
4. **Assine** no campo de assinatura, arrastando o mouse
5. Preencha o nome de quem assina
6. **Conclua a vistoria**

Volte para a lista de tarefas.

> "Olha a fila aqui embaixo."

Aponte a lista: checklist preenchido, foto capturada, GPS capturado, assinatura coletada, vistoria concluída. Todos marcados como **Pendente**.

> "Tudo isso foi feito sem sinal nenhum. Está guardado no aparelho. Nada foi perdido e nada foi enviado ainda."

Agora clique em **"Reconectar"**.

**Pare de falar e deixe a animação rodar.** Os itens vão de Pendente para Enviando para Enviado, um a um.

> "Sincronizou item a item. E se o sinal cair no meio disso, ele para onde estava e retoma depois, sem duplicar nada."

---

## Minuto 7 a 8,5: O documento

Volte para o perfil **Coordenador** e clique em **Painel** na barra lateral (ao trocar de perfil o sistema volta para a última tela que você usava, que era o detalhe da ocorrência anterior).

**Clique no chip "Todas"** para limpar o filtro "Em triagem" que ficou ativo lá do minuto 3,5. Sem isso, a busca não encontra nada, porque ela procura dentro do filtro de status selecionado.

Agora, na busca do topo, digite `000479` e abra a ocorrência **000479/2026** (essa já tem vistoria concluída na carga inicial, então o documento está pronto na hora).

No bloco "Documentos oficiais", clique em **Relatório de vistoria**.

> "Isso aqui é o que sai do sistema. Não é alguém redigitando depois."

Aponte:
- Brasão e identificação do órgão
- Protocolo e versão do documento
- O checklist respondido, item a item
- As fotos com legenda, horário e coordenada
- Autoria com nome e matrícula
- O QR de validação no rodapé

Clique em **Imprimir** e mostre a pré-visualização: só o documento, sem menu, sem botão, com a marca d'água preservada.

Feche a pré-visualização, volte, e abra o **Termo de interdição parcial**.

> "Mesma identidade, mesma origem de dados, com a fundamentação e as três assinaturas."

---

## Minuto 8,5 a 9,5: Fechar o ciclo

Volte à ocorrência. Mostre o bloco **Encaminhar providência**: Secretaria de Obras, o que precisa ser feito, responsável, prazo. Encaminhe.

Mostre a **linha do tempo**, agora completa.

> "Cada evento aqui tem quem fez, o papel da pessoa, quando, e se foi do escritório ou do campo. Quando o Ministério Público ou o Tribunal de Contas perguntar o que foi feito naquele endereço, a resposta é essa tela."

Aponte especificamente o evento de vistoria, que mostra as duas marcas de tempo (coletada offline às X, sincronizada às Y).

---

## Minuto 9,5 a 10: Fechamento

> "É isso. Duas perguntas pra vocês: primeiro, esse fluxo é o de vocês, ou tem alguma etapa que eu errei? Segundo, quantas ocorrências vocês registram por mês, mais ou menos?"

**Anote as duas respostas.** Esse é o resultado da reunião.

Se a conversa for bem, a pergunta final é:

> "Se isso existisse de verdade, qual seria o caminho aqui dentro pra uma prefeitura contratar uma coisa assim? Vocês já fizeram algo parecido?"

---

## Perguntas prováveis, com resposta pronta

**"Quando fica pronto? Quanto tempo?"**
> "Não tenho data pra dar, e prefiro não chutar. Hoje isso é um protótipo de validação, e o que define o cronograma é justamente essa conversa. Se o fluxo se confirmar com vocês e com mais alguns municípios, aí eu consigo falar de prazo com responsabilidade."

**"Quanto custa?"**
> "Não tem preço definido nessa fase, e eu não vou inventar um número aqui. O que eu preciso entender primeiro é o volume de vocês e o que dá mais trabalho hoje. Preço sem isso é chute."

**"Já tem alguém usando?"**
> "Não. Vocês estão vendo isso numa fase bem inicial, de propósito: é mais barato pra todo mundo corrigir o desenho agora do que depois de construído."

**"A gente já tem um sistema, como se compara?"**
> "Depende muito do que ele faz. Me conta: ele cobre a vistoria em campo? Funciona sem internet? Gera o laudo pronto?" (Deixe a pessoa falar. Se o sistema atual cobrir tudo, isso é informação valiosa e a resposta honesta é reconhecer.)

**"Isso manda pro S2ID? Substitui o S2ID?"**
> "Não. O S2ID é o sistema federal de reconhecimento de desastre. Isso aqui é a operação do dia a dia de vocês. A ideia é que os dados fiquem organizados de um jeito que facilite alimentar o S2ID, mas ele não substitui nem integra automaticamente."

**"E se a internet cair de vez? E se o celular quebrar?"**
> "Sem internet, o app continua funcionando e guarda tudo no aparelho, como vocês viram. Celular quebrado com dado não sincronizado é uma perda real, e é por isso que a sincronização automática assim que o sinal volta importa tanto."

**"Funciona no celular que a gente já tem?"**
> "Essa é uma pergunta que eu preciso responder com o modelo real de vocês, não de improviso. Quais celulares os agentes usam hoje?"

**"Quem é o responsável pelos dados? E a LGPD?"**
> "O dado operacional é do órgão, não meu. Sobre a LGPD, o desenho considera finalidade declarada, acesso restrito por perfil e trilha de auditoria. Mas eu não vou dar parecer jurídico aqui: isso é assunto pro jurídico de vocês olhar quando chegar a hora."

---

## Se algo der errado durante a demo

- **Travou ou ficou estranho:** clique no ícone de recarregar no topo (Reiniciar demonstração). Volta tudo ao estado inicial sem recarregar a página.
- **Perdeu a ocorrência âncora:** use a busca no topo (ou Ctrl+K) e digite `000482`.
- **A sincronização não aparece:** confirme que você clicou em "Simular perda de sinal" **antes** de fazer a vistoria. A fila só enche com o que foi feito offline.
- **O documento não abre:** só existe depois que a vistoria foi concluída. Use a ocorrência 000479/2026, que já vem com vistoria pronta.
- **Nada funciona:** siga o plano B em `docs/ROTEIRO_VIDEO.md`.
