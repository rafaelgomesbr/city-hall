-- =====================================================================
-- 040: a foto de perfil do servidor, como CHAVE de armazenamento.
--
-- O PEDIDO, NA LETRA DE QUEM PAGA
--
-- "A tela de perfil totalmente morta (...) a foto de avatar no topo com o
-- nome e o cargo, com opcao de adicionar ou trocar a foto."
--
-- =====================================================================
-- O QUE FICA GUARDADO, E O QUE NUNCA FICA
--
-- Uma coluna so, `foto_chave`, com a chave do objeto no armazenamento. NUNCA
-- uma URL: toda leitura de arquivo deste produto e pre-assinada e vence em
-- minutos (`apps/api/src/armazenamento/tipos.ts`, regra 2), e uma URL gravada
-- no banco seria uma URL publica com outro nome. Quem quer a foto pede a
-- rota, e a rota assina na hora.
--
-- E nula por padrao, porque a foto e OPCIONAL e escolhida pelo proprio
-- servidor. Ela e dado pessoal DO SERVIDOR, nao do cidadao: nao entra em
-- laudo, nao entra em oficio, nao sai por exportacao de ocorrencia. Onde ela
-- aparece, com quem e compartilhada e por quanto tempo fica esta escrito na
-- secao 2.2 de `docs/PRIVACIDADE.md`.
--
-- =====================================================================
-- A RESTRICAO DE PREFIXO, E POR QUE ELA TEM UM DEGRAU A MAIS
--
-- `evidencias.chave_storage` (001) e `vistorias.assinatura_chave` (009)
-- exigem `tenant/<municipio>/`: e a segunda barreira de isolamento junto do
-- RLS, para uma URL que vaze nao alcancar outro municipio. A foto ganha a
-- mesma barreira e mais uma: o prefixo carrega o id do PROPRIO usuario.
--
-- Sem o degrau, o servidor poderia apontar a propria foto para o objeto de
-- um colega (ou para a fotografia de uma vistoria, que e prova de ato
-- administrativo e mostra a casa de uma familia), e a tela da equipe passaria
-- a mostrar o rosto errado embaixo do nome certo. A rota confere o prefixo
-- antes de gravar; esta restricao existe para a regra valer tambem para a
-- escrita que alguem fizer amanha por outro caminho.
--
-- O padrao completo e `tenant/<organizacao_id>/usuarios/<id>/<arquivo>`, e
-- e a rota `PUT /usuarios/eu/foto` quem monta a chave: o cliente nunca a
-- propoe.
--
-- =====================================================================
-- O QUE ESTA MIGRACAO NAO FAZ
--
-- Nao cria tabela, nao cria funcao privilegiada, nao muda policy. `usuarios`
-- ja tem RLS ativada e forcada (001) e as tres policies da 034 (leitura,
-- insercao e atualizacao, nenhuma de DELETE). A foto entra no UPDATE que ja
-- existe, filtrado pelo proprio id de quem apresentou o token.
-- =====================================================================

ALTER TABLE usuarios ADD COLUMN foto_chave text;

ALTER TABLE usuarios
  ADD CONSTRAINT foto_com_prefixo_do_tenant_e_do_usuario CHECK (
    foto_chave IS NULL
    OR foto_chave LIKE ('tenant/' || organizacao_id::text || '/usuarios/' || id::text || '/%')
  );

COMMENT ON COLUMN usuarios.foto_chave IS
  'Chave da foto de perfil no armazenamento (nunca URL). Opcional, escolhida pelo proprio servidor. Prefixo obrigatorio tenant/<org>/usuarios/<id>/. Ver docs/PRIVACIDADE.md, secao 2.2.';
