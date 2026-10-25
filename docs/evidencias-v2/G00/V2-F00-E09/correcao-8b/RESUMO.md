# V2-F00-E09, correção 8b

## Fatos

- **Origem:** achados do revisor independente sobre a correção 8 (`b7e1cd7`, ponta do `v2/f00`). Três, cada um com teste que reprova antes. Nada além disso foi tocado.
- **Achado 1: Esc e clique no fundo fechavam a janela gravando.** Em `ConfirmarAcao`, enquanto `ocupado`, o "Cancelar" ficava `disabled`, mas o `Modal` recebia `aoFechar={aoCancelar}`, então o Esc (e o clique no fundo, nas janelas não destrutivas) fechava a janela; a ação concluía e um erro do servidor caía numa janela fechada. Agora `ConfirmarAcao` entrega `aoFechar={aoFecharDaConfirmacao(ocupado, aoCancelar)}`, função pura exportada que devolve uma função vazia quando `ocupado` e o `aoCancelar` quando não. Como o `Modal` guarda o `aoFechar` num ref atualizado a cada renderização, quando o erro chega e `ocupado` volta a falso a saída volta a valer na hora: a janela nunca fica presa (o Esc depois do erro fecha, e a seção 15 (C) continua provando isso).
- **Achado 2: frase dos "15 minutos".** A API usa `ACESSO_MINUTOS` (padrão 15, até 60), então o número fixo podia ser falso, e "mostrando consultas" era suave demais (o token também faz consultas novas). Nas janelas "Redefinir senha" e "Encerrar sessões" (Usuários) e "Encerrar minhas outras sessões" (Minha conta) o trecho virou "pode continuar consultando por alguns minutos". As frases de renovar e gravar recusados não mudaram.
- **Achado 3: "Desativar usuário".** Dizia "as sessões dela caem". Passou a dizer: "A pessoa perde o acesso agora: renovar a sessão e gravar são recusados na hora (uma tela já aberta pode continuar consultando por alguns minutos) e o aplicativo de campo para de sincronizar." O resto da frase (nome nos laudos e na trilha, reativar devolve o acesso) ficou igual.
- **Arquivos de produto:** `dc360/apps/web/src/componentes/ConfirmarAcao.tsx`, `src/paginas/Usuarios.tsx`, `src/paginas/MinhaConta.tsx`. O `Modal.tsx` não precisou mudar.
- **Testes:** `apps/web/test/correcao-8b-da-e09.test.ts` (novo, 8 casos: a função de saída ocupada, livre e o ciclo erro e volta; a ligação em `ConfirmarAcao`; nenhuma tela com "15 minutos" nem "mostrando consultas"; "Desativar usuário" sem "as sessões dela caem" e com a frase honesta; as quatro janelas com a mesma frase; a prova no navegador existe). `correcao-8-da-e09.test.ts` trocou 4 asserções de texto (as da frase de 15 minutos) para a nova frase. `layout-estreito.e2e.mjs`, seção 15 (C): nos casos com demora de 1,2 s (4 tamanhos, 2 janelas), depois de confirmar e com os botões travados, aperta Esc e clica no fundo (2, 2) e confere que a janela continua visível. Mais 16 verificações.
- **Contagens:** painel 778 (eram 770; mais 8), `layout-estreito` 406 no Chromium e no Firefox e 405 no WebKit (eram 390 e 389). `baseline.mjs` (`V2-F00-E09-correcao-8b`: 8; `Passou: 406`), `README.md` (778 no painel e 3623 em `npm test`) e `docs/COLOCAR-DE-PE.md` (5620) atualizados pelo `conferir:numeros`. Os números de `npm test` e do aplicativo estavam defasados desde antes (3615 e 5612 contra 3623 e 5620 de agora, já com os 8 casos novos).

## Resultados

| Prova | Antes (`b7e1cd7`) | Depois |
| --- | --- | --- |
| `correcao-8b-da-e09.test.ts` | 7 de 8 falham (`saidas/10-antes-unidade.txt`) | 8 de 8 |
| `layout-estreito`, Chromium | 2 falhas na primeira janela com demora (o Esc e o clique no fundo fecham), depois o roteiro cai: o erro do servidor nunca aparece (`saidas/10-antes-chromium.txt`) | 406 passaram, 0 falhas, zero erro de console |
| `layout-estreito`, Firefox | n/a (o "antes" foi medido no Chromium) | 406 e 0, zero erro de console |
| `layout-estreito`, WebKit | n/a | 405 e 0, zero erro de console |
| Unidade, painel inteiro | 770 | 778 de 778, typecheck do painel e da raiz código 0 |
| `conferir:numeros`, `baseline.test.mjs`, regras de conteúdo | n/a | código 0; todos os números batem; 10 de 10 |

O "antes" do navegador roda o painel construído de `b7e1cd7` (sem os três consertos) com o `layout-estreito` novo; o "depois" roda o painel construído do candidato. Os três motores foram executados um por vez, com a API semeada de novo por motor, no mesmo roteiro das correções 6 a 8 (`sondas/`, portas 7831 e 7832, banco em WebAssembly efêmero).

## Limitações

- O "antes" no navegador só foi medido no Chromium; a regra do Esc enquanto grava é do código do React, igual nos três motores, e o "depois" passou nos três.
- Nenhuma captura de tela nova: a mudança é de comportamento (a janela continua aberta) e de texto, e o texto é provado por teste de fonte. As capturas da correção 8 continuam valendo para o desenho da janela, que não mudou.
- O WebKit é o do Playwright no macOS, não o Safari de um iPhone. Leitor de tela não foi ouvido (H39).
- O texto "alguns minutos" continua provisório: fica definitivo quando a V2-F03-E03 fizer a leitura também recusar o token de sessão encerrada.
- Sem push e sem CI. `STATUS.md`, `ESTADO-ATUAL.md`, `pendencias-humanas.md`, `dividas.md`, `VEREDITO.md` e `validacao/` intocados.
