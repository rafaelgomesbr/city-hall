/**
 * Traducao de caminho de campo para nome que uma pessoa reconhece.
 *
 * Existe por causa de um defeito confirmado em 08/09/2026, nas duas pontas ao
 * mesmo tempo. O servidor responde 422 com a lista exata do que precisa ser
 * corrigido:
 *
 *   { erro: "dados_invalidos",
 *     mensagem: "Alguns campos precisam ser corrigidos.",
 *     campos: [{ campo: "vistoria.assinanteNome", mensagem: "..." }] }
 *
 * O painel monta `ErroDaApi.campos` e nunca exibe. O aplicativo de campo joga a
 * lista fora antes de ela sair do transporte. O que chega ao agente que acabou
 * de perder uma manha de trabalho no morro e a frase generica, sem dizer qual
 * campo. Ele nao tem como agir.
 *
 * A traducao mora no pacote compartilhado, e nao na tela, porque as duas pontas
 * precisam da mesma. Uma regra, um lugar.
 */

/**
 * O caminho vem do Zod como `issue.path.join(".")`, entao chega pontuado e
 * pode carregar indice de array: `vistoria.fotos.2.capturadaEm`.
 */
export const ROTULO_CAMPO: Record<string, string> = {
  // Abertura de ocorrencia
  solicitanteNome: "Nome do solicitante",
  solicitanteContato: "Contato",
  canalEntrada: "Canal de entrada",
  endereco: "Endereço",
  pontoReferencia: "Ponto de referência",
  coordenada: "Localização no mapa",
  "coordenada.lat": "Latitude",
  "coordenada.lng": "Longitude",
  tipo: "Tipo de ocorrência",
  descricao: "Relato",
  vinculadaA: "Ocorrência vinculada",

  // Triagem, despacho, providencia e encerramento
  severidade: "Severidade",
  vulnerabilidadePresente: "Vulnerabilidade social",
  vulnerabilidadeDescricao: "Descrição da vulnerabilidade",
  equipeId: "Equipe",
  prazoHoras: "Prazo",
  instrucoes: "Instruções",
  orgaoDestino: "Órgão de destino",
  responsavel: "Responsável",
  desfecho: "Desfecho",
  resposta: "Resposta",
  motivo: "Motivo",

  // Vistoria de campo
  checklist: "Checklist técnico",
  fotos: "Fotografias",
  gpsPrecisaoMetros: "Precisão do GPS",
  assinanteNome: "Quem assinou",
  assinaturaChave: "Assinatura",
  coletadaEm: "Hora da coleta",
  observacoes: "Observações",
  capturadaEm: "Hora da fotografia",
  legenda: "Legenda da fotografia",
  chave: "Item do checklist",

  // Cadastro de pessoa e de equipe
  nome: "Nome",
  matricula: "Matrícula",
  email: "Email",
  senha: "Senha",
  senhaAtual: "Senha atual",
  papel: "Papel",
  especialidade: "Especialidade",
};

/**
 * Devolve o nome legivel de um caminho de campo.
 *
 * Estrategia, e ela e deliberadamente tolerante: tenta o caminho inteiro, tenta
 * o caminho sem o prefixo do envelope, e por fim tenta a ultima parte que nao e
 * indice de array. Se nada casar, devolve o proprio caminho, porque um nome
 * feio e melhor que esconder do usuario qual campo esta errado.
 */
export function rotuloDoCampo(caminho: string): string {
  if (ROTULO_CAMPO[caminho]) return ROTULO_CAMPO[caminho];

  const partes = caminho.split(".");
  const semIndice = partes.filter((p) => !/^\d+$/.test(p));

  // `vistoria.assinanteNome` cai aqui e vira "Quem assinou".
  const semPrefixo = semIndice.slice(1).join(".");
  if (semPrefixo && ROTULO_CAMPO[semPrefixo]) return ROTULO_CAMPO[semPrefixo];

  const ultima = semIndice[semIndice.length - 1];
  if (ultima && ROTULO_CAMPO[ultima]) {
    // `vistoria.fotos.2.capturadaEm` vira "Hora da fotografia (item 3)": sem o
    // numero, tres fotos com o mesmo problema viram tres linhas identicas e o
    // agente nao sabe qual abrir.
    const indice = partes.find((p) => /^\d+$/.test(p));
    const rotulo = ROTULO_CAMPO[ultima];
    return indice === undefined ? rotulo : `${rotulo} (item ${Number(indice) + 1})`;
  }

  return caminho;
}

/**
 * Transforma a lista do 422 num mapa de campo para mensagem, pronto para a
 * tela casar com os seus proprios campos.
 *
 * A chave e a ULTIMA parte do caminho, sem indice, porque e assim que os
 * formularios nomeiam o estado de erro deles. O caminho completo continua
 * disponivel em `rotuloDoCampo` para a lista de resumo.
 */
export function errosPorCampo(
  campos: ReadonlyArray<{ campo: string; mensagem: string }>,
): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const c of campos) {
    const partes = c.campo.split(".").filter((p) => !/^\d+$/.test(p));
    const chave = partes[partes.length - 1] ?? c.campo;
    mapa[chave] ??= c.mensagem;
  }
  return mapa;
}
