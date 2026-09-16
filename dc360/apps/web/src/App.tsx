import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { podeExecutar, type Acao } from "@dc360/shared";
import { Estrutura } from "./componentes/Estrutura";
import { useSessao, useTema } from "./estado/sessao";
import { Entrar } from "./paginas/Entrar";
import { destinoDepoisDeEntrar, telaInicial } from "./paginas/entrar-regras";
import { DefinirNovaSenha, RecuperarSenha } from "./paginas/RecuperarSenha";
import { Equipes } from "./paginas/Equipes";
import { Mapa } from "./paginas/Mapa";
import { NovaOcorrencia } from "./paginas/NovaOcorrencia";
import { Ocorrencia } from "./paginas/Ocorrencia";
import { Ocorrencias } from "./paginas/Ocorrencias";
import { Painel } from "./paginas/Painel";
import { Usuarios } from "./paginas/Usuarios";
import { Orgaos } from "./paginas/Orgaos";
import { Auditoria } from "./paginas/Auditoria";
import { Aviso } from "./componentes/comuns";
import { MeuTrabalho } from "./paginas/MeuTrabalho";
import { QuemEstaEmCampo } from "./paginas/QuemEstaEmCampo";
import { MinhaConta } from "./paginas/MinhaConta";
import { TrocaDeTela } from "./componentes/TrocaDeTela";
import { QueroConhecer } from "./paginas/QueroConhecer";
import { NaoEncontrada } from "./paginas/NaoEncontrada";

/**
 * Rotas privadas ficam todas atrás da mesma checagem. Isso é conveniência de
 * navegação, não segurança: a barreira que importa é a policy de RLS no
 * banco, que nega mesmo se a rota for aberta na mão pela URL.
 *
 * O caminho de onde a pessoa veio vai junto para a entrada, e por dois
 * motivos que eram dois defeitos: o link profundo (`/ocorrencias/<id>` sem
 * sessão) morria no painel depois do login, e a sessão expirada no meio de
 * uma tela derrubava a pessoa sem dizer por quê e sem trazê-la de volta. O
 * motivo vem do provedor de sessão; o caminho, daqui. A tela de entrada lê
 * os dois de `location.state` (ver `paginas/entrar-regras.ts`).
 */
function Protegida({ children }: { children: JSX.Element }) {
  const { sessao, motivoDaSaida } = useSessao();
  const location = useLocation();
  if (sessao) return children;
  return (
    <Navigate
      to="/entrar"
      replace
      state={{
        motivo: motivoDaSaida,
        voltarPara: `${location.pathname}${location.search}${location.hash}`,
      }}
    />
  );
}

/**
 * Rota que exige uma permissão, e não só uma sessão.
 *
 * Sem isto, o menu escondia o link mas a URL continuava aberta: um operador
 * que digitasse `/usuarios` via o formulário inteiro de cadastro, preenchia e
 * só descobria no envio que não podia. Esconder o link nunca foi controle de
 * acesso, quem impede é `exigirPermissao` no servidor; isto aqui é para não
 * construir um beco sem saída de propósito.
 */
function Exige({ acao, children }: { acao: Acao; children: JSX.Element }) {
  const { sessao } = useSessao();
  if (!sessao) return <Navigate to="/entrar" replace />;
  if (podeExecutar(sessao.papel, acao)) return children;
  return (
    <Aviso tom="perigo">
      Seu perfil não tem acesso a esta tela. Se você precisa dela para
      trabalhar, peça a quem administra o município do seu órgão.
    </Aviso>
  );
}

export function App() {
  const { sessao } = useSessao();
  const location = useLocation();
  // Onde cada papel cai ao entrar: a regra mora em `paginas/entrar-regras.ts`,
  // e a tela de entrada usa a mesma, para os dois não divergirem.
  const inicio = telaInicial(sessao?.papel);
  /*
    `/entrar` com sessão redireciona para o MESMO lugar que a tela de entrada
    escolheria: o caminho de volta guardado no estado, ou a tela do papel. A
    tela navega sozinha ao entrar, mas a navegação e a sessão nova podem
    chegar em renderizações diferentes, e se este redirecionamento apontasse
    para outro lugar ele ganharia a corrida e o link profundo morreria no
    painel de novo.
  */
  const depoisDeEntrar = sessao
    ? destinoDepoisDeEntrar(location.state as { voltarPara?: unknown } | null, sessao.papel)
    : inicio;

  // O tema é aplicado aqui, e não dentro da estrutura autenticada: antes, a
  // tela de entrada nunca recebia `data-theme`, então abria clara mesmo com o
  // sistema em modo escuro e mesmo com a preferência já salva, e só corrigia
  // depois do login. Nenhuma tela pode existir em um modo só.
  useTema();

  return (
    <>
      {/* Título da aba e foco no conteúdo a cada troca de rota. Sem isto, quem
          usa leitor de tela navega em silêncio absoluto. */}
      <TrocaDeTela />
    <Routes>
      <Route path="/entrar" element={sessao ? <Navigate to={depoisDeEntrar} replace /> : <Entrar />} />
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
      {/* Pública, e alcançável mesmo com sessão ativa: quem já usa pode
          querer indicar o sistema para o município vizinho. */}
      <Route path="/quero-conhecer" element={<QueroConhecer />} />
      {/* Alcançável mesmo com sessão ativa: o link chega por email e pode ser
          aberto num navegador onde outra pessoa já está logada. */}
      <Route path="/redefinir-senha" element={<DefinirNovaSenha />} />

      <Route element={<Protegida><Estrutura /></Protegida>}>
        <Route path="/painel" element={<Painel />} />
        <Route path="/meu-trabalho" element={<MeuTrabalho />} />
        <Route path="/minha-conta" element={<MinhaConta />} />
        <Route path="/ocorrencias" element={<Ocorrencias />} />
        <Route path="/ocorrencias/nova" element={<NovaOcorrencia />} />
        <Route path="/ocorrencias/:id" element={<Ocorrencia />} />
        <Route path="/mapa" element={<Mapa />} />
        {/*
          A tela de quem esta em campo fica atras da propria permissao, e nao de
          `despachar_equipe`: quem precisa enxergar o prazo estourado as tres da
          manha e o operador de plantao, que e quem esta na sala. Ver a razao
          por extenso em `packages/shared/src/permissoes.ts`.
        */}
        <Route
          path="/quem-esta-em-campo"
          element={<Exige acao="acompanhar_saida_a_campo"><QuemEstaEmCampo /></Exige>}
        />
        <Route path="/equipes" element={<Exige acao="gerenciar_equipes"><Equipes /></Exige>} />
        {/* Mesma permissão da rota do servidor: o catálogo é cadastro da
            operação, e quem monta a operação é a coordenação. */}
        <Route path="/orgaos" element={<Exige acao="gerenciar_equipes"><Orgaos /></Exige>} />
        <Route path="/usuarios" element={<Exige acao="gerenciar_usuarios"><Usuarios /></Exige>} />
        <Route path="/auditoria" element={<Exige acao="consultar_trilha"><Auditoria /></Exige>} />
        {/*
          Endereço desconhecido é dito, e não redirecionado em silêncio: quem
          abriu um link errado precisa saber que o link estava errado. Fica
          dentro da proteção para que, sem sessão, o caminho continue sendo
          a tela de entrada, sem confirmar a quem não entrou o que existe.
        */}
        <Route path="*" element={<NaoEncontrada voltarPara={inicio} rotuloDoVoltar="Voltar ao início" />} />
      </Route>
    </Routes>
    </>
  );
}
