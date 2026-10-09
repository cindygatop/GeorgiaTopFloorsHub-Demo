# Georgia Top Floors Hub — caminho para produção

Atualizado em **9 de outubro de 2026**.

## 1. O que esta versão já faz

Esta entrega continua sendo uma **demo estática**, mas agora demonstra a estrutura do produto real:

- login de demonstração com quatro perfis Office e três visões separadas: Office, Crew e Client;
- permissões de navegação por papel;
- projeto como registro central, ligando Estimate → Work Order → Invoice → appointment → documentos;
- Work Orders liberadas para o crew correspondente;
- fila de SMS/alerta de appointment para crew;
- fila de sincronização Google Calendar (sem integração ativa), assistente local para agendamento e rascunho de novo evento;
- painel de integrações preparado para Calendar, Quo, e-signature e payments;
- Client View com Agreement → assinatura → Warranty desbloqueada;
- Care & Maintenance Guide e “Before Your Job”;
- botão de Google Review da Georgia Top Floors;
- Compliance agrupado por família de documento, filtro por tipo e revisão periódica de W-9;
- atalhos adaptativos por usuário do Office e indicadores discretos de urgência.

### Logins da demo (v5)

| Visão | Nome | E-mail | Senha |
|---|---|---|---|
| Office | Caritas | caritas@gtf.demo | gtf2026 |
| Office | Cristiano | cristiano@gtf.demo | gtf2026 |
| Office | Alicia | alicia@gtf.demo | gtf2026 |
| Office | Cindy | cindy@gtf.demo | gtf2026 |
| Crew | Carlos | carlos@gtf.demo | gtf2026 |
| Client | Emily Carter | emily@gtf.demo | gtf2026 |

Essas credenciais ficam no JavaScript da demo. **Não devem ser usadas em produção.**

## 2. O que ainda não é produção

Hoje os dados são gravados em `localStorage` no navegador. Isso significa que:

- outro computador não vê as alterações;
- não há autenticação segura real;
- não há isolamento real entre empresas/usuários;
- não devemos colocar dados sensíveis reais;
- API keys de Google, Quo, Stripe ou assinatura não podem ser colocadas nesses arquivos públicos.

Para entrar em operação, precisamos mover autenticação, dados e integrações para um backend.

## 3. Arquitetura recomendada

### Front-end e backend web

**Next.js + Vercel Pro**. O site deixa de ser uma coleção de HTML estático e passa a ter rotas, ações de servidor, endpoints para webhooks e autenticação integrada. O Git continua sendo o fluxo de publicação: push/merge gera deployment.

### Database, login e arquivos

**Supabase Pro** como primeira infraestrutura:

- PostgreSQL para dados;
- Supabase Auth para login;
- Row Level Security para impedir que Crew veja preço ou que Client veja projeto de outro cliente;
- Storage para PDFs, fotos e documentos;
- backups.

O arquivo `supabase-schema.sql` desta entrega já propõe a base multi-tenant.

### Multi-tenant desde o primeiro dia

Toda informação empresarial recebe `organization_id`. Isso permite que amanhã existam:

- Georgia Top Floors;
- Empresa B;
- Empresa C;

no mesmo produto, sem misturar dados. Usuários entram por `organization_members` e recebem roles. Integrações, logo, review URL, templates e configurações também pertencem à organização.

## 4. Como ficam os acessos

### Office

Pode ver e administrar clientes, projetos, calendário, Estimate, Work Order, Invoice, Compliance e integrações. Atalhos inteligentes são individuais: cada usuário do Office terá seu próprio padrão de uso.

### Crew

Vê apenas projetos/Work Orders onde está atribuído. Deve receber escopo, endereço, horário, materiais, stain/finish e notas de campo. Não deve receber preço, margem ou dados financeiros, salvo permissão explícita no futuro.

### Client

Vê apenas seus projetos. Pode acompanhar status, ver documentos liberados, assinar Agreement, abrir Care & Maintenance Guide, acessar Warranty depois da assinatura, pagar invoice quando payments estiver conectado e deixar feedback.

## 5. Project-first: como tudo fica ligado

Um `project_id` é o centro do sistema.

**Project**
→ Customer
→ Estimate
→ Work Order
→ Invoice
→ Appointments
→ Crew assignments
→ Agreement
→ Warranty
→ Photos/files
→ Notifications
→ Payment events

Assim, quando o Office cria um appointment para um projeto, o crew correto recebe a agenda; quando a data muda, Calendar e sistema atualizam o mesmo registro; quando o invoice nasce, ele já pertence ao mesmo projeto.

## 6. Google Calendar — sincronização nos dois sentidos

Precisamos configurar um projeto Google Cloud e OAuth.

### Sistema → Google

1. Office cria/edita appointment no Hub.
2. Backend cria/atualiza evento no Google Calendar.
3. Guardamos `google_event_id`, calendar ID, ETag e horário da última sincronização.

### Google → Sistema

1. Google envia um push notification para um webhook HTTPS do Hub.
2. O backend consulta as mudanças da agenda.
3. Atualiza apenas os campos compartilhados: título, data/hora, endereço e notas básicas.
4. Um marcador de origem/versão impede loop infinito de sincronização.

A API Calendar tem uso padrão sem custo adicional dentro dos limites atuais; projetos novos estão sujeitos às cotas atualizadas de 2026. Para produção pública, OAuth e os scopes escolhidos também precisam ser configurados corretamente.

## 7. Quo — SMS para Crew + alerta de mensagens no Office

A integração indicada é pela **Quo API**, pois o Quo já oferece REST API e webhooks.

### Novo appointment

- Hub grava appointment;
- backend descobre quais crew members foram atribuídos;
- cria notificação in-app;
- chama a API do Quo para enviar SMS com data, hora, cliente/endereço e link seguro para abrir o Work Order.

### Mensagem chegando no Quo

- webhook do Quo chega ao backend;
- sistema identifica/concilia contato e projeto quando possível;
- Office recebe badge/alerta “New Quo message”.

Nunca colocar a API key do Quo no navegador. Ela fica somente no servidor/secret manager.

## 8. Agreement, Care Guide e Warranty

O documento que você já possui deve virar um **template versionado** em um serviço de e-signature.

Fluxo recomendado:

1. Client clica **Review & Sign**.
2. Hub cria/abre uma sessão de assinatura embutida.
3. Client lê o Agreement.
4. Dentro ou junto ao Agreement há o link para o Care & Maintenance Guide.
5. Serviço de assinatura registra evidências/audit trail e finaliza o PDF.
6. Webhook informa ao Hub que o documento foi assinado.
7. Hub guarda o PDF final, certificado/audit trail e versão usada.
8. Warranty muda de `locked` para `active` e fica verde no portal.

A assinatura digitada da demo serve apenas para mostrar o fluxo. Para produção, usar provider de e-signature. Duas opções boas para avaliar são **SignWell** (API pay-as-you-go) e **Documenso** (API + embedded signing; plano Teams ou superior para embedded signing normal).

Quando o Agreement final for enviado, substituir o placeholder pelo documento real e mapear os campos de assinatura.

## 9. Payments

Para o piloto, **Stripe Checkout / Payment Element** é uma opção simples porque permite pagamento sem guardar dados de cartão no Hub.

Fluxo:

1. Client abre Invoice.
2. Hub cria uma sessão de pagamento no backend.
3. Cliente paga no ambiente seguro do provider.
4. Provider envia webhook.
5. Invoice muda para paid/partial e registra o payment ID.

Quando o Hub virar SaaS para outras empresas, estudar **Stripe Connect** para cada empresa conectar a própria conta de recebimento. Isso separa pagamento do projeto do cliente e assinatura do próprio software SaaS.

## 10. “Machine learning” dos atalhos

Não vale colocar um modelo de ML pesado agora. Primeiro precisamos acumular uso real.

Nesta demo, os Smart Shortcuts já usam um ranking local por frequência + recência. Na produção:

1. gravar `activity_events` por usuário;
2. calcular atalhos por frequência, recência, horário e contexto;
3. depois de volume suficiente, trocar o ranking heurístico por modelo de recomendação, se houver ganho real.

Isso entrega personalização imediatamente sem custo e sem inventar inteligência onde ainda não existe dado.

## 11. Compliance mais limpo

O conceito recomendado é:

- **COI / Certificate of Insurance** como grupo;
  - General Liability;
  - Workers Compensation;
  - outras coberturas/documentos relacionados.
- W-9 & Tax Forms;
- Agreements;
- Licenses & Registrations;
- Safety;
- Job Documents;
- Employment;
- Other.

O W-9 não deve ser tratado como se tivesse uma expiração federal anual automática. O Hub usa **Annual Internal Review** configurável e solicita um novo W-9 quando houver alteração/correção de informação ou necessidade operacional.

## 12. Custos de referência do piloto

Valores em USD, antes de impostos e sujeitos a mudança.

| Item | Referência atual | Observação |
|---|---:|---|
| Vercel Pro | $20/mês | 1 seat de deploy incluído + $20 de usage credit |
| Supabase Pro | $25/mês | banco/auth/storage; inclui compute credit para uma instância Micro |
| Google Calendar API | $0 no uso padrão dentro do limite atual | cobrança acima do limite diário está planejada para o fim de 2026 |
| Quo | se já houver conta, aproveitar a existente | mensal: Starter $19/user, Business $33/user, Scale $47/user; anual é menor |
| E-signature | pode começar perto de $0 em volume baixo | SignWell: API usage-based; Documenso Free/Individual/Teams conforme necessidade |
| Stripe | sem mensalidade padrão para cards | 2,9% + US$0,30 por transação doméstica online na tabela padrão atual |
| Subdomínio | normalmente $0 adicional | usar algo como `hub` no domínio já existente; precisa acesso ao DNS |

**Infraestrutura base recomendada: aproximadamente US$45/mês** (Vercel Pro + Supabase Pro), antes de Quo, e-signature, taxas de pagamentos e eventuais excessos de uso.

## 13. Ordem de implementação

1. Aprovar esta demo/UI e enviar o Agreement real.
2. Migrar o front para Next.js sem mudar o layout aprovado.
3. Criar Supabase e aplicar schema/migrations.
4. Implementar login real e RLS para Office/Crew/Client.
5. Migrar Projects/Estimate/WO/Invoice para database.
6. Implementar storage de documentos.
7. Integrar e-signature e liberar Warranty via webhook.
8. Integrar Google Calendar bidirecional.
9. Integrar Quo para SMS + mensagens recebidas.
10. Integrar payments.
11. Criar onboarding/branding/configuração por empresa e cobrança SaaS.
12. Testes de permissão, audit log, backups, rate limits e lançamento.

## 14. Próximos dados que serão necessários

Para a próxima fase técnica, precisaremos, quando chegar a hora:

- Agreement final;
- Care & Maintenance Guide final;
- texto oficial da Warranty;
- quem serão os primeiros Office/Crew/Client reais para teste;
- qual Google Workspace/Calendar será usado;
- acesso/configuração do Quo da empresa;
- decisão SignWell vs Documenso (podemos testar ambos antes);
- decisão Stripe/Square/outro provider;
- acesso ao DNS do domínio escolhido.

Não precisamos decidir tudo isso para continuar refinando a demo.

## 2026-10-09 — Incremento v5: Assistant e Google Calendar

- **Já funciona na mesma sessão de navegador:** entrar como Caritas, Cristiano, Alicia ou Cindy; atalhos por perfil; flags; busca aproximada com pequenos erros no nome; escolha da cliente pelo endereço; confirmação de alteração; gravação local do Job e Work Order ligados; sugestão para escrever a mensagem do cliente; link para criar um rascunho de **novo** evento Google. O centro de compliance exibe uma linha de COI por entidade, abrindo a GL e Workers' Comp dentro dela.
- **Ainda não funciona entre dispositivos:** a sessão atual e o banco de clientes só existem no navegador; não há segurança de verdade ou sincronização automática. Não usar com dados privados. O login aqui não substitui Supabase Auth.
- **Ativação de produção:** ligar um site com backend seguro (ex.: Next.js no Vercel), Supabase Auth/DB/RLS, migração dos projetos para dados reais, domínios HTTPS, Google Cloud OAuth e webhooks, Quo, assinatura eletrônica e pagamentos, auditoria e backups. Não conectar a API em browser público.
- **Google:** o plano técnico detalhado e um adaptador server-side de exemplo estão em `GOOGLE_CALENDAR_IMPLEMENTATION.md` e `google-calendar-service.example.mjs`. A gravação definitiva só pode informar sucesso depois de resposta da API Google; a demo marca corretamente como pendente.
- **Custos aproximados de partida:** infraestrutura Vercel Pro US$20/mês (1 seat) e Supabase Pro US$25/mês (instância Micro coberta pelo crédito), total base US$45/mês, mais domínio, SMS/Quo, assinatura, taxas dos pagamentos e consumo variável. Valores mudam, confira páginas oficiais. Não existe um preço fixo por cliente SaaS antes de definir planos/uso de IA. Links: https://vercel.com/docs/plans/pro-plan e https://supabase.com/pricing.
- **Próxima decisão para implementação real:** qual conta Google será dona do calendário principal; qual e-mail/domínio da empresa será usado no login e no OAuth; quem pode editar calendário; políticas de acesso por função; e documento final do Agreement / care guide.
