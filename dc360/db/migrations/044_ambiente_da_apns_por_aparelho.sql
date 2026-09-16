-- =====================================================================
-- 044: cada aparelho iOS diz com qual APNs fala, e o servidor deixa de ter
--      um ambiente so para todos.
--
-- O DEFEITO (revisao de operacao, 15/09/2026). A Apple tem dois servicos de
-- push que nao se falam, `api.push.apple.com` e `api.sandbox.push.apple.com`,
-- e qual vale e decidido pelo `aps-environment` com que o BINARIO foi
-- assinado: o que sai do Xcode fala com o sandbox, o que sai do TestFlight e
-- da loja fala com producao. Ate aqui o servidor tinha UMA escolha
-- (`APNS_AMBIENTE`, `apps/api/src/config.ts`) para todos os aparelhos.
--
-- Com um agente no binario do Xcode e outro no do TestFlight, o do ambiente
-- errado recebe `BadDeviceToken`, que esta na lista de recusas que significam
-- "este aparelho nao existe mais", e o varredor faz o que deve fazer com essa
-- resposta: REVOGA o aparelho. O agente reinstala, registra de novo, e recebe
-- de novo a revogacao. Sem erro em lugar nenhum, porque cada peca esta
-- funcionando como escrita. O piloto e exatamente o momento em que os dois
-- binarios convivem.
--
-- O DESENHO. O aplicativo diz, no registro (`POST /aparelhos`), em qual
-- ambiente foi compilado, decidido no build pela MESMA expressao que escreve
-- o `aps-environment` (`apps/campo/app.config.ts`); esta coluna guarda; e o
-- servidor mantem DOIS provedores da Apple, roteando pela coluna
-- (`apps/api/src/push/envio.ts`). `APNS_AMBIENTE` vira o padrao de quem
-- registra sem o campo (aplicativo instalado antes desta data) e das linhas
-- que ja existiam.
--
-- O VOCABULARIO e o de `APNS_AMBIENTE` (`producao` | `teste`), e nao o da
-- Apple (`production` | `sandbox`), para a coluna, a variavel do servidor e o
-- campo do aplicativo dizerem a mesma palavra. Fora dos dois, CHECK recusa:
-- cair num padrao calado diante de `sandbox` reproduziria o defeito acima com
-- alguem convencido de ter configurado.
--
-- Android nao tem sandbox separado; a coluna existe na linha dele com o
-- padrao e nao e lida. Uma coluna nula so para Android seria mais um estado
-- para o codigo tratar sem ganhar nada.
--
-- AS LINHAS QUE JA EXISTEM recebem o `APNS_AMBIENTE` do servidor, se quem
-- migra o informar, e `producao` se nao. A migracao e SQL puro e nao le
-- variavel de ambiente; o aplicador (`db/src/cli.ts`) le `APNS_AMBIENTE` e a
-- poe na configuracao de sessao `dc360.apns_ambiente` antes de aplicar, e e
-- isso que o UPDATE abaixo consulta. Sem a variavel, `current_setting` com
-- `missing_ok` devolve nulo e vale `producao`, que e o padrao da propria
-- variavel. Vale pouco na pratica: o aplicativo registra a ficha de novo a
-- cada abertura, com o campo, e a linha se corrige sozinha na primeira
-- abertura depois deste deploy. A janela que este UPDATE fecha e a que vai
-- do deploy ate essa abertura.
--
-- Sem policy nova, sem GRANT novo: `aparelhos` ja tem RLS forcada com
-- isolamento por municipio (016), e o GRANT de SELECT, INSERT e UPDATE e por
-- tabela, entao alcanca a coluna. O isolamento nao muda.
-- =====================================================================

ALTER TABLE aparelhos
  ADD COLUMN ambiente text NOT NULL DEFAULT 'producao'
    CONSTRAINT aparelhos_ambiente_check CHECK (ambiente IN ('producao','teste'));

UPDATE aparelhos
   SET ambiente = coalesce(
         nullif(current_setting('dc360.apns_ambiente', true), ''),
         'producao'
       )
 WHERE coalesce(nullif(current_setting('dc360.apns_ambiente', true), ''), 'producao')
       IN ('producao','teste');

COMMENT ON COLUMN aparelhos.ambiente IS
  'Com qual APNs este aparelho fala: producao (binario de loja e TestFlight) ou '
  'teste (binario do Xcode). Vem do registro feito pelo aplicativo, decidido no '
  'build; sem o campo vale o APNS_AMBIENTE do servidor. So o iOS le. Migracao 044.';
