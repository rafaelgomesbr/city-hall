# Catálogo de códigos de erro (gerado de packages/shared/src/erros.ts)

| Código | Status | Categoria | O que é | Situação |
| --- | --- | --- | --- | --- |
| `acesso_suspenso` | 403 ou 503 | aguardar | Acesso do município suspenso pelo fornecedor | emitido |
| `armazenamento_indisponivel` | 503 | aguardar | Armazenamento de arquivos indisponível | emitido |
| `arquivo_ausente` | 409 | corrigir | O arquivo não chegou ao armazenamento | emitido |
| `arquivo_grande_demais` | 409 | corrigir | Arquivo maior que o limite | emitido |
| `assinatura` | 403 | renovar | Endereço assinado de arquivo ausente, adulterado ou vencido | emitido |
| `ativacao_nao_iniciada` | 409 | corrigir | Não há ativação do segundo fator em andamento | emitido |
| `autodesativacao` | 422 | permanente | Ninguém desativa a própria conta | emitido |
| `autoencerramento` | 422 | permanente | Ninguém encerra a própria sessão por aqui | emitido |
| `autor_divergente` | 409 | reentrar | Registro feito por outra pessoa | emitido |
| `autoredefinicao` | 422 | permanente | Ninguém redefine a própria senha por aqui | emitido |
| `bloqueado` | 429 | aguardar | Tentativas de entrada demais | emitido |
| `caminho_desligado` | 503 | aguardar | Caminho por ruas desligado | emitido |
| `caminho_indisponivel` | 502 | aguardar | Caminho por ruas indisponível agora | emitido |
| `chave_fora_do_lugar` | 422 | corrigir | Chave de arquivo fora do lugar esperado | emitido |
| `codigo_invalido` | 422 | corrigir | Código do segundo fator não confere | emitido |
| `conta_desativada` | 403 | permanente | Conta desativada | emitido |
| `conta_nao_encontrada` | 404 | permanente | Conta não encontrada | emitido |
| `corpo_invalido` | 400 ou 413 ou 415 | corrigir | Corpo do pedido ilegível, grande demais ou de tipo não aceito | emitido |
| `corpo_vazio` | 400 | corrigir | Nenhum conteúdo recebido | emitido |
| `credenciais` | 401 | reentrar | E-mail ou senha não conferem | emitido |
| `dados_invalidos` | 422 | corrigir | Campos do pedido precisam ser corrigidos | emitido |
| `data_implausivel` | 422 | corrigir | Data do registro não é plausível | emitido |
| `desvio_do_catalogo_de_erro` | 500 | aguardar | Resposta de acesso fora do catálogo (só em teste) | emitido |
| `dominio_nao_autorizado` | 422 | corrigir | Domínio de email não autorizado | emitido |
| `email_so_por_administrador` | 403 | permanente | Troca de email é de quem administra | emitido |
| `envio_desligado` | 503 | aguardar | Envio de ofício por email desligado | emitido |
| `envio_falhou` | 502 | aguardar | Provedor de email não entregou o envio | emitido |
| `envio_pendente` | 409 | aguardar | Arquivo ainda não terminou de subir | emitido |
| `equipe_inativa` | 409 | corrigir | Equipe informada está desativada | emitido |
| `equipe_inexistente` | 404 | corrigir | Equipe informada não existe | emitido |
| `erro_interno` | 500 | aguardar | Erro inesperado do servidor | emitido |
| `estado_mudou` | 409 | corrigir | O estado mudou enquanto o pedido era feito | emitido |
| `evidencia_de_outro_agente` | 409 | corrigir | Fotografia de outro agente | emitido |
| `evidencia_ja_vinculada` | 409 | corrigir | Fotografia já vinculada a outro registro | emitido |
| `excesso_de_requisicoes` | 429 | aguardar | Requisições demais | emitido |
| `hash_divergente` | 409 | corrigir | Conteúdo do arquivo difere do declarado | emitido |
| `interdicao_ativa` | 409 | permanente | Ocorrência interditada: levantar antes de encerrar | emitido |
| `interdicao_nao_indicada` | 409 | permanente | A vistoria não indicou interdição | emitido |
| `ja_ativo` | 409 | permanente | Órgão já está ativo | emitido |
| `ja_desativado` | 409 | permanente | Órgão já está desativado | emitido |
| `ja_desinterditada` | 409 | permanente | Interdição já levantada | emitido |
| `ja_emitido` | 409 | permanente | Ofício já emitido | emitido |
| `ja_encerrada` | 409 | permanente | Registro já encerrado | emitido |
| `ja_no_estado_final` | 409 | permanente | Ocorrência já está encerrada | emitido |
| `ja_respondida` | 409 | permanente | Providência já tem resposta | emitido |
| `link_nao_aceito` | 422 | corrigir | Link de mapa não aceito | emitido |
| `nao_autenticado` | 401 | renovar | Token ausente, inválido ou vencido | emitido |
| `nao_desinterditada` | 409 | permanente | Não houve interdição levantada | emitido |
| `nao_encontrada` | 404 | permanente | Recurso não encontrado | emitido |
| `nao_encontrado` | 404 | permanente | Rota ou recurso não encontrado | emitido |
| `nao_interditada` | 409 | permanente | Ocorrência não está interditada | emitido |
| `nao_resolveu` | 502 | aguardar | Serviço de mapa não resolveu o link | emitido |
| `nome_repetido` | 409 | corrigir | Já existe registro com este nome | emitido |
| `objeto_ja_existe` | 412 | permanente | Já existe arquivo nesta chave | emitido |
| `ocorrencia_encerrada` | 409 | permanente | Ocorrência encerrada não aceita o ato | emitido |
| `orgao_desativado` | 409 | corrigir | Órgão informado está desativado | emitido |
| `orgao_nao_encontrado` | 404 | corrigir | Órgão informado não existe | emitido |
| `orgao_repetido` | 409 | corrigir | Já existe órgão com este nome | emitido |
| `orgao_sem_email` | 409 | corrigir | Órgão sem email cadastrado | emitido |
| `pdf_indisponivel` | 503 | aguardar | Geração de PDF indisponível | emitido |
| `posto_insuficiente` | 403 | permanente | Perfil não administra esta conta | emitido |
| `posto_insuficiente_para_dado_pessoal` | 403 | permanente | Exportação com dado pessoal é de quem administra | emitido |
| `push_android_desligado` | 503 | aguardar | Push para Android desligado | emitido |
| `push_desligado` | 503 | aguardar | Notificação por push desligada | emitido |
| `recorte_grande_demais` | 409 | corrigir | Recorte da exportação grande demais | emitido |
| `recuperacao_desligada` | 503 | aguardar | Recuperação de senha por email desligada | emitido |
| `relogio_do_aparelho` | 409 | corrigir | Data e hora do aparelho fora do horário real | emitido |
| `saida_ja_aberta` | 409 | permanente | Já há uma saída a campo aberta | emitido |
| `segundo_fator_desligado` | 503 | aguardar | Segundo fator desligado neste servidor | emitido |
| `segundo_fator_ilegivel` | 503 | aguardar | Segredo do segundo fator ilegível | emitido |
| `segundo_fator_ja_ativo` | 409 | permanente | Segundo fator já está ativo | emitido |
| `segundo_fator_nao_esta_ativo` | 409 | permanente | Segundo fator não está ativo | emitido |
| `sem_despacho` | 409 | permanente | Ocorrência ainda não despachada | emitido |
| `sem_permissao` | 403 | permanente | Perfil sem permissão para a ação | emitido |
| `sem_ponto` | 422 | corrigir | Link de mapa sem ponto reconhecível | emitido |
| `sem_vistoria` | 409 | permanente | Ocorrência sem vistoria concluída | emitido |
| `senha_nao_confere` | 422 | corrigir | Senha informada não confere | emitido |
| `senha_provisoria_vencida` | 401 | permanente | Senha provisória vencida | emitido |
| `sessao_encerrada` | 401 | reentrar | Sessão encerrada ou cadastro alterado | emitido |
| `status_nao_permite` | 409 | permanente | A tarefa não está mais em campo | emitido |
| `tamanho_divergente` | 409 | corrigir | Tamanho do arquivo difere do declarado | emitido |
| `tarefa_no_prazo` | 409 | aguardar | Tarefa ainda dentro do prazo | emitido |
| `teto_de_armazenamento` | 507 | aguardar | Teto de armazenamento do município atingido | emitido |
| `teto_de_envios` | 409 | permanente | Limite de envios do ofício atingido | emitido |
| `tipo_a_classificar` | 409 | corrigir | Tipo da ocorrência ainda a classificar | emitido |
| `tipo_recusado` | 415 | corrigir | Tipo de arquivo não aceito | emitido |
| `transicao_invalida` | 409 | permanente | Transição de estado não permitida | emitido |
| `troca_de_senha_obrigatoria` | 403 | reentrar | Senha provisória: definir a senha | emitido |
| `ultimo_administrador` | 422 | permanente | Município precisa de ao menos um administrador | emitido |
| `usuario_repetido` | 409 | corrigir | Já existe usuário com este email | emitido |
| `vistoria_ja_concluida` | 409 | permanente | Vistoria já registrada por outra pessoa da equipe | emitido |
| `vulnerabilidade_depois_do_nome` | 422 | corrigir | Prazo da vulnerabilidade maior que o do nome do solicitante | emitido |
| `chave_ja_usada_em_outro_registro` | 409 | permanente | Chave de idempotência já usada em outro registro | reservado |
| `versao_do_aplicativo_antiga` | 426 | permanente | Versão do aplicativo abaixo da mínima aceita | reservado |
| `versao_do_aplicativo_ausente` | 426 | permanente | Versão do aplicativo ausente ou malformada | reservado |

92 códigos emitidos, 3 reservados.
