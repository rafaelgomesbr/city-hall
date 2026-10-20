---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem própria (API do SHA em 127.0.0.1:3891, PGlite recém-semeado, painel do SHA na 4891; e um painel em modo local construído do SHA e servido na 4173 para o `fluxo.e2e.mjs`, que fixa essa porta). `V` é `SCRATCH/validadores/acessibilidade`.

| Critério | WCAG | Resultado | Prova |
| --- | --- | --- | --- |
| Confirmações de gravação anunciadas por `role=status` (linha "Acessibilidade" da etapa) | 4.1.3 | OK: o `Toast` é `role=status aria-live=polite`, nos dois motores | `V/saidas/11-sonda-telas.txt` (Equipes) |
| Ícone mais texto na confirmação | 1.4.1 | OK (ícone de confirmação e frase) | idem; `capturas/a11y-E13-toast-equipes-*` |
| Contraste da confirmação, dois temas | 1.4.3 | 5,53 (claro) e 7,48 (escuro) | idem |
| "Fechar" do aviso com alvo de 44 px | 2.5.8 | 64x44 px | idem |
| Aviso não cobre a barra do rodapé no celular | 1.4.10, 2.4.11 | "não sobrepõe" a 390 e 320 px | idem; `capturas/a11y-E13-toast-equipes-{chromium,firefox}-{390-dark,320-light}.png` |
| O foco fica no formulário ao gravar pelo teclado (Enter) | 2.4.3 | OK: `#equipe-nome` | idem |
| Portão de acessibilidade lê a exceção pelo bloco de comentário e reprova `onClick` sem exceção | 4.1.2, 2.1.1 | OK no caso de mesma linha; ponto cego quando `<div` está sozinha na linha (achado 1) | `V/saidas/13-*` e `14-*` |
| Painel com zero vermelhos | | 688 de 688, 45 arquivos | `V/saidas/06-vitest-web.txt` |
| E2E do modo local em Chromium e Firefox (inclui entrar por `/` e o teclado da barra) | 2.1.1 | 70 de 70 nos dois, zero erro de console | `V/saidas/16-fluxo-local-{chromium,firefox}.txt` |

## Evidência

- `npm run test --workspace @dc360/web`: código 0, 688 testes (`V/saidas/06-vitest-web.txt`).
- `MOTOR=chromium` e `MOTOR=firefox node test/fluxo.e2e.mjs` contra o painel local na 4173: código 0, "Passou: 70 Falhou: 0" nos dois (`V/saidas/16-fluxo-local-*.txt`).
- `node V/sondas/telas.mjs` (código 0, `V/saidas/11-sonda-telas.txt`): cadastra equipe por Enter no campo, mede o aviso (papel, ícone, contraste do texto, tamanho do "Fechar", sobreposição com a barra fixa), observa a inserção da região viva e fecha o aviso pelo teclado; 1280 claro, 390 escuro e 320 claro, dois motores.
- Mutação do portão (`src/componentes/Toast.tsx`, restaurado com `git restore` e conferido por `git status`): `<div` sozinho na linha com `onClick` na linha de baixo, `npx vitest run test/acessibilidade.test.ts` código 0, 21 de 21 (`V/saidas/13-mutacao-portao-div-sozinha.txt`); a mesma mutação na mesma linha, código 1, 1 falha (`V/saidas/14-mutacao-portao-div-mesma-linha.txt`).
- Capturas: `capturas/a11y-E13-toast-equipes-{chromium,firefox}-{1280-light,390-dark,320-light}.png`.

## Cenários positivos

Gravar equipe pelo teclado mostra a confirmação em `role=status` com ícone, contraste folgado e "Fechar" de 44 px, sem cobrir a barra do celular, nos dois motores e temas.

## Cenários negativos

- O portão reprova `onClick` em `div` sem exceção escrita quando o elemento abre e recebe o atributo na mesma linha (mutação 2).
- Operador digitando `/usuarios` e rota índice sem sessão: cobertos pelo `fluxo.e2e.mjs` (verde nos dois motores).

## Tentativas de reprovar

1. Mutação do portão no formato que o red-team da rodada 4 apontou (`<div` sozinha na linha, fim de linha LF): o portão continua cego (achado 1).
2. Fechei o aviso pelo teclado: o foco vai a BODY nos dois motores (achado 3).
3. Observei como a região viva entra no DOM: o `Toast` é montado já com o texto (achado 2).
4. 320 px: o aviso não estoura a largura nem cobre a barra.

## Achados

1. **corrige antes de crescer (já apontado na rodada 4, continua aberto).** O portão `acessibilidade.test.ts` não enxerga `<div` sozinha na linha quando o fim de linha é LF: o padrão `<[a-z][a-zA-Z0-9]*[\s/>]` exige um caractere depois do nome da tag (com CRLF o `\r` serve). Prova: mutação 1 verde com um `onClick` real numa `div` (`V/saidas/13-*`). O caso sintético que a etapa pede (reprovar `onClick` sem exceção) passa, então não reprova a etapa.
2. **anotado.** A confirmação é inserida já com o texto dentro de `role=status` (`{aviso && <Toast .../>}` em `Usuarios.tsx:498`, `Equipes.tsx:268`, `Orgaos.tsx:426`); a própria E10 registra que região viva inserida assim pode não ser anunciada. O critério da etapa (anunciada por `role=status`) está na marcação; o anúncio real só leitor de tela prova.
3. **anotado (já registrado na rodada 4).** Fechar o aviso pelo teclado leva o foco a BODY.

## Não verificado

- Leitor de tela (o anúncio real da confirmação).
- Toast de Usuários e Órgãos medido por mim só por leitura (mesmo componente e mesma montagem que o de Equipes); WebKit; zoom de 200 por cento a 1280 px.

## Risco residual

O portão de acessibilidade tem ponto cego conhecido para um formato comum de JSX; uma `div` clicável nova escrita assim passa sem aviso.

## Motivo do humano

Só uma pessoa com leitor de tela confere se a confirmação montada já com texto é anunciada; a validação humana da etapa (Rafael digita só o domínio e chega à tela do papel) e a aprovação das seis frases seguem pendentes.
