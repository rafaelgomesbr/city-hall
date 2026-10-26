---
validador: ux (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Capturas em `docs/evidencias-v2/G00/validacao/52952a1/navegador/capturas/` (abaixo, `C/`), geradas por mim nesta rodada (ver `navegador/LEIA-ME.md`). Olhei as que cito. O diff `4b96ea7..52952a1` não toca `Organizacao.tsx` nem `baixarPacoteDeSaida`; o que mudou ao redor é o hover de `.botao--secundario` (a classe deste botão), conferido.

## Critérios verificados

1. Botão "Baixar pacote de saída" no cartão "Saída de município", com a frase de que é o arquivo mais sensível e que baixar não apaga nada. `C/E11-organizacao-saida-antes-{1280,390,320}-{claro,escuro}.png`.
2. Enquanto gera (resposta retida): o rótulo vira "Gerando" e o botão fica desabilitado. `C/E11-organizacao-saida-gerando-{1280,390,320}-{claro,escuro}.png`.
3. Download real do ZIP pela API (`dc360-pacote-de-saida-2026-10-14.zip`, sem falha); o botão volta a "Baixar pacote de saída". `C/E11-organizacao-saida-concluido-{1280,390}-*.png`.
4. Recusa: o 403 REAL que o servidor deu à coordenadora, servido à tela, aparece como aviso de perigo com a frase da API. `C/E11-organizacao-saida-erro-recusa-*`. Falha de rede: "Sem conexão com o servidor. O arquivo não foi baixado. Verifique o sinal e tente de novo." `C/E11-organizacao-saida-erro-rede-{1280,390}-claro.png`. Falha do servidor (500): "Erro interno." `C/E11-organizacao-saida-erro-servidor-390-escuro.png`.
5. Coordenadora: sem "Organização" no menu; o endereço direto mostra "Seu perfil não tem acesso a esta tela...". `C/E11-coordenadora-em-organizacao-1280-claro.png`.
6. Defeitos das rodadas 1 e 2 (UX), reexecutados: nenhuma confirmação depois do download: AINDA MORDE (sem Toast, sem aviso, foco em `BODY`); a recusa diz "alterar os dados do município" para um download: AINDA MORDE (texto real do servidor: "Seu perfil não tem permissão para alterar os dados do município."); "Gerando" sem progresso: persiste. Os três ficam como achados, como nas rodadas anteriores (não violam a DoD: "mostra a frase da API quando recusado").

Portão visual, item a item:
- Alinhamento: PASS (botão alinhado à esquerda do texto do cartão; aviso de erro na largura do cartão).
- Espaçamento: PASS.
- Nada fora do lugar: PASS (medição sem achado; o botão cabe a 320).
- Hierarquia: PASS.
- Texto: PASS com ressalvas (achados 2 e 3); sem travessão.
- Responsivo: PASS em 1280, 390 e 320.
- Temas e estado: PASS (erro com ícone e texto; o botão desabilitado fica esmaecido no escuro, isento de contraste por estar desabilitado).
- Estados: carregando ("Gerando") e três erros desenhados; o estado de sucesso não existe (achado 1).
- Rafael: pendente.

Heurísticas: 1 visibilidade (Gerando; falta o fim), 9 recuperação (rede diz o que fazer; 500 não diz), 2 mundo real ("alterar" para baixar).

## Evidência

- `node $SP/val/ux/e11.mjs` (código 0), saída `$SP/val/ux/e11.log`; textos e foco em `$SP/val/ux/resultados.json`.
- Capturas lidas: `E11-organizacao-saida-gerando-390-escuro.png`, `E11-organizacao-saida-erro-recusa-320-claro.png`.

## Cenários positivos

- Administradora baixa o pacote pela API real com o botão.

## Cenários negativos

- Coordenadora sem a tela e sem o item de menu; recusa, rede e servidor com aviso na tela.

## Tentativas de reprovar

- Procurei o botão preso em "Gerando" depois do download e depois de cada erro: volta ao rótulo normal nos quatro casos.
- Procurei o aviso de erro antigo ficando de pé depois de um download bom: `setErro(null)` antes de cada pedido, conferido na sequência erro, erro, erro.
- Procurei texto cortado a 320: nada.

## Achados

1. Corrige antes de crescer (rodadas 1 e 2, persiste): nenhuma confirmação depois do download; a pessoa não sabe se baixou e pode gerar um segundo pacote sensível. Dono: E11 ou F10.
2. Corrige antes de crescer (rodadas 1 e 2, persiste): a recusa usa "alterar os dados do município" onde a ação é baixar (mensagem do servidor). Dono: API (catálogo de erros, F02-E03).
3. Anotado (novo nesta rodada, não provocado antes): a falha do servidor mostra só "Erro interno.", sem dizer o que fazer. Dono F02-E03 ou F10-E10.
4. Anotado: foco vai a `BODY` com o botão desabilitado e não volta (acessibilidade, F10-E11).

## Não verificado

- Município suspenso (`acesso_suspenso`) na tela; 401 com renovação na tela (são da QA).
- Firefox e WebKit; abrir o ZIP (é da QA e LGPD).

## Risco residual

Baixo para a tela; o defeito de UX real (sem confirmação) é anterior e conhecido.

## Motivo do humano

Gatilhos da seção 10 disparados pelo diff da etapa: fluxo de erro crítico (falha de saída de dado sensível com a frase da API na tela) e texto de produto (frase da recusa e da falha). Rafael vê as capturas `E11-*` e decide os achados 1 e 2 (pendência já registrada na rodada 2).
