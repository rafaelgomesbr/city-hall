/*
  Antes de qualquer esquema: instala as mensagens do Zod em português para o
  produto inteiro. Ver o cabeçalho de `mensagens-do-zod.ts`.
*/
import "./mensagens-do-zod.js";
export * from "./dominio.js";
export * from "./schemas.js";
export * from "./protocolo.js";
export * from "./permissoes.js";
export * from "./csv.js";
export * from "./localizacao.js";
export * from "./minuta.js";
export * from "./campos.js";
export * from "./telefone.js";
export * from "./glifos-de-severidade.js";
export * from "./evidencia.js";
export * from "./codigos-de-erro.js";
export * from "./observabilidade.js";
export * from "./erros.js";
export * from "./fuso.js";
export * from "./versao.js";
/*
  Andaime da F03 (V2-F03, parte 0C): três módulos vazios, preenchidos pelas etapas
  donas (identidade E02/E15/E17, ator E06, sigilo E21). Daqui em diante este
  arquivo fica CONGELADO durante a F03: nenhuma parte da fase o edita.
*/
export * from "./identidade.js";
export * from "./ator.js";
export * from "./sigilo.js";
export { mensagensDoZodEmPortugues } from "./mensagens-do-zod.js";
/*
  Andaime da F04 (V2-F04, parte 0C): quatro módulos vazios, preenchidos pelas partes
  donas (encaminhamento 0D/3C/5B, dossiê 0E, competência 0F, prazo 4B). Daqui em
  diante este arquivo fica CONGELADO durante a F04: nenhuma parte da fase o edita.
*/
export * from "./encaminhamento.js";
export * from "./dossie.js";
export * from "./competencia.js";
export * from "./prazo-do-encaminhamento.js";
