-- =====================================================================
-- Semente de desenvolvimento e de demonstração.
--
-- Um único arquivo, executado tanto pelo painel web em modo local quanto pela
-- API quando ela sobe sem DATABASE_URL. Manter duas sementes divergiria: o
-- protocolo que aparece na tela deixaria de ser o mesmo que a API devolve.
--
-- DOIS MUNICÍPIOS DE PROPÓSITO. Um só esconderia o problema mais caro deste
-- produto, que é dado de uma prefeitura aparecer na tela de outra. Com dois,
-- trocar de organização é uma demonstração de isolamento, não configuração.
--
-- Todos os dados são fictícios. Nomes, endereços e coordenadas são de
-- exemplo, nunca de pessoas reais.
--
-- A senha de todas as contas é `defesa-civil-2026`. O hash abaixo está no
-- repositório de propósito: é fixture de desenvolvimento, e o arquivo não é
-- executado em produção (a API exige DATABASE_URL lá, e este arquivo só roda
-- no caminho do banco efêmero). Se algum dia virar semente de ambiente real,
-- a senha tem que ser trocada na primeira entrada.
-- =====================================================================

-- Identificadores fixos: com uuid aleatório, cada reinício mudaria as URLs e
-- nenhum teste de ponta a ponta poderia apontar para um registro específico.
INSERT INTO organizacoes (id, nome, municipio, uf) VALUES
  ('11111111-1111-4111-8111-000000000001',
   'Coordenadoria Municipal de Proteção e Defesa Civil de Serra Alta', 'Serra Alta', 'MG'),
  ('22222222-2222-4222-8222-000000000002',
   'Coordenadoria Municipal de Proteção e Defesa Civil de Vale Fundo', 'Vale Fundo', 'MG');

INSERT INTO equipes (id, organizacao_id, nome, especialidade) VALUES
  ('11111111-1111-4111-8111-0000000000e1', '11111111-1111-4111-8111-000000000001', 'Equipe Alfa', 'Vistoria geotécnica'),
  ('11111111-1111-4111-8111-0000000000e2', '11111111-1111-4111-8111-000000000001', 'Equipe Bravo', 'Alagamento e drenagem'),
  ('11111111-1111-4111-8111-0000000000e3', '11111111-1111-4111-8111-000000000001', 'Equipe Charlie', 'Plantão noturno'),
  ('22222222-2222-4222-8222-0000000000e1', '22222222-2222-4222-8222-000000000002', 'Equipe Única', 'Atendimento geral');

INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash) VALUES
  ('11111111-1111-4111-8111-0000000000d1', '11111111-1111-4111-8111-000000000001',
   'Helena Vasques Coutinho', 'SA-1042', 'helena.coutinho@serraalta.exemplo.gov.br', 'coordenador', NULL,
   'scrypt$65536$8$1$QV3wEJKmnMIZMUVfEoAEbA$IvJ9l1OPbhawvM0cuoJzsoIsbqQP7E7XeczItgsqFCA'),
  ('11111111-1111-4111-8111-0000000000d2', '11111111-1111-4111-8111-000000000001',
   'Jonas Ferreira', 'SA-2211', 'jonas.ferreira@serraalta.exemplo.gov.br', 'operador', NULL,
   'scrypt$65536$8$1$QV3wEJKmnMIZMUVfEoAEbA$IvJ9l1OPbhawvM0cuoJzsoIsbqQP7E7XeczItgsqFCA'),
  ('11111111-1111-4111-8111-0000000000d3', '11111111-1111-4111-8111-000000000001',
   'Diego Nakamura Alves', 'SA-3390', 'diego.alves@serraalta.exemplo.gov.br', 'agente_campo',
   '11111111-1111-4111-8111-0000000000e1',
   'scrypt$65536$8$1$QV3wEJKmnMIZMUVfEoAEbA$IvJ9l1OPbhawvM0cuoJzsoIsbqQP7E7XeczItgsqFCA'),
  ('11111111-1111-4111-8111-0000000000d4', '11111111-1111-4111-8111-000000000001',
   'Rita Sampaio Lopes', 'SA-3391', 'rita.lopes@serraalta.exemplo.gov.br', 'administrador', NULL,
   'scrypt$65536$8$1$QV3wEJKmnMIZMUVfEoAEbA$IvJ9l1OPbhawvM0cuoJzsoIsbqQP7E7XeczItgsqFCA'),
  ('22222222-2222-4222-8222-0000000000d1', '22222222-2222-4222-8222-000000000002',
   'Aurélio Prates Machado', 'VF-0101', 'aurelio.machado@valefundo.exemplo.gov.br', 'coordenador', NULL,
   'scrypt$65536$8$1$QV3wEJKmnMIZMUVfEoAEbA$IvJ9l1OPbhawvM0cuoJzsoIsbqQP7E7XeczItgsqFCA'),
  ('22222222-2222-4222-8222-0000000000d2', '22222222-2222-4222-8222-000000000002',
   'Simone Vieira da Paz', 'VF-0102', 'simone.paz@valefundo.exemplo.gov.br', 'operador', NULL,
   'scrypt$65536$8$1$QV3wEJKmnMIZMUVfEoAEbA$IvJ9l1OPbhawvM0cuoJzsoIsbqQP7E7XeczItgsqFCA'),
  ('22222222-2222-4222-8222-0000000000d3', '22222222-2222-4222-8222-000000000002',
   'Tarcísio Bueno Ramos', 'VF-0103', 'tarcisio.ramos@valefundo.exemplo.gov.br', 'agente_campo',
   '22222222-2222-4222-8222-0000000000e1',
   'scrypt$65536$8$1$QV3wEJKmnMIZMUVfEoAEbA$IvJ9l1OPbhawvM0cuoJzsoIsbqQP7E7XeczItgsqFCA');

-- ---------------------------------------------------------------------
-- Ocorrências. As datas são relativas a agora, então a fila sempre parece
-- viva: prazo vencendo, chamado de minutos atrás, encerramento da semana.
-- ---------------------------------------------------------------------
INSERT INTO ocorrencias (
  id, organizacao_id, protocolo, tipo, status, severidade,
  vulnerabilidade_presente, vulnerabilidade_descricao,
  endereco, latitude, longitude, solicitante_nome, solicitante_contato,
  canal_entrada, descricao, equipe_id, prazo_em, criado_em,
  encerrado_em, motivo_encerramento
) VALUES
  ('11111111-1111-4111-8111-0000000000c1', '11111111-1111-4111-8111-000000000001',
   '000471/2026', 'deslizamento', 'em_campo', 'critica',
   true, 'Idosa acamada e criança de 4 anos em uma das residências.',
   'Rua das Acácias, 245, Morro do Cruzeiro', -22.4187, -45.4523,
   'Marilda Souza Prado', '(35) 99871-4402', 'telefone',
   'Talude atrás de duas casas cedeu depois da chuva da madrugada. Moradores relatam trinca nova na parede dos fundos e barulho de estalo.',
   '11111111-1111-4111-8111-0000000000e1',
   now() - interval '3 hours' + interval '4 hours', now() - interval '3 hours', NULL, NULL),

  ('11111111-1111-4111-8111-0000000000c2', '11111111-1111-4111-8111-000000000001',
   '000472/2026', 'alagamento', 'triagem', 'alta',
   false, NULL,
   'Avenida Beira Rio, 1180, Centro', -22.4231, -45.4491,
   'Jonas Ferreira Lima', '(35) 99612-8830', 'whatsapp',
   'Bueiro entupido, água entrando em três estabelecimentos comerciais. Nível cerca de 30 cm na calçada.',
   NULL, now() - interval '6 hours' + interval '24 hours', now() - interval '6 hours', NULL, NULL),

  ('11111111-1111-4111-8111-0000000000c3', '11111111-1111-4111-8111-000000000001',
   '000473/2026', 'colapso_edificacao', 'vistoria_concluida', 'alta',
   false, NULL,
   'Travessa São Benedito, 57, Vila Operária', -22.4302, -45.4610,
   'Cleuza Ramos de Andrade', '(35) 98844-2019', 'presencial',
   'Muro de arrimo de três metros com barriga aparente, encostado na área de serviço do vizinho.',
   '11111111-1111-4111-8111-0000000000e2',
   now() - interval '28 hours' + interval '24 hours', now() - interval '28 hours', NULL, NULL),

  ('11111111-1111-4111-8111-0000000000c4', '11111111-1111-4111-8111-000000000001',
   '000474/2026', 'vendaval', 'providencia_pendente', 'media',
   false, NULL,
   'Rua Doutor Peixoto, 909, Jardim Bela Vista', -22.4155, -45.4402,
   'Adenilson Barbosa', '(35) 99205-7714', 'telefone',
   'Telhado de galpão desabou parcialmente sobre a via. Fiação de baixa tensão comprometida.',
   '11111111-1111-4111-8111-0000000000e1',
   now() - interval '52 hours' + interval '48 hours', now() - interval '52 hours', NULL, NULL),

  ('11111111-1111-4111-8111-0000000000c5', '11111111-1111-4111-8111-000000000001',
   '000475/2026', 'enxurrada', 'registrada', NULL,
   false, NULL,
   'Estrada do Retiro, km 4, zona rural', -22.4498, -45.4728,
   'Sebastiana Alves Nogueira', '(35) 99133-6621', 'telefone',
   'Ponte de madeira levada pela correnteza. Quatro famílias sem acesso pela via principal.',
   NULL, NULL, now() - interval '1 hour', NULL, NULL),

  ('11111111-1111-4111-8111-0000000000c6', '11111111-1111-4111-8111-000000000001',
   '000476/2026', 'incendio_urbano', 'encerrada', 'media',
   false, NULL,
   'Rua Coronel Amaral, 320, Centro', -22.4210, -45.4470,
   'Regina Coeli Martins', '(35) 99400-1122', 'telefone',
   'Princípio de incêndio em depósito de materiais recicláveis, já controlado pelo Corpo de Bombeiros.',
   NULL, now() - interval '96 hours' + interval '48 hours', now() - interval '96 hours',
   now() - interval '76 hours',
   'Vistoria constatou estrutura íntegra e sem risco remanescente. Corpo de Bombeiros já havia extinguido o foco. Orientação de armazenamento entregue ao proprietário.'),

  ('11111111-1111-4111-8111-0000000000c7', '11111111-1111-4111-8111-000000000001',
   '000477/2026', 'granizo', 'encerrada', 'baixa',
   false, NULL,
   'Rua das Palmeiras, 88, Jardim Bela Vista', -22.4142, -45.4438,
   'Elias Monteiro da Cruz', '(35) 98700-5540', 'whatsapp',
   'Telhas quebradas em residência unifamiliar após chuva de granizo.',
   NULL, now() - interval '140 hours' + interval '72 hours', now() - interval '140 hours',
   now() - interval '120 hours',
   'Dano restrito a cobertura, sem risco estrutural. Família encaminhada à Assistência Social para auxílio de material.'),

  ('11111111-1111-4111-8111-0000000000c8', '11111111-1111-4111-8111-000000000001',
   '000478/2026', 'inundacao', 'em_campo', 'alta',
   true, 'Duas famílias com crianças pequenas, sem parentes na cidade para acolhimento.',
   'Rua Ribeirão Fundo, 402, Bairro Nossa Senhora', -22.4266, -45.4555,
   'Wanderley Pinto de Sá', '(35) 99988-3301', 'telefone',
   'Córrego transbordou e atingiu o quintal de cinco residências. Moradores retirando móveis.',
   '11111111-1111-4111-8111-0000000000e2',
   now() - interval '9 hours' + interval '24 hours', now() - interval '9 hours', NULL, NULL),

  ('22222222-2222-4222-8222-0000000000c1', '22222222-2222-4222-8222-000000000002',
   '000112/2026', 'deslizamento', 'triagem', 'alta',
   false, NULL,
   'Rua Nova Esperança, 15, Alto do Pinheiro', -21.9880, -45.2140,
   'Teresinha Gomes Batista', '(35) 99771-2288', 'telefone',
   'Escorregamento de solo no fundo do lote, cerca de dois metros de altura.',
   NULL, now() - interval '5 hours' + interval '24 hours', now() - interval '5 hours', NULL, NULL),

  ('22222222-2222-4222-8222-0000000000c2', '22222222-2222-4222-8222-000000000002',
   '000113/2026', 'alagamento', 'registrada', NULL,
   false, NULL,
   'Praça Matriz, 2, Centro', -21.9912, -45.2098,
   'Osvaldo Camargo Neto', '(35) 99555-6612', 'presencial',
   'Acúmulo de água em frente ao posto de saúde após chuva forte.',
   NULL, NULL, now() - interval '2 hours', NULL, NULL);

-- ---------------------------------------------------------------------
-- Vistorias já sincronizadas, com as duas marcas de tempo diferentes: é o
-- que acontece em toda coleta feita sem sinal.
-- ---------------------------------------------------------------------
INSERT INTO vistorias (
  id, organizacao_id, ocorrencia_id, agente_id, checklist, gps_precisao_metros,
  assinante_nome, observacoes, coletada_em, sincronizada_em, idempotency_key
) VALUES
  ('11111111-1111-4111-8111-0000000000f1', '11111111-1111-4111-8111-000000000001',
   '11111111-1111-4111-8111-0000000000c3', '11111111-1111-4111-8111-0000000000d3',
   '[{"chave":"risco_iminente","resposta":true},
     {"chave":"evacuacao_necessaria","resposta":false},
     {"chave":"interdicao_indicada","resposta":true},
     {"chave":"acionar_outro_orgao","resposta":true}]'::jsonb,
   6.2, 'Cleuza Ramos de Andrade',
   'Vistoria realizada com a moradora presente. Registro fotográfico anexado.',
   now() - interval '25 hours', now() - interval '22 hours',
   '11111111-1111-4111-8111-0000000000a1'),

  ('11111111-1111-4111-8111-0000000000f2', '11111111-1111-4111-8111-000000000001',
   '11111111-1111-4111-8111-0000000000c4', '11111111-1111-4111-8111-0000000000d3',
   '[{"chave":"risco_iminente","resposta":true},
     {"chave":"evacuacao_necessaria","resposta":false},
     {"chave":"interdicao_indicada","resposta":true},
     {"chave":"acionar_outro_orgao","resposta":true}]'::jsonb,
   4.8, 'Adenilson Barbosa',
   'Área isolada com fita zebrada. Companhia de energia acionada no local.',
   now() - interval '49 hours', now() - interval '48 hours',
   '11111111-1111-4111-8111-0000000000a2');

-- ---------------------------------------------------------------------
-- Um imóvel interditado, e ele fica interditado na demonstração de propósito.
--
-- A ocorrência c3 teve vistoria indicando interdição, e o termo foi emitido há
-- quase um mês. Ninguém levantou. É exatamente o caso que o cartão "Imóveis
-- interditados" do painel existe para tornar visível: interdição não tem
-- prazo, ninguém é cobrado por ela, e enquanto o levantamento não é registrado
-- tem família fora de casa.
--
-- Na demonstração isso vale mais que um banco arrumado: quem assiste vê o
-- sistema apontando um problema real da própria casa, em vez de mostrar tudo
-- verde.
-- ---------------------------------------------------------------------
UPDATE ocorrencias
   SET interditada_em = now() - interval '27 days',
       interditada_por = '11111111-1111-4111-8111-0000000000d1'
 WHERE id = '11111111-1111-4111-8111-0000000000c3';

INSERT INTO trilha_eventos (
  organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
  origem, ocorrido_em, detalhe
) VALUES
  ('11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-0000000000c3',
   'documento_emitido', '11111111-1111-4111-8111-0000000000d1',
   'Helena Vasques Coutinho', 'coordenador', 'escritorio',
   now() - interval '27 days',
   '{"documento":"termo_de_interdicao","vistoriaId":"11111111-1111-4111-8111-0000000000f1","formato":"html"}'::jsonb);

INSERT INTO providencias (
  organizacao_id, ocorrencia_id, orgao_destino, descricao, responsavel, prazo_em, encaminhada_em
) VALUES
  ('11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-0000000000c4',
   'Secretaria de Obras',
   'Remoção da estrutura metálica sobre a via e escoramento provisório do que restou do galpão.',
   'Engenheiro de plantão da Secretaria de Obras',
   now() + interval '24 hours', now() - interval '47 hours');

-- ---------------------------------------------------------------------
-- Trilha auditável das ocorrências semeadas.
--
-- Sem isto, a tela de detalhe abriria com a linha do tempo vazia e passaria a
-- impressão de que o sistema não registra quem fez o quê, que é justamente o
-- oposto do que ele faz.
-- ---------------------------------------------------------------------
INSERT INTO trilha_eventos (
  organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe
)
SELECT o.organizacao_id, o.id, 'registro',
       u.id, u.nome, 'operador', 'escritorio', o.criado_em,
       jsonb_build_object('canal', o.canal_entrada, 'protocolo', o.protocolo)
  FROM ocorrencias o
  JOIN usuarios u ON u.organizacao_id = o.organizacao_id AND u.papel = 'operador';

INSERT INTO trilha_eventos (
  organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe
)
SELECT o.organizacao_id, o.id, 'triagem',
       u.id, u.nome, 'coordenador', 'escritorio', o.criado_em + interval '24 minutes',
       jsonb_build_object('severidade', o.severidade)
  FROM ocorrencias o
  JOIN usuarios u ON u.organizacao_id = o.organizacao_id AND u.papel = 'coordenador'
 WHERE o.severidade IS NOT NULL;

INSERT INTO trilha_eventos (
  organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe
)
SELECT o.organizacao_id, o.id, 'despacho',
       u.id, u.nome, 'coordenador', 'escritorio', o.criado_em + interval '48 minutes',
       jsonb_build_object('equipe', e.nome)
  FROM ocorrencias o
  JOIN equipes e ON e.id = o.equipe_id
  JOIN usuarios u ON u.organizacao_id = o.organizacao_id AND u.papel = 'coordenador';

INSERT INTO trilha_eventos (
  organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe
)
SELECT v.organizacao_id, v.ocorrencia_id, 'vistoria',
       v.agente_id, u.nome, 'agente_campo', 'campo', v.coletada_em,
       jsonb_build_object('gpsPrecisaoMetros', v.gps_precisao_metros, 'assinante', v.assinante_nome)
  FROM vistorias v JOIN usuarios u ON u.id = v.agente_id;

INSERT INTO trilha_eventos (
  organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe
)
SELECT p.organizacao_id, p.ocorrencia_id, 'providencia',
       u.id, u.nome, 'coordenador', 'escritorio', p.encaminhada_em,
       jsonb_build_object('orgao', p.orgao_destino, 'responsavel', p.responsavel)
  FROM providencias p
  JOIN usuarios u ON u.organizacao_id = p.organizacao_id AND u.papel = 'coordenador';

INSERT INTO trilha_eventos (
  organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe
)
SELECT o.organizacao_id, o.id, 'encerramento',
       u.id, u.nome, 'coordenador', 'escritorio', o.encerrado_em,
       jsonb_build_object('motivo', o.motivo_encerramento)
  FROM ocorrencias o
  JOIN usuarios u ON u.organizacao_id = o.organizacao_id AND u.papel = 'coordenador'
 WHERE o.encerrado_em IS NOT NULL;

-- A sequência precisa continuar de onde a semente parou, senão o primeiro
-- registro novo colide com um protocolo que já existe.
INSERT INTO protocolo_sequencias (organizacao_id, ano, ultimo)
SELECT organizacao_id,
       extract(year FROM now())::integer,
       max(split_part(protocolo, '/', 1)::integer)
  FROM ocorrencias
 GROUP BY organizacao_id
ON CONFLICT (organizacao_id, ano) DO UPDATE SET ultimo = EXCLUDED.ultimo;
