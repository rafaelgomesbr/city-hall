# V2-F00-E12: pacote de saída, laudo com aviso de equipe divergente

Situação: IMPLEMENTADA E MEDIDA em 2026-10-06. FALTA a validação humana que a etapa pede
(Rafael compara o laudo emitido pela rota com o laudo de dentro do pacote, para a vistoria
F1). Por isso a etapa está EM ANDAMENTO no STATUS.

## O defeito, em uma frase

Os dados que o laudo imprime são montados em DOIS lugares. A consulta de vistoria de
`apps/api/src/rotas/documentos.ts` juntava `equipes` duas vezes (`equipe_designada_id` e
`equipe_do_agente_id`) e selecionava os dois nomes; a consulta de vistorias de
`apps/api/src/saida/pacote.ts` juntava só `usuarios`. `avisoDeEquipe`, em
`apps/api/src/documentos/laudo.ts`, lê exatamente esses dois nomes. Resultado: o laudo que
ia DENTRO do pacote saía sem a ressalva de equipe divergente, enquanto o laudo que a
prefeitura imprimia pela rota, para a MESMA vistoria, saía com ela. O município que leva o
pacote embora levaria o papel limpo, e é esse o papel que fica no processo depois de o
contrato acabar.

Não é regressão: o conserto nasceu como teste em `5ecdf4c` e nunca entrou. A falha estava
em `apps/api/test/saida-de-municipio.test.ts:364` e era a ÚNICA falha de teste que sobrava
na API.

## O que foi entregue

API (`apps/api/src/saida/pacote.ts`): a consulta de vistorias do montador do pacote ganhou
`LEFT JOIN equipes ed ON ed.id = v.equipe_designada_id` e
`LEFT JOIN equipes ea ON ea.id = v.equipe_do_agente_id`, e passou a selecionar
`ed.nome AS equipe_designada_nome` e `ea.nome AS equipe_do_agente_nome`, iguais às de
`rotas/documentos.ts`. O tipo `LinhaVistoria` já herdava `DadosDocumento["vistoria"]`, que
aceita os dois campos, então nada mais mudou de tipo. São `LEFT JOIN` de propósito, e o
comentário no código diz por quê: as duas colunas são nulas em toda vistoria anterior à
migração 024, e junção interna apagaria essas vistorias do pacote inteiro em vez de só
deixar o aviso de fora.

Nenhuma migração. Nenhum campo novo no pacote (nome de equipe já saía em
`tabelas/equipes.csv`). O formato do ZIP não mudou.

Testes:

- `apps/api/test/saida-de-municipio.test.ts`: o bloco novo "O laudo do pacote avisa a
  equipe divergente igual ao laudo da rota", com 6 casos. Ele fica no FIM do arquivo de
  propósito (altera as duas colunas de equipe da vistoria F1 para exercitar cada ramo de
  `avisoDeEquipe`) e devolve o estado da semente no `afterAll`.
  1. equipes diferentes: o trecho do aviso é comparado ENTRE os dois documentos, e não só
     contra um texto esperado (dois documentos vazios também seriam iguais, então a frase
     literal entra junto);
  2. equipes iguais: nenhum dos dois laudos inventa aviso;
  3. agente sem equipe registrada: a frase própria ("sem equipe registrada no momento do
     recebimento"), e o laudo NÃO traz "lotado na";
  4. vistoria anterior à migração 024, as duas colunas nulas: nenhum aviso falso;
  5. coleta sem despacho: a nota própria, e ela SUBSTITUI a de divergência (duas ressalvas
     contraditórias na mesma folha é o que faz o leitor descartar as duas). A marca entra
     por SQL direto do arranjo de teste, porque no produto a trilha é append-only;
  6. isolamento: nenhum arquivo do pacote de Serra Alta cita "Equipe Única", que é a
     equipe de Vale Fundo.
- `apps/web/test/fluxo-api.e2e.mjs`: seção 29 nova, 15 verificações. A divergência é
  montada pela API DE VERDADE, e não por SQL: a coordenação abre a ocorrência, faz a
  triagem, despacha para a Equipe Bravo, e o agente Diego, que é da Equipe Alfa, envia a
  coleta por `POST /sincronizacao/vistoria` (a rota aceita e marca, de propósito). Depois a
  administradora clica em "Baixar pacote de saída" no painel, o ZIP é aberto com o leitor
  independente da seção 28, e o trecho do aviso do laudo do pacote é comparado palavra por
  palavra com o do laudo que `GET /documentos/:id/laudo` emite. A seção também prova o lado
  oposto: uma segunda ocorrência, despachada para a Equipe Alfa e coletada pelo agente da
  Alfa, continua sem aviso nenhum nos dois documentos. O conserto não passou a avisar
  sempre, que seria a outra forma de o documento perder valor.

Documentação: `dc360/docs/SAIDA-DE-MUNICIPIO.md` (linha nova na tabela do capítulo 4 e a
seção "O risco que continua aberto: dois montadores de documento") e
`dc360/apps/api/PENDENCIAS.md` (seção nova com o defeito, o conserto e o que sobra).
`dc360/scripts/baseline.mjs` ganhou os esperados da etapa: `teste-api` com +6 testes e
uma falha a menos.

## Prova de que os testes pegam o defeito

Com as duas junções REMOVIDAS do código (e nada mais mudado):

| Suíte | Antes do conserto | Depois |
| --- | --- | --- |
| `apps/api/test/saida-de-municipio.test.ts` | 25 casos, **3 falham** | 25 de 25 |
| e2e, seções 28 e 29 em cópia aparada, Chromium | 51 casos, **2 falham** | 51 de 51 |

As 3 falhas da API são a pré-existente (`:364`, o caso da etapa) mais dois dos casos novos
("equipes diferentes: o trecho do aviso é o MESMO nos dois laudos" e "agente sem equipe
registrada"). Os outros três casos novos passam nos dois lados de propósito: eles trancam a
ausência do aviso (nulo não é divergência), e um teste que falhasse ali estaria exigindo o
defeito oposto.

As 2 falhas do e2e são exatamente "o laudo DO PACOTE traz o mesmo aviso, e nao o papel
limpo" (o pacote vinha sem nota nenhuma) e "e o trecho do aviso e IDENTICO nos dois
documentos" (a rota trazia a frase, o pacote vinha vazio). A saída está em
`saidas/01-sonda-e2e-antes-do-conserto.txt`.

## Regressão obrigatória da etapa (números reais, 2026-10-06)

| Medição | Resultado | Situação |
| --- | --- | --- |
| `npm run test:api` | 1234 testes, **0 falhas**, 13 pulados; 92 de 93 arquivos passam | verde para teste |
| `npm run test:isolamento` (portão CA-06) | 12 arquivos, 327 passam, 3 pulados, código 0 | verde |
| `npm run test:e2e:api` completo | para na seção 13, como antes da etapa | vermelho pré-existente (E18) |
| e2e, seções 28 e 29 em cópia aparada, Chromium | 51 de 51 `OK`, zero erro de console | verde |
| e2e, seções 28 e 29 em cópia aparada, Firefox | 51 de 51 `OK`, zero erro de console | verde |
| `npm run typecheck` | código 0 | verde |
| `node scripts/baseline.mjs --so=teste-api` | `confere`, 0 divergentes de 1 | confere |
| `node --test scripts/baseline.test.mjs` | 16 de 16 | verde |
| `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` | só as 4 linhas de travessão pré-existentes | vermelho pré-existente (E20) |

O arquivo `apps/api/test/banco-tls.test.ts` continua REPROVANDO na carga (o `openssl` do
ambiente recusa o comando que ele monta) e os 13 casos dele continuam contados como
pulados. É o vermelho de ambiente da E21, e ele não entra na contagem de testes: por isso
`npm run test:api` ainda sai com código 1 apesar de nenhuma falha de teste.

**A partir desta etapa a API fica com ZERO falhas de teste.** A única falha que sobrava era
a desta etapa.

## Por que as seções 28 e 29 foram provadas em cópia aparada

`npm run test:e2e:api` completo morre na seção 13 (CORS do `PUT` de evidência, defeito
pré-existente da E18), muito antes de chegar à 28. Para provar as duas seções foi usado o
mesmo método da E11: uma cópia do arquivo com o cabeçalho, os ajudantes e só as seções 28 e
29, sem alterar uma linha do código das seções
(`sondas/e2e-aparado-secoes-28-29.mjs`), rodada por uma cópia do roteiro em portas próprias
(`sondas/e2e-aparado-runner.mjs`, portas 3695 e 4695). Nenhum dos dois arquivos ficou no
repositório. Quando a E18 fechar, as seções passam a rodar dentro do roteiro completo, sem
cópia.

## O trecho do aviso, nos dois documentos

Protocolo `000479/2026` (ocorrência criada pela própria seção 29, despachada à Equipe Bravo
e coletada por agente da Equipe Alfa), nos dois motores:

```
Atenção: esta ocorrência estava designada à Equipe Bravo e a vistoria foi coletada por
agente lotado na Equipe Alfa. O sistema registrou a coleta e manteve a tarefa com a equipe
designada. A divergência precisa ser conferida pela coordenação antes de o ato ser
praticado.
```

Idênticos: sim. Ver `trechos/trecho-do-aviso-chromium.txt` e
`trechos/trecho-do-aviso-firefox.txt` (gerados pelo próprio e2e, um por motor).

## Limitações e o que NÃO foi feito

- **A duplicidade continua.** Existem dois montadores de dados do documento, e campo novo
  que o laudo imprima ainda tem de entrar nas duas consultas. A unificação é a F09-E02, e a
  etapa proíbe fazê-la aqui. A pendência está escrita em `dc360/apps/api/PENDENCIAS.md`.
- **ACHADO fora do escopo:** a consulta do pacote também não seleciona `v.latitude` nem
  `v.longitude`, que `documentos.ts` seleciona, então o laudo do pacote imprime "Coordenada
  capturada no local: não registrada" onde o laudo da rota imprime a coordenada. É a MESMA
  classe de divergência desta etapa, mas não é o defeito que ela lista, e nada quebra por
  causa dele: não foi tocado, e está registrado em `PENDENCIAS.md` e na seção 11 do STATUS.
- Não há captura de tela: a etapa não é de interface (o botão e a tela são da E11, e as
  capturas estão lá).
- Não foram tocados: montador único (F09-E02), artefato guardado com hash (F09-E04,
  F09-E11), memória do pacote (F07-E06).
- O `npm run test --workspace @dc360/web` não entra na regressão obrigatória desta etapa e
  não foi rodado: nenhum arquivo do painel mudou (o `fluxo-api.e2e.mjs` é e2e e não entra na
  suíte do vitest do painel). As 6 falhas conhecidas do painel (E13 e E21) seguem sendo das
  outras etapas.

## Validação humana pendente (não bloqueia a etapa seguinte)

Rafael compara o laudo emitido pela rota com o laudo de dentro do pacote, para uma vistoria
com equipe divergente, e confere que a ressalva é a mesma nas duas folhas. O caminho mais
curto: subir a API local com a semente, repetir o que a seção 29 faz pelo painel (despachar
uma ocorrência para a Equipe Bravo, mandar o agente da Alfa coletar), abrir
`GET /documentos/:id/laudo` no navegador, baixar o pacote em Organização e abrir
`documentos/<protocolo>/laudo-de-vistoria.html` do ZIP.

## Arquivos desta evidência

- `saidas/00-antes-api-saida-de-municipio.txt`: o estado antes do conserto, 19 casos com 1
  falha em `:364`.
- `saidas/01-sonda-e2e-antes-do-conserto.txt`: o e2e com as duas junções removidas, 49 de
  51 (as 2 falhas são as do laudo do pacote).
- `saidas/02-api-saida-de-municipio-depois.txt`: o arquivo da etapa depois, 25 de 25,
  caso por caso.
- `saidas/03-test-api.txt`: a API inteira, 1234 testes, zero falha, 13 pulados.
- `saidas/04-test-isolamento.txt`: o portão CA-06, 327 de 330 (3 pulados), código 0.
- `saidas/05-e2e-secoes-28-29-chromium.txt` e `saidas/06-e2e-secoes-28-29-firefox.txt`: as
  seções 28 e 29 em cópia aparada, 51 de 51 nos dois motores, com o código final.
- `saidas/07-e2e-api-completo-cai-na-secao-13.txt`: o `test:e2e:api` completo, parando onde
  já parava (E18).
- `saidas/08-typecheck.txt`: typecheck do monorepo, código 0.
- `saidas/09-baseline-teste-api.txt` e `saidas/baseline-depois/`: o roteiro da linha de base
  conferindo o passo `teste-api` contra os esperados novos.
- `trechos/`: o trecho do aviso nos dois documentos, por motor.
- `sondas/`: a cópia aparada do e2e e o roteiro que a sobe.
- `INDEX.md`: SHA-256 de cada arquivo desta pasta.

Toda saída bruta passou por `redigir` de `dc360/scripts/baseline.mjs` antes de ser
arquivada: JWT de teste fora e travessão trocado por `[travessao]`, porque o teste de
conteúdo varre `docs/` inteiro. Nenhum dado real de pessoa: a semente é sintética (Serra
Alta e Vale Fundo), e nome de equipe não é dado pessoal.
