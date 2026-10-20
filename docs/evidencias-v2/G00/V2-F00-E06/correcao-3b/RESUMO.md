# V2-F00-E06, correção 3b: a pausa velha cai ao entrar de novo, o Perfil e o acesso suspenso param de mandar esperar sinal

Base: `5ed4bd1` (inclui a correção 3, `11a0436`), ramo `trab/correcao-5`. Motivo: revisão independente (Opus) de `11a0436`, que achou um bloqueio no Perfil, uma pausa que não caía, um caso de acesso suspenso e uma mutação (M07) que não reprovava nada.

## Fatos

**1. Pausa velha (motor e aplicativo).** O motor só limpava `pausa` quando um envio dava certo ou a fila esvaziava. A pessoa entrava de novo, o primeiro envio falhava por rede ruim e `pausadaPor` seguia `sessao_encerrada`: "Enviar agora", a fila e a vistoria mandavam entrar de novo quem tinha acabado de entrar (sonda do revisor, `30-pausa-velha.txt`).
- `packages/campo/src/fila.ts`: nova opção `geracaoDaSessao?: () => number` (a "geração da credencial", sobe a cada login). A pausa guarda a geração do PEDIDO que levou a recusa (capturada antes de salvar o item como `enviando`); `pausadaPeloUsuarioAtual()` descarta a pausa cuja geração difere da atual, na leitura, sem esperar dreno (que pode nem rodar sem sinal). Se a pessoa entrar enquanto o pedido está no ar, a recusa que voltar é da credencial velha e nem pausa. Sem a opção, o comportamento é o de antes.
- `apps/campo/src/dados/geracao-da-sessao.ts` (novo): o contador, na memória. `sessao.tsx` chama `novaGeracaoDaSessao()` no `entrar` bem-sucedido (renovar o token em silêncio NÃO sobe: a pausa por sessão encerrada nasce de a renovação ter sido recusada). `dados/fila.ts` passa `geracaoDaSessao` ao motor. Cobre as três pausas: sessão encerrada, conta desativada (reativada, a pessoa entra de novo) e senha provisória (definida no painel, a pessoa entra de novo).
- Testes: motor `packages/campo/test/pausa-velha.test.ts` (7: por motivo a pausa cai sem dreno; a falha de rede seguinte não a traz de volta; a recusa de pedido feito com a credencial velha não pausa a nova; controle com a mesma credencial; sem a opção); aplicativo `ui/pausa-cai-ao-entrar-de-novo.test.tsx` (2, fila real, transporte real, geração real, só o `fetch` falso, com controle) e 1 caso em `__tests__/entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` (o `entrar` real sobe a geração; `encerrarSessaoVencida` não).

**2. Perfil (bloqueio da revisão).** Com a fila pausada, o aviso acima de "Sair da conta" dizia "Espere a fila esvaziar antes de sair / Procure sinal e espere a fila esvaziar", e o rótulo falado do chip dizia "N coletas esperam sinal para serem enviadas". Agora, com `pausadaPor`: o aviso usa `titulo` e `detalhe` de `frasesDaPausa` e mantém a frase que continua verdadeira (fora da conta ninguém envia estas coletas, nem quem entrar depois); o chip diz "N guardadas" e o rótulo falado "N coletas guardadas neste aparelho. <título da pausa>". Testes novos em `ui/dialogo-na-conta.test.tsx` (controle e, por motivo, aviso e chip).

**3. Acesso suspenso.** O motor trata `acesso_suspenso` como falha temporária (sem pausa); quem sabe dele é a lista, que diz "Acesso suspenso pelo fornecedor". Em `index.tsx`, "Enviar agora" com `falhaDeRede === "acesso-suspenso"` mostra a mesma frase da lista (`comoContarAFalha`), e não "sai quando ... houver sinal". Teste novo em `__tests__/enviar-agora-com-a-fila-pausada.test.tsx`.

**4. M07 (a guarda de autoria da devolução).** Caso novo em `ui/fila-pausada-nao-promete-sinal.test.tsx` (3, um por motivo): devolução sem autor registrado, com a fila pausada, não ganha a frase da pausa nem "Devolução guardada". Sem a guarda `autoria === "propria"`, os 3 reprovam (`saidas/13`).

**5. Anotados e feitos.** Na vistoria já coletada, o aviso com a fila pausada passou a `tom="alerta"` (peso leve, pelo portão de densidade) e não repete "neste aparelho" ("Esta ocorrência já foi coletada." + `detalhe`); o teste exige a ausência da repetição. O dublê de `a-vistoria-recebida-sai-da-lista.test.tsx` passou a devolver `enviados: 1` quando confirma e a ter `assinar`.

**Mordida** (`saidas/12`, código de produção revertido por arquivo, testes novos mantidos): `packages/campo/src/fila.ts` 5 de 7; `dados/fila.ts` 1 de 2; `sessao.tsx` 1 de 11; `perfil.tsx` 9 de 16; `index.tsx` 1 de 8; `vistoria/[id].tsx` 3 de 8. Os que passam são os controles.

**Regressão (todas com código 0).**
- `npm run test:campo` (`saidas/20`): tipos limpos, 139 suítes, 1997 de 1997 (era 1983), jest e leitura do código concordam.
- `npm run test --workspace @dc360/campo` (`saidas/21`): 238 de 238 (era 231).
- `node --test scripts/portao-*.test.mjs scripts/baseline.test.mjs` (`saidas/22`): 108 de 108. A primeira rodada reprovou o portão de densidade (R1) em `perfil.tsx` e em `vistoria/[id].tsx`; os avisos novos passaram a `peso="leve"` e, na vistoria, a dois `Aviso` com tom literal.
- Portão de conteúdo (`saidas/23`): 10 de 10.
- `npm run conferir:numeros` (`saidas/25`): verde. `baseline.mjs`: `V2-F00-E06-correcao-3b` com 7 (pacote) e 14 (aplicativo), falhas 0, puladas inalteradas; README (1983 para 1997, 231 para 238, 3351 para 3358), `apps/campo/LEIA-ME.md` (231 para 238) e `docs/COLOCAR-DE-PE.md` (5334 para 5355).
- `npm run test:scripts` e `node scripts/conferir-indices-de-evidencia.mjs` (`saidas/28`, `saidas/27`): verdes com o INDEX desta pasta e o de topo.

**Limitações.** Nada foi visto em aparelho nem emulador (nível E1/E2 no motor); a pendência E4 do Rafael continua aberta. A geração vive na memória: reabrir o aplicativo zera a pausa (já era assim). Se a causa da pausa não mudou e a pessoa entra de novo, a nova tentativa é recusada e a pausa volta, o que é o certo. A pausa por falha de sessão que persiste sem login novo (rede ruim) continua até um envio dar certo: é o comportamento anterior, coberto como controle. Não rodei `test:api` nem `test:isolamento` (API, banco e autorização não foram tocados).

## Justificativa

A pausa é uma observação sobre uma credencial, e a pessoa tem um único ato que muda a credencial: entrar de novo. Ligar a validade da pausa a esse ato (um contador que o login sobe) é a menor mudança que fecha a janela sem inventar teste de "a causa passou": o motor não consegue saber se a coordenação reativou a conta, mas sabe que a credencial é outra, e deixa a próxima tentativa decidir. Foi no motor porque é lá que a pausa nasce e é lida por todas as telas; o contador fica no aplicativo porque só o aplicativo sabe quando houve login. Capturar a geração no começo do pedido, e não na resposta, fecha a corrida em que o login acontece com o pedido no ar.

O Perfil e o acesso suspenso são o mesmo defeito da correção 3 em dois pontos que a varredura por texto não pegou (o rótulo falado do chip estava dentro de um template, e o acesso suspenso não é pausa do motor). A varredura da correção 3 era por frase; esta repete a pergunta pelo estado: onde o aplicativo sabe que a fila não vai sair com sinal.
