# GEORGIA TOP FLOORS HUB — ESPECIFICAÇÃO MESTRA DO PRODUTO

**Data do repasse:** 09/10/2026. **Idioma deste documento:** PT-BR. **Idioma predominante da UI:** inglês natural para o mercado americano; o assistente deve aceitar comandos em português e inglês. **Proprietária do projeto no GitHub:** `cindygatop`. **Repo:** `https://github.com/cindygatop/GeorgiaTopFloorsHub-Demo`. **Branch:** `main`.

## 1. Objetivo, filosofia e contexto

Construir o **Georgia Top Floors Hub**: um sistema web de operação para empresas de flooring nos EUA que conecte escritório, equipes de campo e clientes. A Georgia Top Floors (Georgia, EUA) é a **empresa-piloto/cobaia**. O objetivo estratégico é transformar o Hub em **SaaS multiempresa**, vendido futuramente a outras flooring companies. Não construir nada estruturalmente preso à única empresa: usuário pertence a uma organização, e empresas devem ter seus próprios contatos, projetos, logos, reviews, calendários, equipes, documentos, permissões e cobrança SaaS.

A usuária é a responsável por definir produto e testar visuais; quer pedir alterações em português natural, com você implementando o código integralmente, testando e **fazendo commit/push ao GitHub** quando a integração permitir, para que ela apenas abra o site e confira. Se ela pedir para voltar, reverter a alteração indesejada sem perder o histórico. Não fazê-la construir arquivos/programar/mandar ZIP manualmente a cada mudança. Não prometer alterações que não puder executar. Confirmar resultados concretos via commit URL/CI/deploy.

## 2. Perfis, login e segurança

O sistema será **site com login individual** e ao menos três experiências:

- **Office:** visão geral, gerenciamento completo dos clientes, projetos, estimate, work orders, invoices, agenda, documentos/compliance, mensagens, integrações e assistente.
- **Crew:** visualiza apenas trabalhos, work orders, detalhes e compromissos que lhe foram atribuídos. Pode aceitar work order, reportar problema, registrar andamento, materiais, notas, horários etc. Não exibir valores de invoice/margens por padrão.
- **Client/Customer:** só vê seu(s) próprio(s) projeto(s), status, preparação para o job, agreement, care guide, warranty e futuramente pagamentos.

**Quatro perfis Office iniciais:** Caritas, Cristiano, Alicia, Cindy. A demo v5 inclui `caritas@gtf.demo`, `cristiano@gtf.demo`, `alicia@gtf.demo`, `cindy@gtf.demo`; todos usam senha EXCLUSIVAMENTE DE DEMO `gtf2026`. Também inclui Crew Carlos (`carlos@gtf.demo`) e Client Emily Carter (`emily@gtf.demo`). Esses perfis são **SIMULADOS, NÃO SEGUROS**: estão no JavaScript e dados no `localStorage`. Para produção, usar Supabase Auth ou equivalente com credenciais reais, perfis, sessões server-side, RBAC e RLS. Nunca tratar login/ocultação de tela frontend como controle real de acesso.

## 3. Identidade, UX e experiência visual

Visual premium, contemporâneo, convidativo e **clean**, sem ser seco, plano ou monocromático demais, e também sem excesso de cores, cards e gráficos. Contraste entre seções, hierarquia, espaço negativo, microinterações discretas, tipografia elegante, badges pequenos, destaque brand GTF dourado/amarelo com preto/neutros e cor usada intencionalmente. Não parecer carnaval. O aplicativo atual é percebido como **poluído/carregado**, com itens dispersos; simplificar o que aparece primeiro e manter detalhes acessíveis por aprofundamento.

**Bandeirolas/flags em TODAS as áreas relevantes** (não apenas Compliance): vermelho = atrasado/crítico/urgente; amarelo = próximo do vencimento/pendente; verde = em dia/concluído. Cores discretas, com textos e ícones acessíveis para não depender só da cor. Flags também em cards, listas, jobs, documentos, dashboard e alertas relevantes. Quando houver algo realmente importante, mostrar aviso contextual ao entrar, **sem pop-up repetitivo em todo login**; permitir marcar como visto, navegar ao registro, evitar distração desnecessária.

Toda a UI **Office, Crew, Client** deve ser responsiva de verdade: desktop expandido e mobile adaptado. A versão anterior do Crew ficava limitada a aproximadamente 520 px no desktop; já houve correção inicial na v5, mas é essencial testar em telas reais e evitar voltar ao layout de telefone no PC.

## 4. Dashboard Office = Office Assistant (principal exigência de UX)

O dashboard anterior parecia relatório pesado, seco, com informação dispersa. Substituir a HOME do Office por uma experiência semelhante à abertura do ChatGPT:

- Faixa SUPERIOR com 2–3 pequenos indicadores/pílulas flutuantes e centralizados, numerados por urgência, ex.: `Needs Attention` (vermelho), `Upcoming / Review` (amarelo), `Done / On Track` (verde); clicáveis para ver os itens exatos; escopo geral do Hub.
- CENTRO com logo da GTF, saudação PERSONALIZADA e por horário local da Georgia: `Good morning, Caritas`, `Good afternoon, Cindy`, `Good evening...` + variações de frase humana: `What would you like to take care of today?`, `Ready to make today run smoothly?`, etc.; não congelar numa única frase.
- ABAIXO: caixa ampla de conversa/comando inteligente, não apenas busca simples. Comandos em PT-BR ou EN, entendimento tolerante a erros de digitação, referências a cliente/job, data, hora, serviço, compliance etc. Quando faltar dado, **perguntar em vez de adivinhar**. Para operações críticas, mostrar prévia e exigir confirmação.
- Atalhos pequenos personalizados por Office (Smart Shortcuts): itens que o usuário mais acessa, sem ML caro inventado. Pode começar com frequência + recência (já há heurística v5); futuro `activity_events` e recomendação mais sofisticada quando houver dados.
- Exibir banners de urgência apenas quando fatos concretos justificarem.
- Manter acesso fácil às ferramentas e relatórios completos em rotas próprias e menus, mas não despejá-los na home.

### Exemplo crítico do Assistente

Office digita: `Altere o horário da cliente Emily Carter para amanhã às 14:30` ou `muda o job da Emilly Catrer pra sexta, 2 PM`.

Fluxo obrigatório:
1. Interpretar intenção e identificar possíveis clientes/projetos, tolerando erros de digitação; **não buscar só pelo nome se puder haver duplicidade**. Exibir cidade, endereço e job para desambiguar. Se há 2 Emily, perguntar `Which customer/property?`.
2. Confirmar a cliente e **qual appointment do projeto**; verificar fuso `America/New_York`, disponibilidade crew, dia/data, intervalo, e efeitos do reagendamento.
3. Mostrar de/para, identificando se uma mudança vai afetar outras agendas. Exigir confirmação explícita de staff autorizado.
4. Após confirmar, atualizar **o registro correto** em DB/Jobs/Work Order/assignments e Google Calendar bidirecional quando conectado. Usar IDs persistentes (`project_id`, `appointment_id`, `google_event_id`), não editar por comparação solta de nome.
5. Confirmar sucesso real por componente: sistema salvo, Google alterado ou pendente de integração/erro. Não mentir dizendo que sincronizou.
6. Perguntar: `Would you like me to prepare a message for the customer?` Gerar mensagem profissional, preferencialmente inglês, deixar revisar. **Nunca enviar SMS/email automaticamente sem consentimento explícito.**

O assistente deve crescer para outras tarefas Office (localizar jobs e documentos, revisar prioridades, criar/alterar appointments, planejar mensagens, status de invoices, trabalhos, tarefas). **IA real é objetivo:** backend com LLM + tool calls estruturadas, autorização, validação, audit log e confirmação de operações. A v5 possui apenas parser determinístico local, não modelo de IA generativa. Não expor chave LLM no frontend.

## 5. Modelo de dados e vínculo entre serviços

**Project-first:** Cada trabalho de cliente gera um `Project` central, ao qual pertencem Estimate, Work Order, Invoice, Appointments, documentos/Agreement, Warranty, pagamentos, notas, fotos, crew assignments, comunicação e flags. Relacionar por IDs estáveis, não inferir por nome/endereço. Um mesmo cliente pode ter MAIS de um projeto, mais de um job, vários appointments e múltiplos work orders/invoices quando necessário. O invoice gerado dentro do projeto deve ficar visível no contexto apropriado (Office/Client), e os funcionários só veem o que está dentro de suas permissões. Um projeto contém quem vai fazer **o quê, em qual dia e horário**, com atribuição individual. O crew visualiza os próprios appointments e pode dar acknowledge, registrar status, issue/problem e notas que geram alerta ao Office.

Para SaaS: todas as tabelas de negócio devem ter `organization_id` e toda query/ação ser tenant-scoped; contas multiempresa, memberships, role permissions, policies RLS, audit log, webhook outbox, activity events e preferências do usuário. Arquivo inicial existente: `supabase-schema.sql`, **proposta não aplicada em nenhum banco**. Criar migrações auditáveis, constraints, índices, timestamps e testes de isolamento.

## 6. Compliance Center

Reduzir repetição e complexidade visual, aplicar filtros por **tipo de documento** e busca, agrupamento e flags. `Certificate of Insurance (COI)` deve aparecer **UM ÚNICO CARD/ITEM para cada empresa/subcontractor**. Ao clicar, abrir detalhes de `General Liability`, `Workers' Compensation` e eventuais outras coberturas, com status, prazo, exigências, documento, vencimento, faltantes e ações dentro do COI. **Não** listar COI, GL e Workers Comp como três itens principais duplicados para o mesmo prestador. Demais famílias (W-9 / Tax, Agreements, Licenses, Safety etc.) são categorias independentes coerentes.

W-9: oferecer **revisão/renovação periódica interna** (p.ex. anual configurável) e solicitação de formulário atualizado quando dados mudam; **não afirmar que o formulário W-9 possui expiração federal anual obrigatória**. Filtros por tipo de documento e por urgência. Notificações de vencimento/pendência refletem HOME e áreas correlatas.

## 7. Client View: documentos e contrato

- Botão elegante `Leave Feedback on Google` abrindo **link oficial e direto de escrita de review da Georgia Top Floors**, configurável por organização. A v5 tem URL com place ID no `app-core.js`, **verificar que pertence mesmo ao perfil correto** antes de publicar produção.
- `Before Your Job` / `Steps Before Your Job`: bloco provisório agradável sobre preparar local, retirar objetos frágeis, garantir acesso, atenção à poeira/barulho/cura e revisar documentos. Futuramente textos por tipo de serviço.
- `Agreement` é um documento ONLINE REAL, o PDF/Doc oficial será fornecido pela usuária. Cliente lê, encontra ao final link para `Care & Maintenance Guide`, assina eletronicamente ao concordar. Guardar versão, prova/audit trail, data, certificado e PDF assinado por projeto.
- **Warranty/Guarantee** começa cinza/bloqueada com cadeado e texto ao clicar orientando a abrir `Review & Sign` acima; **só após evento de assinatura confirmado** torna-se verde/desbloqueada. Não usar estado de localStorage da demo como prova legal de assinatura.
- A demo usa typed-name signature local e documentos provisórios; escolher provider de e-signature (SignWell/Documenso ou alternativa com requisitos legais, embedded sign e webhooks). Solicitar à usuária, na hora de integrar, o Agreement real, guia real e termos da garantia.
- No futuro, invoice/payments no próprio Client View com emissão, saldo, comprovantes.

## 8. Crew View

UX responsiva (desktop = tela desktop de verdade, mobile = adaptado). Só exibir trabalhos atribuídos. Um Project liga `Estimate → Work Order → Invoice → Dates/Assignments` internamente, mas crew NÃO visualiza finanças por padrão. Exemplos de ações: abrir endereço no Maps, confirmar work order, registrar andamento, informar problema, fotos/notas, dados stain/finish, horários do appointment e tarefas individuais. Aviso ao funcionário quando novo appointment é atribuído ou remarcado, via notificação interna e SMS (integração Quo planejada). Evitar botões inertes: ações reais na demo devem alterar estado local claramente; integrações indisponíveis devem informar `Setup required / Not connected`, nunca simular envio efetivo.

## 9. Integrações (não conectar credenciais em repositório público)

### Google Calendar, PRIORIDADE ALTA

Sincronização **bidirecional**: criou/mudou no Hub → Google; mudou no Google → Hub. Nem todos os campos precisam sincronizar: campos de interseção são título, início, fim, endereço, projeto/appointment, responsável básico/descrição; notas confidenciais ficam no Hub. Cada alteração exige preservação do ID do evento, política de conflitos, ETag/revisões, timezone Georgia com DST, recorrências quando aplicável, incrementals, notificação push/watch, renovação de canais, rate limits, 410 e prevenção de loops. OAuth com backend seguro, credenciais e refresh tokens por empresa em vault/armazenamento criptografado. Permitir escolher qual calendário é compartilhado; não varrer agenda privada sem consentimento. **O botão atual de v5 abre rascunho de NOVO evento e não edita evento existente, não é sync.** Existe `GOOGLE_CALENDAR_IMPLEMENTATION.md` e `google-calendar-service.example.mjs` como ponto de partida, NÃO backend implantado.

### Quo

Planejar notificações de chegada de mensagens do Quo no Office via webhook, idealmente com identificação de contato/projeto quando inequívoco, e envio de **SMS para crew ao criar/reagendar appointment**. Envio automático somente conforme regras/consentimentos de equipe, ações idempotentes e dedupe; alertas in-app quando mensagens chegam. Não colocar token Quo no browser.

### Assinatura eletrônica

Agreement final + care guide + webhook de assinatura confirmado + Warranty desbloqueada por projeto; avaliar preço legalidade/funcionalidades dos provedores. Audit trail e armazenamento seguro.

### Pagamentos

Futuro pagamento da Invoice via site Client usando integração segura (Stripe Checkout/Elements ou alternativa), backend, webhooks e estado de pagamento. No futuro SaaS, Stripe Connect ou modelo equivalente por empresa, e plano de cobrança pelo uso do Hub deve ser separado dos pagamentos dos clientes finais.

## 10. Publicação / custos / roadmap

**Estado atual:** GitHub Pages / HTML-CSS-JS + `localStorage`, útil para validar a demo, **NÃO É PRODUÇÃO**. O plano recomendado, ainda NÃO definido/contratado: migrar a Next.js ou frontend/backend equivalente estável, hospedar na Vercel, Supabase Auth/PostgreSQL/Storage com RLS, configurar domínio/HTTPS, testes e backups. Baseline de custos referido em outubro/2026: Vercel Pro aproximadamente US$20/mês, Supabase Pro aproximadamente US$25/mês, base ~US$45/mês **sujeita a mudanças**, + domínio/Quo/assinaturas/Stripe/LLM/uso. Pesquisar preços e limites oficiais atuais antes de decidir; não assumir que serviços foram assinados.

Etapas recomendadas, minimizando retrabalho: (1) publicar e testar v5; (2) corrigir QA de responsividade e fluxos; (3) autenticação real + DB multi-tenant e deploy de staging; (4) migrar entidades project-centric + documents; (5) Google Calendar (pedido prioritário), desde que OAuth e owner confirmados; (6) Quo SMS/webhooks; (7) e-signature + Warranty; (8) pagamentos; (9) SaaS onboarding/branding/billing/observabilidade. A UI pode continuar sendo refinada sem esperar contratação de backend.

## 11. Dados/decisões ainda não fornecidos ou confirmados

- Domain/DNS do site e se GitHub Pages continuará somente como demo ou será substituído.
- Conta Google Workspace/calendário que a empresa autorizará, proprietária e permissões.
- Provedor/conta Quo e autoridade de envio de SMS.
- Agreement FINAL da Georgia Top Floors, Care & Maintenance Guide e Warranty oficiais: a usuária disse que enviará quando solicitado.
- Provedor de e-signature e integração de pagamento final.
- Usuários reais (emails/roles), organização(s), dados reais de clientes/crew, políticas de privacidade e retenção, contrato de SaaS.
- URL do Google Business Profile para review: conferir Place ID antes de liberar publicamente.

Até obter esses dados, usar demo/test data, registrar pendências e implementar arquitetura segura sem inventar tokens, URLs ou dados.

## 12. Regras de operação do Codex com a usuária

**A usuária pediu commit direto, não só ZIP.** Para cada alteração de código: abrir o repositório conectado, conferir branch e estado, implementar sem apagar features existentes, rodar verificações pertinentes, criar commit(s) pequenos com mensagens claras e enviar à branch autorizada. O usuário prefere publicar direto na `main` para revisar no site, e solicita reversão se não gostar. Se houver branch protection, aprovação ou PR obrigatória, respeitar e dizer qual clique falta. Para alterações de alto risco, preservar backup/branch/tag antes. Não publicar secrets nem ativar pagamentos/SMS sem permissão e contas configuradas. Relatar **commit SHA/URL**, testes executados, se houve deploy e link de preview/produção comprovado, e pendências reais. Não alegar que deu certo sem confirmação. Usar português e instruções curtas nos retornos.

A **primeira tarefa** após receber o material é subir a v5 que estava pronta e não foi publicada por falta de permissão da integração ChatGPT: comparar a versão da branch `main` com o diretório `CODIGO_V5` deste pacote, aplicar a diferença cuidadosamente, verificar HTML/CSS/JS em desktop e mobile, criar backup (tag/branch) do SHA pré-implantação se possível, commitar e fazer push. Preservar arquivos que existirem só no repo e não forem obsoletos, inclusive `assets/`. Consultar `docs/IMPLEMENTATION_STATUS.md` e `docs/QA_ACCEPTANCE.md` do pacote para evitar anunciar recursos simulados como verdadeiros.


## 13. Decisões da plataforma Emet — 15/10/2026

- A plataforma geral se chama **Emet**; cada empresa mantém seu próprio Hub e identidade. A assistente se chama **Ruach**.
- A entrada de colaboradores exige código do gerente, vinculado à empresa, destinatário e papel. A senha definitiva é escolhida no cadastro. Verificação de email e aprovação autenticada do gerente são requisitos separados; a função não pode ser elevada por seleção livre na tela.
- Client acessa projeto específico com convite e verificação por email, sem link público permanente que conceda acesso sozinho.
- Perfil acessível pela foto: avatar, nome e, após ativação do backend, alterações seguras de email/senha. Dois perfis Office usarão aliases distintos de uma caixa compartilhada; isso não torna a recuperação independente. Endereços reais ficam fora do Git público.
- Integrações ficam nas configurações e em seus contextos (Calendar, sugestões do Ruach). Explicar leitura/escrita e consentimentos; Gmail é opcional e separado de Calendar. Quo recebe guia interativo; nenhum segredo é guardado no navegador.
- Certificate of Acceptance recebido: aceite após a conclusão, separado do contrato inicial, com QR substituído por links. Care Guide oficial: https://georgiatopfloors.com/care-maintenance/. A usuária confirmou o Google Review existente. Contrato inicial e termos oficiais da garantia continuam pendentes.
- CSV de contatos e XLSX de produtos/preços foram recebidos como dados privados. Permitir importação, exportação, revisão de duplicatas e edição; não publicar anexos nem valores reais no repositório. Sem backend seguro, revisão somente em memória e exportação explícita.
- Projeto Vercel informado: gtf12/gtf-hub. Publicação pelo GitHub comprovada; a recusa administrativa inicial (403) foi resolvida na retomada, com acesso ao projeto e configurações iniciais confirmados. Aproveitar o projeto, sem criar outro por suposição.
- Pedido adicional: Ruach deve responder a cumprimentos e conversa inicial PT/EN de modo útil. Respostas por regras não podem ser anunciadas como LLM ou aprendizado de máquina conectados. Preservar confirmação de alterações, contexto e IDs dos projetos.
- A usuária forneceu projeto Supabase e os emails restantes de Cindy/Caritas. Plano privado: Cindy owner, Cristiano/Alicia admin, Caritas Office; convites e verificação continuam obrigatórios. Recebimento de dados não equivale a provisionamento.
- Ruach deve compreender linguagem informal e erros como “criar incoice”, preparar/editar rascunhos com seleção de projeto e confirmação. A conversa com modelo real exige backend autorizado e deve distinguir propostas de operações executadas; não misturar dados da demo com a conta real.

Detalhes e limites atuais: EMET_AUTH_SETUP.md, EMET_SERVICES_AND_BUDGET.md e ACCEPTANCE_DOCUMENT.md.
