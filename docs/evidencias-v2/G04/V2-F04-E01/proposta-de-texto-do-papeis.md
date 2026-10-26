# Texto proposto para `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md` (V2-F04-E01)

Este arquivo NÃO altera o PAPEIS. Ele traz a seção que a consolidação da F04
(parte 6B do plano) acrescenta ao documento, depois de "Pessoa, conta e vínculo
(proposta da ADR 0009, ainda não no código)" e antes de "As três divergências
não decididas". O texto descreve a proposta da ADR 0010; se ela mudar até o
aceite (H116), este texto muda junto.

O texto abaixo da linha é o que entra, palavra por palavra.

---

## O órgão dentro do município (proposta da ADR 0010, ainda não no código)

Esta seção, como a anterior, descreve o que VAI existir: é a proposta da
`docs/adr/0010-isolamento-por-orgao.md`, que espera o aceite do Rafael e é
construída na F04. Hoje nenhum órgão entra no sistema: a providência sai por
ofício e a resposta volta por telefone.

- **O órgão é parte do município.** Obras, Saúde, a concessionária de energia e
  os bombeiros são órgãos DENTRO de um município. Um órgão que atende vários
  municípios existe uma vez em cada um, e quem trabalha nele vê um município
  de cada vez.
- **O órgão vê o encaminhamento, nunca a ocorrência.** A Defesa Civil escolhe o
  que o órgão precisa saber (no mínimo o protocolo, o tipo e o endereço) e
  envia isso como um retrato fixo, o dossiê. Nome de quem pediu, contato,
  vulnerabilidade e a descrição livre só vão quando a Defesa Civil marca o
  campo e escreve por quê. O órgão não abre a ocorrência, as fotos da vistoria
  nem a trilha.
- **Um órgão não vê o outro.** A Obras não vê o que foi para a Saúde, nem sabe
  que existe. Quem procura um encaminhamento de outro órgão recebe "não
  encontrado", o mesmo de quando ele não existe, e nunca "sem permissão".
- **Quem faz o quê no órgão:** o leitor só lê; o executor aceita, responde,
  devolve antes de aceitar e pede esclarecimento; o gestor faz tudo isso e
  indica quem do órgão cuida de cada item. Depois de aceitar, o órgão não
  devolve: pede esclarecimento.
- **A Defesa Civil decide o fluxo.** Só a coordenação e o administrador
  encaminham, cancelam, concluem, pedem complemento, mudam prazo e prioridade e
  escalonam. O operador continua podendo registrar a resposta que chegou por
  telefone, e o sistema mostra que foi ele, em nome do órgão, e não o órgão.
- **O vínculo vale enquanto está aberto.** Quem sai do órgão perde o acesso na
  hora, e o que era do órgão não vai junto para o órgão novo.
- **O link do ofício continua por enquanto** e passa a mostrar só o dossiê. A
  abertura aparece na linha do tempo do encaminhamento.
- **Ocorrência sigilosa:** só quem pode ver a ocorrência pode encaminhá-la. O
  que foi enviado ao órgão continua com ele mesmo se a ocorrência ficar
  sigilosa depois; dentro da Defesa Civil, quem não vê a ocorrência também não
  vê o encaminhamento dela.

Isto responde, em parte, à divergência 2 abaixo ("Órgão parceiro"): o órgão
passa a entrar no sistema para responder o que foi encaminhado a ele, e o
telefone deixa de ser o único caminho.
