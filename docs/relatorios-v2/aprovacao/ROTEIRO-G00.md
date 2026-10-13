# Roteiro de aprovação humana da F00 (para o Rafael aprovar o G00)

- **Para quem:** Rafael, sozinho, passo a passo.
- **Escrito em:** 2026-10-13, sobre o candidato `4b96ea7` (o CI completo do anterior, `18abaee`, deu 9 de 9; o deste foi pedido).
- **Como aprovar:** responda aqui no chat com o código do item e a palavra "aprovo" ou "reprovo, porque ...". Exemplo: "D1 a, D2 ok, T3 aprovo, T5 reprovo, o botão cortou". Quem registra no STATUS sou eu. Você não edita arquivo nenhum.
- **Regra para sempre:** toda vez que algo terminar e precisar de aprovação humana, eu entrego um roteiro neste formato (o que abrir, o que fazer, o que deve acontecer, o que reprova, como responder).

## O que você NÃO precisa mais fazer

Desde a D-30, um revisor independente já provou por execução (e arquivou a prova) as sondas das etapas E04, E07 e E08, os três e2e (E18), os scripts e números (E17), o ambiente (E21), o contrato painel x API (E23), o pacote de saída e o laudo (E11 e E12), a recuperação de senha desligada em produção (E10), o restore do banco (E25) e a linha de base (E01). A "segunda pessoa em máquina limpa" dessas etapas foi substituída pelo CI em Linux e pela leitura a frio de um agente (emenda D-30 do G00). Fica com você só o que depende de decisão, de texto de produto, de percepção visual e de aparelho físico.

## Ordem e tempo

| Parte | Quando | Tempo seu |
| --- | --- | --- |
| 1. Decisões e leituras | agora | 30 a 40 min |
| 2. Telas no navegador e no celular | depois que a segunda validação passar | 1 h 30 a 2 h |
| 3. Aprovar o gate | depois da parte 2 | 10 min |

Por que a parte 2 espera: as 12 etapas corrigidas ainda vão passar por uma segunda validação. Se o revisor reprovar algo, a tela muda e você teria que testar de novo. As decisões da parte 1 não mudam com isso, e algumas (D1 e D4) precisam sair antes, para a segunda validação já ver o estado final.

---

## Parte 1. Decisões e leituras (FEITA em 2026-10-13)

O Rafael respondeu D1 a D4 uma por uma e mandou fazer o recomendado nas demais. Resultado: D1 Expo atualizado; D2 prazo de teste pulado 5 dias; D3 Q1 a Q4 sim e Q5 aviso do `vitest` aceito com dono e prazo; D4 isenções aprovadas e folga fechada; D5 premissa D-25 mantida, **confirmação da Alyson ainda pendente**; D6 CP-19 adiado para a fase 2; D7 e D8 aprovados por instrução, **sem leitura individual**. A tabela abaixo fica como registro do que foi perguntado.

| Código | O que decidir | Onde ler | Minha recomendação |
| --- | --- | --- | --- |
| **D1** (E19) | **FEITA em 2026-10-13:** você escolheu atualizar. Os seis pacotes do Expo subiram, `expo-doctor` 21 de 21 e os testes do app passam (`docs/evidencias-v2/G00/V2-F00-E19/correcao-2/RESUMO.md`). | n/a | n/a |
| **D2** (E02) | Prazo máximo de um teste pulado (hoje 30 dias) e dono padrão (hoje `rafael`). | `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md` | Manter os dois. Responda "D2 ok". |
| **D3** (E03) | Cinco perguntas sobre os vermelhos conhecidos (Q1 a Q5): se a regra de BZ-N:N.3 vale, se os 14 defeitos do campo são reais, se as 13 reescritas de teste ficam, se troca espera fixa por espera com condição, e o que fazer com os avisos de ferramenta. | `docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md`, seção 8.6 (uma tabela, cada linha pede "sim" ou "troque por X") | Sim para Q1 a Q4. Na Q5, corrigir o Expo junto com D1 e deixar os 3 avisos de desenvolvimento do `vitest` como aviso com dono e prazo. Responda "D3 padrão" para aceitar tudo isso. |
| **D4** (E20) | Lista de isenções do portão de conteúdo (arquivos que podem ter o que o portão proíbe, por exemplo travessão em texto de terceiros). | `dc360/packages/shared/test/regras-de-conteudo.test.ts`, bloco de comentário "Isenções" no topo | Aprovar se cada isenção tiver motivo escrito. Responda "D4 ok". |
| **D5** (E24) | Confirmar com a Alyson que a saída a campo será implementada no aplicativo (premissa D-25), e ler a apresentação ajustada. | `docs/evidencias-v2/G00/V2-F00-E24/RESUMO.md` e `docs/apresentacao-produto-alyson.html` | Combinar com a Alyson antes de qualquer demonstração. Responda "D5 confirmado com a Alyson" ou "D5 mudar para X". |
| **D6** (E10) | Provedor de e-mail (CP-19). Hoje a recuperação de senha só funciona com o notificador de teste, e a produção está desligada de propósito. | `docs/roadmap-v2/STATUS.md`, seção 7, linha CP-19 | Registrar "bloqueado para ligar em produção" e decidir o provedor na fase 2. Responda "D6 adiado". |
| **D7** | Textos que o usuário vê: as três frases de sessão (E05), as frases da fila e da senha provisória no campo (E06), as frases finais de sessão (E14) e as 12 frases que trocaram a promessa de segundo plano (E16). | `docs/evidencias-v2/G00/V2-F00-E05/RESUMO.md` (seção "Frases mostradas ao usuário"), `docs/evidencias-v2/G00/V2-F00-E06/correcao-1/RESUMO.md` (frase da pausa por senha provisória) e `docs/evidencias-v2/G00/V2-F00-E16/correcao-1/RESUMO.md` (tabela antes e depois) | Ler com olho de quem usa. Responda "D7 aprovo" ou "D7 troque a frase X por Y". |
| **D8** (E22) | Ler a tabela "afirmação, o que o código faz, ação" e confirmar que nada ficou prometido sem existir. | `docs/evidencias-v2/G00/V2-F00-E22/correcao-1/RESUMO.md` e `docs/evidencias-v2/G00/V2-F00-E12/correcao-1/RESUMO.md` | Responda "D8 aprovo". |

Depois de D1 a D8, o próximo passo é a segunda validação, numa sessão nova: `Valide a F00 no SHA 4b96ea7`.

---

## Parte 2. Telas (depois da segunda validação passar)

### Preparação, uma vez só (15 min)

```bash
cd /c/Projetos/city-hall/dc360
npm run build:shared
# terminal 1: a API, com banco de teste já semeado (não precisa de Postgres instalado)
JWT_SEGREDO="pelo-menos-trinta-e-dois-bytes-aqui" npm run dev:api
# terminal 2: o painel ligado a essa API
VITE_API_URL=http://127.0.0.1:3333 npm run dev
```

- Painel em `http://localhost:5173`. Para 390 px, use o modo responsivo do navegador (F12) com largura 390.
- Senha de todas as contas de teste: `defesa-civil-2026`.
- Contas: Helena (coordenadora) `helena.coutinho@serraalta.exemplo.gov.br`, Jonas (operador) `jonas.ferreira@serraalta.exemplo.gov.br`, Diego (agente) `diego.alves@serraalta.exemplo.gov.br`, Rita (administradora) `rita.lopes@serraalta.exemplo.gov.br`.
- Para recomeçar do zero: Ctrl+C na API e suba de novo (o banco nasce semeado). Clique em "Sair" no painel antes.
- Os detalhes de cada tela estão no guia antigo, `docs/evidencias-v2/G00/GUIA-DE-VALIDACAO-F00.md` (seções A1 a A6 e B1 a B4). Abaixo vai o essencial.

### No navegador (cerca de 1 h)

| Código | Etapa | O que fazer | O que deve acontecer | Reprova se |
| --- | --- | --- | --- | --- |
| **T1** | E13 | Digite só `http://localhost:5173`, entre como Helena, saia, entre como Diego. Repita em 390 px. Depois, como Rita, cadastre e corrija um usuário, uma equipe e um órgão. | Helena cai em "Painel operacional" e Diego em "Meu trabalho". Nunca aparece "Esta página não existe". Cada cadastro mostra um aviso curto acima da barra de baixo. | Aparece "Esta página não existe", o Diego cai na tela da Helena ou o aviso fica sobre a barra. |
| **T2** | E09 | Como Helena, em "Usuários", linha do Jonas: "Redefinir senha", confirme. Anote a senha temporária. Em outra janela, entre como Jonas com ela e defina uma senha nova. Volte e clique "Encerrar sessões". | A janela da senha NÃO fecha com clique fora. O Jonas é obrigado a trocar a senha. Depois de "Encerrar sessões", ele cai na entrada. Em 390 px o botão de confirmação cabe na janela. | A senha antiga continua valendo, a sessão encerrada continua gravando, ou algum botão sai da janela. |
| **T3** | E05 | Com o Jonas logado em outra janela, desative-o (Helena, "Desativar") e faça qualquer ação como Jonas. Reative-o depois. | Aparece "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município." Tentar entrar com a conta desativada dá recusa genérica. | A frase é a de "sessão encerrada" ou "expirou" em vez de "desativada". |
| **T4** | E07 | Como Helena, rebaixe o Jonas de papel enquanto ele está logado e peça a ele para gravar algo. | Ele é derrubado ou perde a permissão na hora, sem esperar o token vencer. | Ele continua gravando com o papel antigo. |
| **T5** | E10 | Na entrada, "Esqueceu a senha?". Peça um email que existe e outro que não. | A frase é a MESMA nos dois casos. Para ver o link chegar, suba a API com `NOTIFICADOR_ARQUIVO` (passo A5 do guia antigo) e abra o link do arquivo: ele funciona uma vez só, e o mesmo link de novo diz que não vale mais. | As frases são diferentes (isso revelaria quem tem conta). |
| **T6** | E11 | Como Rita, em "Organização", "Baixar pacote de saída". Abra o ZIP. | O download termina, o botão diz "Gerando" enquanto trabalha e o ZIP abre com `INDICE.csv`, `LEIA-ME.txt` e a pasta `documentos/`. | 404, arquivo vazio ou ZIP que não abre. |

### No celular, aparelho físico (cerca de 1 h)

Preparação: a API precisa escutar na rede e o app precisa saber o endereço do PC (passo 5 do guia antigo): `HOST=0.0.0.0 URL_PUBLICA=http://<IP-do-PC>:3333 ... npm run dev:api` e, em `dc360/apps/campo`, `DC360_API_URL=http://<IP-do-PC>:3333 npx expo start`, com o Expo Go no iPhone. Esta combinação não tem rodada registrada no repositório: se o Expo Go recusar a versão do SDK, me avise que eu monto outro caminho.

| Código | Etapa | O que fazer | O que deve acontecer | Reprova se |
| --- | --- | --- | --- | --- |
| **T7** | E06 | Como Diego, comece uma coleta sem sinal (modo avião), ligue o sinal e, pelo painel, desative o Diego (ou redefina a senha dele) antes da fila subir. | A fila PAUSA com uma frase clara e a coleta fica guardada, sem botão "Descartar" apagando coisa que o servidor não recebeu. Depois de entrar de novo, a MESMA coleta sobe uma vez. | A coleta some, duplica ou aparece como bloqueada com "Descartar". |
| **T8** | E15 | Comece uma vistoria com foto e assinatura, vá em Perfil e "Sair da conta". Depois, derrube a sessão pelo painel e toque em "Entrar de novo" dentro da vistoria. | O aviso de sair conta o que será apagado (rascunhos, fotos, assinatura). Com a sessão derrubada, "Entrar de novo" preserva o rascunho, as fotos e a assinatura. | Qualquer um dos dois caminhos apaga o rascunho sem avisar. |
| **T9** | E16 | Abra a vistoria com o teclado, abra a câmera e negue a permissão de câmera e de localização. | O primeiro toque com o teclado aberto já age. A câmera respeita a área segura de baixo. A permissão negada oferece "Abrir os ajustes". Nenhum texto promete envio "em segundo plano". | Botão coberto pelo teclado, câmera sob a barra do sistema ou promessa de segundo plano. |
| **T10** | E14 | Ler no aparelho as frases finais da sessão encerrada. | São claras e dizem o que fazer. | Frase confusa. |

---

## Parte 3. Aprovar o gate G00

1. Quando a segunda validação passar e você terminar as partes 1 e 2, me diga "aprovo o G00".
2. O gatekeeper recomenda o gate e eu escrevo o `GATE.md` com o resultado e a sua aprovação.
3. **O merge em master é seu** (com commit de merge, nunca squash). Atenção: o painel na Vercel (`dc360-painel-web`) é publicado automaticamente a partir do master, e a API fica na Fly e é publicada à parte. As correções de acesso da fase 1 (E04, E05, E06, migrações 047 e 048) precisam ir juntas para produção: painel novo com API velha, ou o contrário, dá mensagem errada para o usuário. Antes do merge, eu preparo o plano de implantação em ordem (migração, API, painel) para você aprovar.
4. Depois do merge, o CI de master precisa ficar verde. Só então a fase 2 (F01) começa.

## O que reprova a aprovação

Qualquer item da parte 1 que você recusar volta para correção, e qualquer "reprovo" nas partes 2 ou 3 reabre a etapa correspondente. O STATUS registra a data, o item e o motivo que você disse.
