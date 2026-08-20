/* Base mock canônica do protótipo. Congelada na carga: app.js clona este objeto
   para o estado de trabalho e usa este arquivo apenas como fonte de restauração. */
(function () {
  "use strict";

  function congelarProfundo(valor) {
    if (valor && typeof valor === "object" && !Object.isFrozen(valor)) {
      Object.getOwnPropertyNames(valor).forEach(function (chave) {
        congelarProfundo(valor[chave]);
      });
      Object.freeze(valor);
    }
    return valor;
  }

  var DADOS_INICIAIS = {
    municipio: {
      nome: "Serra Alta",
      uf: "MG",
      orgao: "Defesa Civil Municipal de Serra Alta",
      populacaoEstimativa: 84000
    },

    tiposCobrade: [
      "Deslizamento",
      "Inundação",
      "Alagamento",
      "Enxurrada",
      "Vendaval",
      "Granizo",
      "Colapso de edificação",
      "Incêndio urbano"
    ],

    severidades: ["baixa", "media", "alta", "critica"],

    statusOcorrencia: [
      { chave: "rascunho", rotulo: "Rascunho" },
      { chave: "registrada", rotulo: "Registrada" },
      { chave: "triagem", rotulo: "Em triagem" },
      { chave: "em_campo", rotulo: "Em campo" },
      { chave: "vistoria_concluida", rotulo: "Vistoria concluída" },
      { chave: "providencia_pendente", rotulo: "Providência pendente" },
      { chave: "encerrada", rotulo: "Encerrada" }
    ],

    equipes: [
      { id: "alfa", nome: "Equipe Alfa", membros: ["Rogério Nascimento", "Patrícia Lemos"] },
      { id: "bravo", nome: "Equipe Bravo", membros: ["Wellington Costa", "Ísis Andrade"] },
      { id: "charlie", nome: "Equipe Charlie", membros: ["Marcelo Tavares", "Débora Nunes"] }
    ],

    secretarias: [
      "Secretaria de Obras",
      "Secretaria de Assistência Social",
      "Secretaria de Saúde",
      "Secretaria de Meio Ambiente"
    ],

    usuariosPorPerfil: {
      coordenador: { nome: "Marina Albuquerque", cargo: "Coordenadora de Defesa Civil", matricula: "DC-0142" },
      operador: { nome: "Jonas Ferreira", cargo: "Operador de plantão", matricula: "DC-0288" },
      "agente-campo": { nome: "Rogério Nascimento", cargo: "Agente de campo, Equipe Alfa", matricula: "DC-0355" }
    },

    /* prazoOffsetHoras e criadoOffsetHoras são relativos ao momento em que o protótipo
       carrega (Date.now() em app.js), para a demo nunca mostrar prazo vencido errado
       nem contador zerado, não importa em que data ela aconteça. */
    ocorrencias: [
      {
        protocolo: "000482/2026",
        tipo: "Deslizamento",
        endereco: "Rua das Acácias, 245, Bairro Vista Alegre",
        mapaX: 62, mapaY: 41,
        gps: { lat: -19.9812, lng: -43.9021 },
        severidade: "alta",
        vulnerabilidade: true,
        vulnerabilidadeDescricao: "Moradora idosa com mobilidade reduzida no imóvel",
        solicitante: "Dona Zulmira Aparecida dos Santos, 78 anos",
        descricao: "Rachadura em encosta atrás do imóvel, após chuva forte na madrugada.",
        status: "em_campo",
        equipeId: "alfa",
        criadoOffsetHoras: -2,
        despachadoOffsetHoras: -1,
        prazoOffsetHoras: 23,
        protagonista: true,
        vinculadaA: "000415/2026"
      },
      {
        protocolo: "000415/2026",
        tipo: "Deslizamento",
        endereco: "Rua das Acácias, 245, Bairro Vista Alegre",
        mapaX: 62, mapaY: 41,
        gps: { lat: -19.9812, lng: -43.9021 },
        severidade: "media",
        vulnerabilidade: false,
        solicitante: "Zulmira Aparecida dos Santos",
        descricao: "Trinca inicial na base do talude, após período chuvoso.",
        status: "encerrada",
        equipeId: "alfa",
        criadoOffsetHoras: -144,
        despachadoOffsetHoras: -140,
        prazoOffsetHoras: -116,
        encerradaOffsetHoras: -120,
        motivoEncerramento: "Risco considerado controlado após limpeza de bueiros e poda de vegetação."
      },
      {
        protocolo: "000487/2026",
        tipo: "Incêndio urbano",
        endereco: "Avenida Industrial, 1180, Bairro Industrial",
        mapaX: 78, mapaY: 22,
        gps: { lat: -19.9654, lng: -43.8890 },
        severidade: "critica",
        vulnerabilidade: false,
        solicitante: "Galpão Metalúrgica Serra Alta Ltda.",
        descricao: "Princípio de incêndio em depósito de material inflamável.",
        status: "em_campo",
        equipeId: "bravo",
        criadoOffsetHoras: -1,
        despachadoOffsetHoras: -1,
        prazoOffsetHoras: 2
      },
      {
        protocolo: "000463/2026",
        tipo: "Alagamento",
        endereco: "Rua Beira Rio, 88, Bairro Porto Novo",
        mapaX: 35, mapaY: 68,
        gps: { lat: -19.9930, lng: -43.9180 },
        severidade: "alta",
        vulnerabilidade: true,
        vulnerabilidadeDescricao: "Duas crianças pequenas residem no imóvel",
        solicitante: "Carlos Eduardo Ribeiro",
        descricao: "Água invadiu o térreo do imóvel durante a madrugada.",
        status: "em_campo",
        equipeId: "alfa",
        criadoOffsetHoras: -30,
        despachadoOffsetHoras: -29,
        prazoOffsetHoras: -6
      },
      {
        protocolo: "000470/2026",
        tipo: "Colapso de edificação",
        endereco: "Rua dos Ipês, 512, Centro",
        mapaX: 50, mapaY: 50,
        gps: { lat: -19.9755, lng: -43.9110 },
        severidade: "alta",
        vulnerabilidade: true,
        vulnerabilidadeDescricao: "Imóvel comercial com apartamentos residenciais no pavimento superior",
        solicitante: "Síndico do Edifício Ipês",
        descricao: "Fissura estrutural visível na fachada após obra vizinha.",
        status: "registrada",
        equipeId: null,
        criadoOffsetHoras: -5,
        prazoOffsetHoras: -3
      },
      {
        protocolo: "000455/2026",
        tipo: "Enxurrada",
        endereco: "Estrada do Moinho, km 4, Zona Rural",
        mapaX: 15, mapaY: 30,
        gps: { lat: -19.9430, lng: -43.9560 },
        severidade: "media",
        vulnerabilidade: false,
        solicitante: "Associação de Moradores da Zona Rural",
        descricao: "Erosão na margem da estrada após chuva intensa.",
        status: "em_campo",
        equipeId: "charlie",
        criadoOffsetHoras: -42,
        despachadoOffsetHoras: -40,
        prazoOffsetHoras: -18
      },
      {
        protocolo: "000398/2026",
        tipo: "Vendaval",
        endereco: "Rua das Palmeiras, 300, Jardim Esperança",
        mapaX: 25, mapaY: 55,
        gps: { lat: -19.9880, lng: -43.9410 },
        severidade: "baixa",
        vulnerabilidade: false,
        solicitante: "Beatriz Monteiro",
        descricao: "Queda de galhos sobre o telhado da garagem.",
        status: "encerrada",
        equipeId: "bravo",
        criadoOffsetHoras: -300,
        despachadoOffsetHoras: -298,
        prazoOffsetHoras: -274,
        encerradaOffsetHoras: -280,
        motivoEncerramento: "Danos avaliados como leves, sem necessidade de interdição."
      },
      {
        protocolo: "000493/2026",
        tipo: "Granizo",
        endereco: "Rua Sete de Setembro, 76, Centro",
        mapaX: 48, mapaY: 46,
        gps: { lat: -19.9770, lng: -43.9095 },
        severidade: null,
        vulnerabilidade: false,
        solicitante: "Antônio Marcos Vieira",
        descricao: "Danos em telhas após temporal com granizo. Registro iniciado, aguardando confirmação de dados.",
        status: "rascunho",
        equipeId: null,
        criadoOffsetHoras: -0.5,
        prazoOffsetHoras: null
      },
      {
        protocolo: "000479/2026",
        tipo: "Inundação",
        endereco: "Rua Marginal, 1500, Bairro Baixada",
        mapaX: 40, mapaY: 72,
        gps: { lat: -19.9960, lng: -43.9220 },
        severidade: "alta",
        vulnerabilidade: true,
        vulnerabilidadeDescricao: "Idoso acamado no imóvel",
        solicitante: "Regina Costa Pereira",
        descricao: "Nível da água subiu acima de 40 centímetros no interior do imóvel.",
        status: "vistoria_concluida",
        equipeId: "charlie",
        criadoOffsetHoras: -20,
        despachadoOffsetHoras: -19,
        prazoOffsetHoras: -4,
        vistoriaConcluidaOffsetHoras: -4
      },
      {
        protocolo: "000488/2026",
        tipo: "Deslizamento",
        endereco: "Alameda das Grevíleas, 60, Morro do Sol",
        mapaX: 68, mapaY: 30,
        gps: { lat: -19.9680, lng: -43.8960 },
        severidade: "media",
        vulnerabilidade: false,
        solicitante: "Fábio Henrique Souza",
        descricao: "Pequeno deslizamento de terra no talude do fundo do lote.",
        status: "triagem",
        equipeId: null,
        criadoOffsetHoras: -1.5,
        prazoOffsetHoras: 40
      },
      {
        protocolo: "000440/2026",
        tipo: "Colapso de edificação",
        endereco: "Rua Coronel Aristides, 22, Centro Histórico",
        mapaX: 52, mapaY: 48,
        gps: { lat: -19.9748, lng: -43.9130 },
        severidade: "alta",
        vulnerabilidade: false,
        solicitante: "Museu Municipal de Serra Alta",
        descricao: "Infiltração comprometeu parte da laje do telhado histórico.",
        status: "providencia_pendente",
        equipeId: "alfa",
        criadoOffsetHoras: -96,
        despachadoOffsetHoras: -94,
        prazoOffsetHoras: -60,
        vistoriaConcluidaOffsetHoras: -60,
        providencia: {
          secretaria: "Secretaria de Obras",
          descricao: "Escoramento emergencial da laje e avaliação estrutural completa.",
          responsavel: "Eng. Heitor Braga",
          prazoOffsetHoras: 30
        }
      },
      {
        protocolo: "000491/2026",
        tipo: "Alagamento",
        endereco: "Travessa das Orquídeas, 15, Bairro Flamboyant",
        mapaX: 30, mapaY: 60,
        gps: { lat: -19.9895, lng: -43.9350 },
        severidade: "baixa",
        vulnerabilidade: false,
        solicitante: "Cláudia Rocha Martins",
        descricao: "Água acumulada no quintal após chuva forte.",
        status: "em_campo",
        equipeId: "bravo",
        criadoOffsetHoras: -8,
        despachadoOffsetHoras: -7,
        prazoOffsetHoras: 10
      },
      {
        protocolo: "000466/2026",
        tipo: "Vendaval",
        endereco: "Rua Governador Valadares, 410, Bairro Aeroporto",
        mapaX: 80, mapaY: 60,
        gps: { lat: -19.9990, lng: -43.8870 },
        severidade: "media",
        vulnerabilidade: false,
        solicitante: "Escola Municipal Aeroporto",
        descricao: "Vento forte danificou parte da cobertura da quadra escolar.",
        status: "registrada",
        equipeId: null,
        criadoOffsetHoras: -4,
        prazoOffsetHoras: 36
      },
      {
        protocolo: "000495/2026",
        tipo: "Enxurrada",
        endereco: "Rua Beira Rio, 210, Bairro Porto Novo",
        mapaX: 33, mapaY: 66,
        gps: { lat: -19.9925, lng: -43.9165 },
        severidade: "baixa",
        vulnerabilidade: false,
        solicitante: "Comércio Beira Rio Ltda.",
        descricao: "Água da chuva escoou pela loja sem causar danos estruturais.",
        status: "em_campo",
        equipeId: "charlie",
        criadoOffsetHoras: -3,
        despachadoOffsetHoras: -2,
        prazoOffsetHoras: 50
      }
    ]
  };

  window.DC360_DADOS_INICIAIS = congelarProfundo(DADOS_INICIAIS);
})();
