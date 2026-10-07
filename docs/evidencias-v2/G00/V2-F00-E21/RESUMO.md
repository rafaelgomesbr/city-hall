# V2-F00-E21: Ambiente (CRLF, OPENSSL_CONF, cache do Expo), Windows e Linux

Executada em 2026-10-07, no Windows 11 (Git Bash e PowerShell 5.1, Node 22.17.0).
Sem commit.

## O que foi feito

1. **Fim de linha.** `.gitattributes` novo na raiz do repositório:
   `* text=auto eol=lf`, `*.ps1`, `*.bat` e `*.cmd` em CRLF, imagem, fonte,
   PDF, documento do Office, áudio, vídeo, dump e chave marcados `binary`.
   `apps/web/test/ler-fonte.ts` (`lerFonte`, `normalizarFimDeLinha`,
   `blocoDaFuncao`) passou a ser usado por `ocorrencia-encerramento.test.ts`;
   o recorte agora LANÇA erro quando não acha a chave na coluna zero, em vez de
   devolver o resto do arquivo calado.
2. **`OPENSSL_CONF`.** `apps/api/test/openssl-do-teste.ts`: `ambienteDoOpenssl`
   tira a variável do ambiente do processo filho só quando ela aponta para
   arquivo inexistente e devolve o motivo (impresso pelo `beforeAll`);
   `localizarOpenssl` usa o do PATH e, no Windows sem ele no PATH (o caso do
   PowerShell, achado nesta etapa), o que vem ao lado do `git`; sem `openssl`
   em lugar nenhum a suíte reprova com frase, nunca pula.
   `banco-tls.test.ts` chama `gerarCertificadoAutoassinado`; as 13 afirmações
   não mudaram.
3. **Cache do Expo.** `scripts/testar-campo.mjs` confere
   `apps/campo/.expo/types/router.d.ts` contra as rotas de `src/app` antes do
   typecheck e apaga `.expo/types` só quando falta rota (hoje faltavam
   `/avisos`, `/mapa`, `/perfil`). O arquivo é gerado pelo `expo start`, é por
   máquina e está no `.gitignore` do app (`.expo/`); nada de `node_modules`
   foi tocado.
4. **Testes novos:** `ler-fonte.test.ts` (7), `openssl-do-teste.test.ts` (10),
   `testar-campo.test.mjs` (+7).
5. **`baseline.mjs`:** API +10 e -13 pulados, painel +7 e -1 falha, scripts +7;
   `teste-api`, `teste-web` e `test-campo` esperam código 0.
6. **Documentação:** `dc360/README.md` (plataformas e matriz, números),
   `dc360/apps/campo/LEIA-ME.md` (o cache), `dc360/docs/COLOCAR-DE-PE.md`
   (números), `docs/DECISOES-DE-TESTE-DA-FASE-00.md` (os dois registros da E21).

## Resultados medidos

| Medição | Antes (`baseline-antes/`) | Depois (`baseline-depois/`) |
| --- | --- | --- |
| `npm run typecheck` | 0 | 0 |
| `npm run test:api` | código 1, 1245 com 13 pulados (`banco-tls`) | código 0, 1255, 0 pulados |
| painel (`@dc360/web`) | código 1, 636 com 1 falha (CRLF) | código 0, 643, 0 falhas |
| `npm run test:campo` | código 2 (2 TS2345 do cache) | código 0, 1861 casos, contagem cruzada |
| `npm run test:scripts` | 199, 0 falhas, 4 pulados | 206, 0 falhas, 4 pulados (por ambiente, sem `ios/`) |
| `npm run test:isolamento` | (não tocado) | 327 e 3 pulados por ambiente, código 0 |
| shared, motor de campo, console | | 168, 187, 259, todos código 0 |
| `conferir:numeros` | | 22 afirmações, 0 divergências |
| `npm test` na raiz | | código 0 (`saidas/08`) |

Os três casos da etapa:

- **CRLF:** a árvore de trabalho deste Windows é CRLF e o painel passa;
  `ler-fonte.test.ts` grava a mesma fonte real em CRLF e em LF e prova recorte
  idêntico. Negativos: chave movida para antes do `onEnviar` tira a chamada do
  bloco (em CRLF e em LF); função sem chave na coluna zero e assinatura ausente
  reprovam. `git ls-files --eol`: 0 `i/crlf` (`saidas/01`, `02`).
  `git add --renormalize .` foi rodado numa CÓPIA do índice (o real não foi
  tocado, para não preparar as mudanças de outras etapas): muda 0 arquivos além
  dos já modificados na árvore (`saidas/03`).
- **`OPENSSL_CONF`:** 13 de 13 com a variável apontando para arquivo inexistente
  e sem ela, no Git Bash (`saidas/04`), e 23 de 23 no PowerShell, onde antes
  davam 13 pulados mais a falha de carga (`saidas/05`). Com configuração válida
  o teste a respeita: ela pede `CA:FALSE` e o certificado sai com `ca === false`
  (sem ela, `true`).
- **Cache `.expo`:** com o `router.d.ts` de 2026-08-27 de volta, o `tsc` direto
  dá os 2 TS2345 e código 2; sem ele, código 0 (`saidas/06`). `test:campo`
  com o cache velho presente apaga e passa (`saidas/07`); sem cache, passa
  (`baseline-depois/08`).

## Limitações e o que falta

- **Linux não foi provado.** Esta máquina não tem WSL nem Docker. O código foi
  escrito portátil (separador de PATH por plataforma, `join`, nenhum caminho
  fixo), mas a coluna Linux da matriz do README fica "não provado" até um run
  do CI (F01-E03) ou de contêiner. Por isso a etapa fica EM ANDAMENTO: a
  Definition of Done pede os três casos verdes em Windows E Linux.
- Um checkout NOVO passa a ser LF também no Windows. A árvore atual continua
  CRLF até alguém renormalizar o checkout; os arquivos editados seguem CRLF por
  convenção e o git converte na entrada, sem diferença de conteúdo (69 de 69
  arquivos modificados mudam igual com `--ignore-cr-at-eol`).
- O SHA-256 de evidência antiga em texto foi calculado sobre os bytes da árvore
  daquele dia; num checkout LF ele só confere depois de converter o fim de
  linha. Nenhum conferidor automático de `INDEX.md` existe hoje.
- `npm run typecheck` rodado DIRETO em `apps/campo` com cache velho ainda
  reprova; a limpeza mora no `test:campo`, como a etapa pede (nota no LEIA-ME).
- O cache em dia é mantido de propósito: a checagem é por rota ausente, e uma
  rota apagada que continue no cache não dispara a limpeza.
- Fora do escopo, não feito: a troca de espera fixa por condição em
  `resolver-link.test.ts` e `dominio.test.ts` (proposta da seção 11 do STATUS,
  sem aceite do Rafael).

## Validação humana pendente

Rafael roda `npm run verificar` no Windows e anexa um run em Linux (CI ou
contêiner) dos três casos.
