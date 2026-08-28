import { Navigate, Route, Routes } from "react-router-dom";
import { podeExecutar, type Acao, type Papel } from "@dc360/shared";
import { Estrutura } from "./componentes/Estrutura";
import { useSessao, useTema } from "./estado/sessao";
import { Entrar } from "./paginas/Entrar";
import { DefinirNovaSenha, RecuperarSenha } from "./paginas/RecuperarSenha";
import { Equipes } from "./paginas/Equipes";
import { Mapa } from "./paginas/Mapa";
import { NovaOcorrencia } from "./paginas/NovaOcorrencia";
import { Ocorrencia } from "./paginas/Ocorrencia";
import { Ocorrencias } from "./paginas/Ocorrencias";
import { Painel } from "./paginas/Painel";
import { Usuarios } from "./paginas/Usuarios";
import { Auditoria } from "./paginas/Auditoria";
import { Aviso } from "./componentes/comuns";
import { MeuTrabalho } from "./paginas/MeuTrabalho";
import { MinhaConta } from "./paginas/MinhaConta";
import { TrocaDeTela } from "./componentes/TrocaDeTela";

/**
 * Rotas privadas ficam todas atrás da mesma checagem. Isso é conveniência de
 * navegação, não segurança: a barreira que importa é a policy de RLS no
 * banco, que nega mesmo se a rota for aberta na mão pela URL.
 */
function Protegida({ children }: { children: JSX.Element }) {
  const { sessao } = useSessao();
  return sessao ? children : <Navigate to="/entrar" replace />;
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

/**
 * Onde cada papel cai ao entrar.
 *
 * O agente de campo não tem uma ação sequer no painel do coordenador: ele não
 * tria, não despacha, não encaminha e não encerra. Mandá-lo para lá era
 * mostrar a fila do município inteiro para quem só precisa saber o que é da
 * equipe dele hoje.
 */
function telaInicial(papel: Papel | undefined): string {
  if (!papel) return "/entrar";
  return podeExecutar(papel, "registrar_vistoria") ? "/meu-trabalho" : "/painel";
}

export function App() {
  const { sessao } = useSessao();
  const inicio = telaInicial(sessao?.papel);

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
      <Route path="/entrar" element={sessao ? <Navigate to={inicio} replace /> : <Entrar />} />
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
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
        <Route path="/equipes" element={<Exige acao="gerenciar_equipes"><Equipes /></Exige>} />
        <Route path="/usuarios" element={<Exige acao="gerenciar_usuarios"><Usuarios /></Exige>} />
        <Route path="/auditoria" element={<Exige acao="consultar_trilha"><Auditoria /></Exige>} />
      </Route>

      <Route path="*" element={<Navigate to={inicio} replace />} />
    </Routes>
    </>
  );
}
