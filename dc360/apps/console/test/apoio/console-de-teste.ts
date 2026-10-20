import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { construirConsole, type DependenciasDoConsole } from "../../src/servidor.js";
import { abrirCofre, contextoDoOperador } from "../../src/operadores.js";
import { consoleEmMemoria, type ConsoleEmMemoria } from "../../src/banco-em-memoria.js";
import type { Config } from "../../src/config.js";
import { derivarSenha } from "../../../api/src/auth/senha.js";
import { base32Decodificar, codigoTotp, gerarSegredoTotp, passoDe } from "../../../api/src/auth/totp.js";

/**
 * Um console de teste inteiro: Postgres em WebAssembly com as migrações reais
 * (a 038 inclusive), o dono semeado pela MESMA variável que o desenvolvimento
 * usa, e a porta de duas etapas para entrar.
 *
 * Existe porque, com os operadores no banco, todo teste que monta um console
 * precisa de um banco com `console_operadores` dentro. Antes, uma leitura
 * vazia bastava para medir a porta; agora a porta LÊ o banco, e um dublê de
 * leitura que devolvesse lista vazia mediria um console em que ninguém entra.
 *
 * O DONO É SEMEADO PELA PARTIDA, pelo papel do console, exatamente como em
 * produção: a policy da 038 tem um ramo para o dono com a tabela vazia, e
 * `operadores-no-banco.test.ts` prova que ele fecha na primeira linha.
 *
 * A derivação da senha do dono é feita UMA vez por processo (cada
 * `derivarSenha` gasta uma passagem de scrypt de 128 MB).
 */

export const DONO = {
  email: "dona@fornecedor.com.br",
  senha: "senha-da-dona-bem-comprida-para-teste",
};

export const JWT_SEGREDO_DE_TESTE = "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui";

let hashDaDona: Promise<string> | null = null;
/** O hash da senha do dono, derivado uma vez por processo de teste. */
export function hashDoDono(): Promise<string> {
  hashDaDona ??= derivarSenha(DONO.senha);
  return hashDaDona;
}

export type ConsoleDeTeste = {
  app: FastifyInstance;
  mem: ConsoleEmMemoria;
  chave: string;
  segredoDoDono: string;
  config: Config;
  log: string[];
  relogio: RelogioDeTeste;
  /**
   * Entra pela porta inteira (senha e código) e devolve o token de sessão.
   * Avança o relógio um passo antes, para o código ser sempre novo.
   */
  entrar(email: string, senha: string, segredoTotp: string): Promise<string>;
  encerrar(): Promise<void>;
};

export function codigoDe(segredoTotp: string, quando = new Date()): string {
  return codigoTotp(base32Decodificar(segredoTotp)!, passoDe(quando));
}

/**
 * Um relógio que o teste controla, e por que ele é necessário.
 *
 * O código do aplicativo vale por um passo de trinta segundos, com tolerância
 * de UM passo para cada lado, e cada código usado queima o passo dele. Dentro
 * de uma janela real, a mesma conta só consegue usar dois códigos (o de agora e
 * o do passo seguinte). Um caso que entra, troca a senha e entra de novo
 * precisa de três, e esperar um minuto de relógio de parede em teste não é
 * opção. Então o console recebe este relógio por `agora`, e o teste avança o
 * tempo entre um código e outro.
 */
export type RelogioDeTeste = { readonly agora: Date; avancar(ms: number): Date };

export function relogioDeTeste(inicio = new Date()): RelogioDeTeste {
  let atual = inicio;
  return {
    get agora() { return atual; },
    avancar(ms) { atual = new Date(atual.getTime() + ms); return atual; },
  };
}

/** Avança um passo inteiro do TOTP e devolve um código novo, ainda não queimado. */
export function codigoNovo(relogio: RelogioDeTeste, segredoTotp: string): string {
  relogio.avancar(30_000);
  return codigoDe(segredoTotp, relogio.agora);
}

export type OpcoesDoConsoleDeTeste = {
  /** Sem semente: para o caso que mede o que acontece com a tabela vazia. */
  semSemente?: boolean;
  /** Reaproveita um banco já de pé (segundo processo sobre o mesmo banco). */
  mem?: ConsoleEmMemoria;
  chave?: string;
  segredoDoDono?: string;
  /** O relógio do console e dos códigos gerados por `entrar`. Ver `relogioDeTeste`. */
  relogio?: RelogioDeTeste;
  limitePorEndereco?: number;
  limiteDeCadastro?: number;
  limiteDeAcoes?: number;
  /** Linhas a mais na variável de semente, para o caso que recusa mais de um. */
  sementeCrua?: string;
  /** O modo da guarda das respostas de acesso; sem isto, o de teste ("falhar"). */
  modoDaGuarda?: "falhar" | "corrigir";
};

export async function subirConsoleDeTeste(
  opcoes: OpcoesDoConsoleDeTeste = {},
): Promise<ConsoleDeTeste> {
  const mem = opcoes.mem ?? await consoleEmMemoria();

  const chave = opcoes.chave ?? randomBytes(32).toString("base64");
  const cofre = abrirCofre(chave);
  const segredoDoDono = opcoes.segredoDoDono ?? gerarSegredoTotp();

  const semente = opcoes.sementeCrua ?? JSON.stringify([{
    email: DONO.email,
    senha: await hashDoDono(),
    segundoFator: cofre.cifrar(segredoDoDono, contextoDoOperador(DONO.email)),
  }]);

  const config: Config = {
    NODE_ENV: "test",
    CONSOLE_PORT: 0,
    CONSOLE_HOST: "127.0.0.1",
    CONSOLE_JWT_SEGREDO: JWT_SEGREDO_DE_TESTE,
    CONSOLE_SEGUNDO_FATOR_CHAVE: chave,
    ...(opcoes.semSemente ? {} : { CONSOLE_OPERADORES: semente }),
  };

  const log: string[] = [];
  const relogio = opcoes.relogio ?? relogioDeTeste();
  const dependencias: DependenciasDoConsole = {
    config,
    leitura: mem.banco,
    escrita: mem.banco,
    limitePorEndereco: opcoes.limitePorEndereco ?? 500,
    limiteDeCadastro: opcoes.limiteDeCadastro ?? 500,
    limiteDeAcoes: opcoes.limiteDeAcoes ?? 500,
    destinoDeLog: { write: (linha: string) => { log.push(linha); } },
    agora: () => relogio.agora,
    ...(opcoes.modoDaGuarda ? { modoDaGuarda: opcoes.modoDaGuarda } : {}),
  };
  const app = await construirConsole(dependencias);

  return {
    app, mem, chave, segredoDoDono, config, log, relogio,
    async entrar(email, senha, segredoTotp) {
      const primeira = await app.inject({
        method: "POST", url: "/entrar", payload: { email, senha },
      });
      expect(primeira.statusCode, `a senha de ${email} foi recusada: ${primeira.body}`).toBe(200);
      const segunda = await app.inject({
        method: "POST", url: "/entrar/codigo",
        payload: { desafio: primeira.json().desafio, codigo: codigoNovo(relogio, segredoTotp) },
      });
      expect(segunda.statusCode, `o codigo de ${email} foi recusado: ${segunda.body}`).toBe(200);
      return segunda.json().token as string;
    },
    async encerrar() {
      await app.close();
      if (!opcoes.mem) await mem.banco.encerrar();
    },
  };
}

/** Uma prefeitura cadastrada pela rota do console, para as ações perigosas terem alvo. */
export async function cadastrarPrefeitura(
  app: FastifyInstance,
  token: string,
  municipio: string,
  uf = "MG",
): Promise<{ organizacaoId: string; usuarioId: string; senhaInicial: string }> {
  const r = await app.inject({
    method: "POST", url: "/prefeituras",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      municipio, uf,
      nome: "Rita Lopes",
      matricula: `${municipio.slice(0, 2).toUpperCase()}-1`,
      email: `rita@${municipio.toLowerCase().replace(/\s+/g, "")}.${uf.toLowerCase()}.gov.br`,
      operador: "Rafael Gomes (operacao da plataforma)",
    },
  });
  expect(r.statusCode, `nao cadastrou ${municipio}: ${r.body}`).toBe(201);
  return r.json();
}
