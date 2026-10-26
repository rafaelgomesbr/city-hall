# V2-F01-E15, correção 1 (parte B): a cópia nasce restrita e conferida, e o pg_dump certo é achado

Revisão independente da F01 (Codex, somente leitura), achados 1 e 10 de
`codex-f01-B`. Ramo `trab/f01-corr-b`, sobre `v2/f01` em `e483a22`.

## Fatos

### Achado 1 (BLOQUEIA): a ACL não garantia privacidade durante o dump

- **Confirmado, numa sonda real no Windows** (`saidas/02-sonda-acl-windows-antes.txt`).
  Uma pasta `prod` com concessão EXPLÍCITA e herdável ao grupo Usuários
  (`S-1-5-32-545`, leitura), passada pelo `restringirAoDono(pasta)` de antes
  (`icacls /inheritance:r /grant:r <operador>:(OI)(CI)F`), continuou dando a
  concessão: o arquivo do dump criado dentro dela nasceu com
  `BUILTIN\Usuarios:(I)(R)`. O `/inheritance:r` só tira o que é herdado; o
  `/grant:r` só troca a entrada do operador. A restrição do arquivo vinha
  DEPOIS do `pg_dump` (antes na linha 422), então o dump com dado de cidadão
  ficava legível por outro usuário da máquina durante a escrita inteira.
- Os testes de antes só simulavam o `icacls` e não liam a DACL resultante.

Conserto em `dc360/scripts/copiar-producao.mjs`:

1. `lerDaclDoIcacls(saida, caminho)` lê a DACL que `icacls <caminho>` imprime
   (caminho e primeira entrada na mesma linha, as outras alinhadas, linha em
   branco, resumo). Saída fora desse formato, caminho diferente ou DACL vazia
   LANÇAM: uma permissão que não se lê não é uma permissão conferida.
2. `conferirAclDoDono` reprova qualquer entrada além do operador (sem diferença
   de caixa) e do SYSTEM (`NT AUTHORITY\SYSTEM` ou `AUTORIDADE NT\SISTEMA`),
   inclusive entrada de negação, e reprova a DACL sem o operador. A mensagem
   nomeia cada entrada e o comando `icacls ... /remove:g` que a tira. No macOS e
   no Linux, confere o modo lido do disco (nenhum bit de grupo ou de outros) e
   o dono.
3. `restringirAoDono` agora restringe E confere.
4. `prepararDestinoDaCopia` cria a pasta, restringe e confere, cria o arquivo
   VAZIO com `wx` (nunca sobrescreve), restringe e confere. Só então
   `tirarCopia` chama o `pg_dump`, que escreve no arquivo que já existe (abre
   com truncamento, que não troca ACL nem modo), e confere de novo depois.
   Qualquer reprovação apaga o arquivo antes de a recusa subir; falha do
   `pg_dump` apaga e devolve o código.

Sonda real depois (`saidas/04-sonda-acl-windows-depois.txt`): a mesma pasta
com a concessão ao grupo Usuários faz o roteiro RECUSAR antes de criar o
arquivo (o arquivo do dump não existe), nomeando a entrada e o comando que a
tira; uma pasta limpa é aceita e o arquivo vazio nasce com uma entrada só, a do
operador, `(F)`, sem herança.

### Achado 10 (DÍVIDA): um pg_dump antigo no PATH escondia o compatível

- **Confirmado** por leitura e por teste: `localizarPgDump` devolvia o primeiro
  candidato com versão LEGÍVEL. Um 16 no PATH vencia o 17 de `Program Files`,
  e o roteiro recusava mesmo havendo cliente que serve.
- Conserto: vence o primeiro candidato (na mesma ordem: `DC360_PG_DUMP`, PATH,
  lugares padrão) cuja versão SERVE (`versaoMinima`, padrão 17). Sem nenhum
  que sirva, devolve o primeiro legível, para a recusa dizer o que achou. Se o
  servidor responder uma versão maior que a suposta, o roteiro procura de novo
  com a versão real antes de recusar.

### Achado 12, parte do roteiro (E16)

O roteiro passa a imprimir no fim o comando EXATO que apaga a cópia que
acabou de gravar (`comandoParaApagar`: `rm -- '<caminho>'`, ou
`Remove-Item -LiteralPath '<caminho>'` no Windows, com aspas escapadas). O
runbook está na evidência da E16.

## Testes

`dc360/scripts/copiar-producao.test.mjs`: 37 casos (eram 25; 12 novos). O
caso que já existia da ACL do Windows passou a exigir a leitura da DACL
(saída sintética no formato real), e o do macOS e Linux a exigir o modo lido
do disco. Nenhum caso foi afrouxado.

- `saidas/01-testes-antes-do-conserto.txt`: os testes novos contra o código
  antigo (o arquivo não carrega: as funções que os testes exigem não existem).
- `saidas/03-testes-depois-do-conserto.txt`: 37 de 37.
- `saidas/02-` e `saidas/04-sonda-acl-windows-*.txt`: a sonda real (pasta
  temporária, sem dado, sem banco), antes e depois. Máquina, usuário e pasta
  pessoal redigidos; o `Usuários` do icacls sai sem acento porque o console o
  imprime na página de código OEM (a sonda o normaliza para a evidência).

`node scripts/copiar-producao.mjs --ambiente prod --conferir` (não toca o
banco) continua achando o `pg_dump` e saindo 0 nesta máquina.

## Justificativa

- A ordem nova (arquivo vazio, restrito e conferido antes do primeiro byte) é
  a única que fecha a janela: restringir depois, como antes, deixava o dump
  inteiro legível enquanto era escrito.
- Ler a DACL em vez de confiar no código de saída do `icacls` é o que pega a
  concessão explícita que o `/inheritance:r` preserva; o teste de antes
  passava porque só olhava os argumentos.
- Reprovar em vez de remover sozinho a entrada alheia: a pasta pode ter sido
  ajustada por quem administra a máquina, e o roteiro não decide isso calado;
  a mensagem diz o que tirar.
- O SYSTEM é tolerado porque lê qualquer arquivo de qualquer jeito; nenhuma
  outra conta é.
- Limitação conhecida: um nome de conta com acento pode chegar estragado pela
  página de código do console; nesse caso a comparação falha e o roteiro
  RECUSA (fecha na falha), e a mensagem diz como ver o nome certo.
- Nada aqui tocou banco, chaveiro ou dado real; nenhuma ACL fora da pasta
  temporária da sonda foi alterada.
