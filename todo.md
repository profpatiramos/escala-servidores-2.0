# ESCALA SERVIDORES 2.0 — TODO

## Fundação e Banco de Dados
- [x] Schema completo em `drizzle/schema.ts` com todas as entidades multi-tenant
- [x] Enums: papéis, status de servidor, status de escala, origem de atribuição, tipos de disponibilidade, status de participação, tipos de evento
- [x] Índices em `parishId`, FKs, `status`, `date`
- [x] Constraints de unicidade (vínculo, atribuição, participação, transação de pontos)
- [x] Migration gerada e aplicada no banco
- [x] Foreign keys de integridade referencial (43 FKs aplicadas)
- [x] Constraints de unicidade adicionais (vínculo familiar, atribuição, participação, interesse e alocação de turno)

## Autenticação e Autorização
- [x] Login por e-mail + senha (SUPER_ADMIN, PARISH_ADMIN, COORDINATOR, RESPONSIBLE) com hash de senha
- [x] Login de servidor por ID de acesso + PIN (PIN em hash, nunca retornado pela API)
- [x] Bloqueio após tentativas inválidas consecutivas (com desbloqueio temporal)
- [x] Sessões com token, expiração e revogação (logout)
- [x] Recuperação/redefinição segura de PIN pelo responsável
- [x] Recuperação de senha administrativa por token de uso único
- [x] Mensagens genéricas de erro (proteção contra enumeração de contas)
- [x] Middleware de contexto de paróquia derivado da sessão (nunca do cliente)
- [x] Procedures RBAC: superAdmin, parishAdmin, coordinator, responsible, server
- [x] Isolamento multi-tenant auditado em routers e services (102 pontos de consulta varridos; 8 corrigidos; 4 exceções justificadas e documentadas em `AUDITORIA_ISOLAMENTO.md`)
- [x] Endpoints validados via HTTP: sessão anônima retorna `null`; procedures protegidas retornam 401 sem sessão
- [x] Validação de força de PIN (rejeita repetidos e sequências)
- [x] Ativação de acesso do servidor com definição do primeiro PIN
- [x] Bloqueio de PIN puramente temporal (status permanece ACTIVE, desbloqueio automático por expiração)
- [x] Mensagem única para todos os estados administrativos (anti-enumeração)
- [x] Ativação e reset de PIN por código de uso único emitido pela coordenação ou responsável
- [x] Token de recuperação com canal de entrega registrado e nunca exposto em metadados

## Fase 3 — Cadastros pastorais
- [x] Criação de paróquia com provisionamento de funções, regras de pontos, conquistas e settings
- [x] Gamificação provisionada com penalização e ranking de menores desabilitados
- [x] Atualização de dados e configurações operacionais da paróquia
- [x] Gestão de membros da paróquia com proteção do último administrador
- [x] CRUD de responsáveis com conta de acesso opcional
- [x] CRUD de servidores com idade sempre derivada e exclusão lógica
- [x] Vínculos familiares com regra de responsável obrigatório para menores
- [x] Credenciais ID+PIN: criação, emissão de código de reset e bloqueio administrativo
- [x] Visão do responsável sobre seus dependentes

## Cadastros Pastorais
- [x] CRUD de paróquias (SUPER_ADMIN) com ativação/inativação
- [x] CRUD de membros da paróquia (coordenadores e administradores)
- [x] CRUD de responsáveis com identidade de acesso
- [x] CRUD de servidores: nome, data de nascimento, altura, nome do pai, nome da mãe, status, observações
- [x] Idade calculada dinamicamente (nunca persistida)
- [x] Vínculo responsável-dependente (1:N) com relacionamento e vínculo primário
- [x] Menor de idade exige vínculo ativo com responsável
- [x] Ativação de acesso do servidor: geração de ID + criação de PIN pelo responsável
- [x] Soft delete (inativação) em todas as entidades históricas

## Funções, Formações e Disponibilidade
- [x] CRUD de funções litúrgicas configuráveis por paróquia (com idade mínima e exigência de habilitação)
- [x] Habilitação servidor × função (NOT_QUALIFIED / IN_TRAINING / QUALIFIED)
- [x] CRUD de formações do servidor
- [x] Disponibilidade recorrente semanal com escopo SERVER e FAMILY
- [x] Tipos de disponibilidade: AVAILABLE / PREFERRED / UNAVAILABLE
- [x] Exceções pontuais por data (indisponível ou excepcionalmente disponível)
- [x] Férias com data de saída e retorno
- [x] Preferências de escala com ordem de prioridade (mínimo 2 quando exigido)
- [x] Motor de elegibilidade: interseção disponibilidade do servidor × família

## Celebrações e Escalas
- [x] CRUD de celebrações com data, horário, tipo, local e observações
- [x] Necessidades da celebração: função + quantidade de vagas
- [x] Criação de escala com fluxo DRAFT → PROPOSED → UNDER_REVIEW → PUBLISHED → ARCHIVED/CANCELLED
- [x] Atribuição manual de servidores a funções
- [x] Validações bloqueantes: servidor inativo, outra paróquia, sem habilitação, férias, indisponível, conflito de horário, duplicidade
- [x] Alertas não bloqueantes: vaga não preenchida, função fora das necessidades, habilitação vencida
- [x] Publicação restrita a usuário autorizado com registro de versão
- [x] Alteração de escala publicada com incremento de versão
- [x] Revalidação automática ao alterar data ou horário da celebração
- [x] Lista de servidores elegíveis ordenada por preferência e carga recente
- [x] Confirmação de presença por servidor ou responsável (append-only)
- [x] Detecção e registro de conflito entre confirmação do responsável e do servidor
- [x] Solicitação de substituição com motivo
- [x] Aprovação/rejeição de substituição pelo coordenador com histórico da atribuição original
- [x] Registro de presença/ausência com classificação (presente, justificada, injustificada, pendente)

## Eventos e Voluntariado
- [x] CRUD de eventos com tipos (voluntariado, confraternização, retiro/formação, encontro, outro)
- [x] Fluxo de status do evento: RASCUNHO → PUBLICADO → INSCRIÇÕES ENCERRADAS / CANCELADO
- [x] Período de inscrição, limite de participantes e configuração de acompanhantes
- [x] Confirmação de participação em evento por servidor ou responsável
- [x] Inscrição de menor exige ação do responsável (servidor menor só registra interesse)
- [x] Acompanhantes registrados apenas como quantidade, com limite por servidor
- [x] Limite de vagas considera inscritos mais acompanhantes
- [x] Tarefas do evento e turnos com vagas
- [x] Manifestação e retirada de interesse em voluntariado
- [x] Alocação de voluntários em turnos com controle de capacidade
- [x] Regra: nenhuma alocação sem manifestação de interesse prévia
- [x] Confirmação de participação em turno
- [x] Registro de turno cumprido com concessão idempotente de pontos

## Gamificação
- [x] Configurações por paróquia (penalização desabilitada, ranking de menores desabilitado por padrão)
- [x] Ranking de menores só pode ser habilitado se o ranking estiver habilitado
- [x] Regras de pontuação configuráveis com valores default
- [x] Transações de pontos append-only e idempotentes por referência
- [x] Saldo sempre derivado das transações (sem coluna de saldo)
- [x] Penalidade por ausência só é aplicada se a paróquia habilitar
- [x] Reversão de transação preservando o registro original
- [x] Ajuste manual de pontos com motivo obrigatório e auditoria
- [x] Conquistas automáticas por critério e concessão manual
- [x] Ranking opcional respeitando configuração da paróquia
- [x] Concessão de pontos integrada ao registro de presença

## Assistente de IA
- [x] Motor determinístico de elegibilidade e restrições obrigatórias
- [x] Geração de proposta de escala por período com dados pseudonimizados
- [x] Justificativas por atribuição e detecção de conflitos
- [x] Estado INFEASIBLE quando não houver solução viável
- [x] Fixar servidor e bloquear servidor/horário na regeneração
- [x] Modos de prioridade: equilíbrio, preferências, disponibilidade, necessidades familiares
- [x] Proposta imutável preservada separadamente das alterações humanas
- [x] Validação determinística de toda proposta da IA antes de exibição
- [x] Aplicação da proposta à escala apenas por ação humana explícita
- [x] IA nunca publica escala automaticamente

## Notificações, Relatórios e Auditoria
- [x] Notificações in-app para nova escala, alteração, confirmação pendente, substituição e evento
- [x] Falha de notificação não invalida a operação principal
- [x] Marcação de notificação como lida
- [x] Relatório de escalas por período
- [x] Relatório de participação por servidor
- [x] Relatório de confirmações
- [x] Relatório de ausências
- [x] Relatório de servidores por função
- [x] Trilha de auditoria append-only de ações críticas
- [x] Auditoria sem PIN, senhas ou dados pessoais excessivos

## Frontend
- [x] Identidade visual e tema global adequados ao contexto pastoral
- [x] Tela de acesso unificada com apresentação e as duas modalidades
- [x] Tela de login administrativo (e-mail + senha)
- [x] Tela de acesso do servidor (ID + PIN)
- [x] Layout autenticado com navegação por perfil
- [x] Dashboard do coordenador
- [x] Dashboard do responsável com alternância entre dependentes
- [x] Dashboard do servidor
- [x] Telas de gestão de servidores e vínculos
- [x] Telas de disponibilidade, exceções, férias e preferências
- [x] Telas de celebrações e necessidades
- [x] Tela de montagem de escala com validações visíveis
- [x] Tela de revisão da proposta de IA com justificativas e conflitos
- [x] Telas de confirmação e substituição
- [x] Telas de eventos, turnos e voluntariado
- [x] Telas de gamificação (pontos, histórico e conquistas)
- [x] Telas de relatórios e auditoria
- [x] Central de notificações
- [x] Rotas conectadas no App.tsx com proteção por sessão
- [x] Responsividade mobile-first para responsável e servidor
- [x] Estados de carregamento, vazio e erro em linguagem simples
- [x] Tela dedicada de funções litúrgicas (criar, editar, inativar, idade mínima, exigência de habilitação)
- [x] Habilitações e formações por servidor na página de detalhe do servidor
- [x] Tela de configurações da paróquia (equipe, prazos e gamificação)
- [x] Relatório de confirmações em tabela legível, com justificativa nas ausências
- [x] UI de gestão de vínculos familiares (responsável ↔ dependentes) no detalhe do servidor
- [x] UI de tarefas, turnos e alocação de voluntariado dentro do evento
- [x] Verificação de código e visual das telas acima (Settings 496 linhas com prazos/pontuação/equipe; Reports 332 com tabelas e justificativa; ServerDetail 684 com habilitações, formações e vínculos; EventDetail 538 com tarefas, turnos e alocação)

## Qualidade
- [x] Assistente de IA: geração de proposta determinística revalidada, nunca publica
- [x] Aplicação de proposta restrita a escalas em rascunho, com trava para escalas publicadas
- [x] Router de notificações in-app com escopo por destinatário
- [x] Relatórios operacionais (escalas, participação, confirmações, ausências, substituições, servidores por função)
- [x] Trilha de auditoria somente leitura, com registro de exportação
- [x] Incrementar versão da escala quando uma escala já publicada é alterada, com aviso aos envolvidos
- [x] Verificar erros de runtime residuais (eram de compilações antigas; servidor sobe limpo e responde)
- [x] Registrar routers de eventos e gamificação no appRouter e validar endpoints via HTTP
- [x] Implementar fielmente o critério automático CONSECUTIVE_CONFIRMATIONS (ordem cronológica das celebrações)
- [x] Arquivamento de evento com trava para eventos publicados e futuros
- [x] Testes de isolamento entre paróquias (parishId sempre da sessão — 4 casos)
- [x] Testes de permissões verticais por papel (21 casos de RBAC por procedure)
- [x] Testes de proteção de menores (idade mínima, maioridade, defaults de gamificação)
- [x] Testes das primitivas de credencial (hash scrypt, PIN fraco, força de senha — 19 casos)
- [x] Testes de que o PIN nunca aparece em texto puro no armazenamento
- [x] Testes de disponibilidade e elegibilidade (21 casos da hierarquia de restrições)
- [x] Testes dos defaults conservadores das regras de pontuação (penalidade desligada)
- [x] Testes dos helpers de domínio (idade, horários, datas sem drift de fuso — 23 casos)
- [x] Typecheck sem erros
- [x] Build de produção sem erros
- [x] Testes de integração da validação de escalas (19 casos com duplo de banco): servidor inativo, sem habilitação, abaixo da idade mínima, em férias, com exceção pontual, restrição da família, dupla função na mesma celebração, alocação duplicada, conflito de horário entre celebrações do dia, habilitação vencida como aviso, vagas em aberto e excesso de servidores
- [x] Testes dos defaults de gamificação no provisionamento da paróquia (penaltiesEnabled=false, rankingEnabled=false, minorsRankingEnabled=false)
- [x] Testes de que todo dado provisionado carrega o parishId correto (isolamento na criação)
- [x] Testes da higienização da auditoria (PIN, senha e token nunca persistidos — 13 casos)
- [x] Testes de permissão horizontal em disponibilidade (16 casos): responsável não acessa dependente de outra família, vínculo encerrado perde acesso, servidor não acessa outro servidor, coordenação não atravessa paróquia, papel desconhecido negado por padrão
- [x] Testes de permissão horizontal nos demais módulos sensíveis (24 casos): confirmações (`assertCanRespond`), eventos e voluntariado (`assertCanActFor`, `resolveAllowedServerIds`) e gamificação (`assertCanViewServer`) — cobrindo dependente de outra família, vínculo encerrado, servidor alheio, fronteira de paróquia e papel desconhecido em cada módulo
