# Hub — plano para colocar todas as funcionalidades em operação

Atualizado em 15/10/2026 (America/Sao_Paulo).

## Pedido e estado conferido

A usuária solicitou todas as funcionalidades funcionando de verdade e a lista dos acessos e informações necessários. A v5 permanece publicada como demo estática. O HEAD remoto conferido antes deste levantamento foi `e1499ac6b75c1236862e18e63eeeaa1ba8209be1`. Este documento registra o escopo de implementação; não representa ativação de backend ou integrações.

- GitHub acessível e `main` conferida; referência anterior preservada em `backup/pre-v5-2026-10-09`.
- Nesta sessão, as consultas Vercel por equipes e pelo repositório retornaram listas vazias. Isso não prova inexistência de conta ou projeto; falta acesso visível ao projeto correto nesta conexão.
- O ambiente não reportou segredos ou identidades externas configurados. Isso não comprova ausência de serviços contratados fora desta sessão.
- O site usa localStorage, perfis públicos de exemplo e dados parcialmente fixos. Não receber dados privados ou credenciais no frontend/repositório público.

## Acessos e informações necessários

| Item | O que a empresa precisa fornecer/conectar | Resultado esperado |
|---|---|---|
| Hospedagem e banco | Acesso ao projeto de hospedagem e ao banco. Recomendação já documentada: Vercel + Supabase; aproveitar contas existentes. Definir teto mensal para serviços. | Backend, banco compartilhado, login, armazenamento privado, tarefas agendadas e backups. |
| Usuários e email | Emails reais de Caritas, Cristiano, Alicia e Cindy; responsável administradora; primeiros perfis Crew/Client para homologação; email remetente empresarial e domínio para configurar convites e recuperação de senha. | Acessos individuais e permissões Office/Crew/Client, revogação e recuperação de conta. Convites reais só serão enviados quando autorizados. |
| Google Calendar | Conta responsável, calendário(s) permitido(s), quem pode editar e autorização OAuth; acesso ao projeto Google Cloud para configurar API e consentimento. | Sincronização real Hub → Google e Google → Hub. Workspace pago não é requisito técnico. |
| Quo/SMS | Conta e número empresarial com API/webhooks habilitados; destinatários de teste autorizados e regras de consentimento, horários e cancelamento de mensagens. | Envio aprovado, status de entrega e alertas de mensagens recebidas. Requisitos de registro do remetente precisam estar concluídos conforme o provedor. |
| Documentos e assinatura | Agreement, Care & Maintenance Guide e Warranty oficiais; conta de assinatura com API/webhooks. SignWell e Documenso são opções, ainda não escolhidas. | PDF versionado por projeto, assinatura com evidências e garantia liberada somente após confirmação do provedor. |
| Pagamentos | Conta empresarial do provedor de recebimento; preferência existente ou Stripe como recomendação; regras de entrada, parcelas, saldo, impostos e reembolsos. | Checkout, comprovantes, saldo e conciliação confirmados pelo provedor. Dados bancários e verificação da empresa são cadastrados diretamente no provedor. |
| IA do assistente | Provedor de IA conectado ao backend e limite de consumo. A conta ChatGPT/Codex não instala automaticamente IA no Hub. | Comandos PT/EN mais amplos, consulta autorizada, desambiguação e confirmação de ações no servidor. |
| Dados operacionais | Modelo da planilha atual com dados fictícios para preparar importação; serviços, preços/regras comerciais, horários e disponibilidade das equipes, modelos de documentos e exigências internas de Compliance. Dados reais só após base protegida. | Importação validada, cadastros completos, agenda, orçamentos e documentos de trabalho reais. |
| Marca e publicação | Link oficial de avaliações do Google; domínio existente e acesso DNS para endereço personalizado; remetente de email e textos oficiais da empresa. | Review correto, emails identificados e endereço próprio. URL HTTPS de homologação permite começar sem comprar domínio. |
| Localização/ETA | Celulares da Crew com localização autorizada; regras de início/fim do compartilhamento, visibilidade e retenção; serviço de rotas para calcular ETA. | Localização e previsão reais, com indicação explícita quando indisponíveis. Compartilhamento contínuo com celular bloqueado pode exigir solução móvel específica. |
| Comercialização SaaS | Quando houver venda para outras empresas: planos, limites, preços, termos e conta de cobrança do software. | Onboarding, assinatura do Hub, limites e cancelamento separados dos pagamentos das obras. Não bloqueia o piloto da GTF. |

Conectar contas por OAuth, integração ou credenciais no gerenciador seguro do servidor. Nunca solicitar senha, API secret, cartão ou chave bancária em mensagem ou commit. Não contratar planos, gastar créditos ou iniciar cobranças sem orçamento/autorização correspondente.

## Inventário de funcionalidades a implementar

| Área | Situação da demo | Trabalho para operação real |
|---|---|---|
| Login e empresas | Perfis e sessão no navegador | Auth, sessões, autorização server-side, memberships, isolamento de empresas, convites e recuperação. |
| Cadastros | Clientes, funcionários, equipes, prestadores e fornecedores parcialmente fixos/locais | CRUD completo, vínculos por ID, busca, validação, histórico e permissões. |
| Projetos e documentos financeiros | Estimate/WO/Invoice ligados localmente | Modelo central compartilhado, numeração por empresa, múltiplos documentos/appointments, aprovações, versões e transações. |
| Agenda e disponibilidade | Rótulos fixos e datas parcialmente locais; disponibilidade informativa | Datas reais, intervalos, calendário navegável, jornadas, ausências, atribuições e detecção de conflitos. |
| Google Calendar | Novo evento em rascunho; fila local | OAuth seguro, eventos por ID, outbox, sync incremental, webhooks, conflitos, renovação de canais e erros recuperáveis. |
| Crew | Acknowledge/status/problemas locais | Trabalhos atribuídos por usuário, status único entre Office/Crew/Client, tarefas, horários, notas e fotos compartilhados. |
| Portal Client | Documentos locais, timeline/next visit parcialmente fixos | Progresso e agenda vindos do projeto real, documentos liberados, assinatura e pagamentos autorizados. |
| Rastreamento/ETA | Animação, distância e minutos simulados | Geolocalização autorizada, atualizações por appointment e ETA calculado. Nunca informar localização inventada. |
| Ligar para cliente | Botão informativo | Telefone associado ao contato e ação real de chamada no dispositivo; telefonia integrada somente se necessária. |
| Pastas e fotos | Nomes e contagens de exemplo | Upload/download privados, versões, limites e vínculo ao projeto, acesso temporário autorizado e verificação de arquivos. |
| Compliance | Edição de status/datas no navegador | Documentos, evidências, responsáveis, histórico, COI com GL/WC aninhados e revisão interna de W-9 configurável. |
| Agreement e Warranty | Placeholder e assinatura digitada demo | Template oficial, sessão de assinatura, evento verificado, PDF/audit trail e garantia por projeto. |
| Payments | Marcação local; nenhuma cobrança | Checkout seguro, pagamentos parciais, saldo, comprovantes, reembolso e reconciliação por webhook. |
| Quo e comunicações | Filas/rascunhos locais | Envio autorizado, entrega, recebimento, associação a contato/projeto e deduplicação. |
| Notificações | localStorage, sem entrega entre dispositivos | Destinatários, leitura individual, atualização compartilhada, workers e lembretes. Push/email conforme canal configurado. |
| Follow-up e DNC | Templates/copiar e bloqueio local | Consentimento/opt-out persistentes, histórico e envios revisados; campanhas somente com regras aprovadas. |
| Importar CSV/Excel | Botão informativo | Preview, mapeamento de colunas, validação, deduplicação, relatório e reversão da importação. |
| Idiomas | Botão PT/EN sem tradução completa | Catálogo de traduções, preferência persistente e interface coerente; preservar inglês para o mercado americano. |
| Assistente e atalhos | Parser e ranking locais | Ações autorizadas, IA no servidor, confirmações, auditoria e atalhos por usuário no banco. |
| SaaS | Schema inicial proposto | Organização em todas as entidades, onboarding, marca/integrações por empresa e futura cobrança do software. |

## Ordem de execução

1. Preparar a aplicação com backend preservando o layout e as funcionalidades; criar homologação HTTPS separada da demo pública.
2. Corrigir o modelo/schema antes de aplicá-lo: vínculos do mesmo tenant, membership ativa, papéis, projeções sem preços/notas internas para Crew/Client e testes de isolamento.
3. Implementar Auth, email transacional, banco e arquivos privados; migrar cadastros, projetos, Estimate/WO/Invoice, appointments e estado de andamento compartilhado.
4. Implementar agenda por datas reais, disponibilidade, importação, traduções, notificações e rotinas operacionais. Corrigir renderização de campos sem escape antes de receber dados externos.
5. Conectar Google Calendar bidirecional, prioridade preservada do histórico, após definir conta/calendário e OAuth.
6. Conectar Quo, assinatura/garantia e pagamentos, cada um com seu canal de confirmação, fila e tratamento de erro.
7. Conectar IA, terminar portal Client, arquivos e localização/ETA com regras de privacidade. O assistente não pode efetuar escritas diretamente sem autorização e confirmação.
8. Homologar com Office, Crew e Client; validar isolamento, conflitos, mensagens, pagamentos e assinatura com contas de teste dos provedores. Depois, realizar ativação controlada com dados reais.
9. Preparar onboarding e cobrança SaaS quando existirem decisões comerciais. Preservar a arquitetura multiempresa desde a primeira migração.

Sem contas externas é possível programar estrutura, validações, telas, schema revisado, contratos de APIs, filas e testes com dados fictícios. Isso será registrado como implementação local; só haverá status conectado após verificação real do serviço.

## Critérios para dizer que está funcionando

- Criar/editar um projeto no Office e verificar atualização em outro dispositivo, respeitando o usuário e a empresa.
- Crew vê só seus trabalhos e nunca recebe campos financeiros; Client vê só seus projetos. Membership revogada perde acesso.
- Calendar reflete alterações nos dois sentidos, com timezone America/New_York, sem duplicações ou sobrescritas silenciosas.
- SMS/email só indicam enviados após confirmação; entrega, falha e reenvio ficam auditáveis. Não testar enviando mensagens a terceiros sem autorização.
- Assinatura é comprovada pelo provedor e libera somente a garantia do projeto correspondente.
- Pagamento só altera saldo após confirmação verificável; reentrega de webhook não duplica valor ou ação.
- Arquivos ficam privados e vinculados à organização/projeto; uploads e downloads respeitam o papel.
- Localização/ETA vêm de dados reais e indicam quando estão desatualizados/indisponíveis.
- Importação, agenda, traduções, chamadas e demais botões passam por fluxo completo; não restam ações apresentadas como reais que só exibem um aviso.
- Backups/restauração, auditoria, falhas de integrações e responsividade são verificados antes do lançamento.

## Validação deste levantamento

Revisão de AGENTS, especificação mestra, implementação, aceitação, arquitetura, plano de Calendar e código com apoio de auditorias independentes. HEAD remoto e acesso visível à hospedagem consultados. Alterações desta etapa são documentação; os testes de fluxos v5 anteriores continuam registrados em `VALIDATION_V5.md` e não equivalem a testes das integrações futuras.
