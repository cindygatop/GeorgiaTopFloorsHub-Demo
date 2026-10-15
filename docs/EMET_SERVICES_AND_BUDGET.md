# EMET — serviços, banco de dados e orçamento

Pesquisa em fontes oficiais consultadas em **15 de outubro de 2026**. Valores em **dólares dos EUA**, antes de impostos. As tabelas são planejamento, não contratação, confirmação de integração ou orçamento fechado. Georgia Top Floors é a empresa piloto da plataforma EMET.

## Recomendação em linguagem simples

Para começar a operar, a combinação recomendada é **Vercel Pro + Supabase Pro**, com base de **US$45/mês** para um projeto Supabase Micro e um responsável por publicação na Vercel, dentro das franquias. Acrescentamos consumo de IA, assinatura, mensagens e pagamentos conforme o uso. A conta Quo que a empresa já paga deve ser aproveitada; sua assinatura não deve entrar uma segunda vez como custo novo do Hub.

Os quatro usuários Office, toda a Crew e os clientes são usuários do aplicativo. **Não precisamos de quatro assentos Vercel:** um assento de publicação está incluído no Pro. Empresas atendidas pela EMET também não exigem, automaticamente, um banco ou projeto Supabase separado para cada uma.

A usuária confirmou o projeto Vercel `gtf12/gtf-hub`. O GitHub registrou deployment Production bem-sucedido do HEAD anterior; o vínculo de publicação existe. A conexão administrativa disponível recebeu HTTP 403 ao acessar a equipe `gtf12`; é preciso acesso a essa equipe para configurar variáveis e serviços. Não criar outro projeto por suposição. **Supabase ainda precisa ser criado/conectado.** Senhas, chaves de API e dados bancários devem ser configurados nos painéis dos serviços, nunca publicados no GitHub ou enviados em conversa.

## Como será nosso banco de dados

O banco será o arquivo central compartilhado: pessoas, empresas, permissões, clientes, projetos, agenda, work orders, invoices, pagamentos, estado dos documentos e histórico das alterações. Um funcionário no celular e o Office no computador consultarão os mesmos registros autorizados.

**PostgreSQL** combina com esse produto porque os dados têm relações: uma empresa tem usuários; um cliente tem vários projetos; cada projeto possui appointments, equipe, documentos e cobranças. O Supabase reúne PostgreSQL, login e armazenamento de arquivos no mesmo serviço.

Há três partes distintas:

| Parte | Exemplo | Onde fica |
|---|---|---|
| Banco de dados | Cliente, horário, saldo, documento assinado, vínculo com projeto | PostgreSQL |
| Arquivos | PDF do Agreement, COI, fotos, guia e comprovantes | Storage privado; o banco guarda referência e permissões |
| Identidade e acesso | Quem entrou e o que pode consultar ou alterar | Auth + permissões no servidor e no banco |

Cada empresa terá um identificador (`organization_id`). As regras devem impedir acesso cruzado entre empresas. Office gerencia a operação; Crew recebe suas atribuições e campos permitidos; Client acessa seus projetos. O banco precisa proteger os dados mesmo quando alguém tenta chamar a API diretamente. Ocultar um botão não oferece essa proteção.

Uma mesma infraestrutura pode atender várias empresas. Podemos separar bancos para necessidades contratuais ou de escala futuras, mas isso não é requisito para cada nova empresa. Produção e teste devem ter ambientes separados quando iniciarmos o piloto real. Cada pessoa terá login individual; sua conta pessoal de email não concede, por si só, acesso às outras empresas.

Usar PostgreSQL e migrações versionadas facilita exportação e mudança de provedor. Recursos específicos de Auth, Storage e Realtime ainda exigem trabalho de migração; portabilidade não significa troca sem implementação.

## Opções viáveis de banco e serviços associados

| Opção | Entrada e preço publicado | Login e arquivos | Backups, tráfego e adequação à EMET |
|---|---|---|---|
| **Supabase Free** | US$0; 500 MB de banco, 1 GB de arquivos, 50 mil usuários ativos/mês | Auth e Storage incluídos | Pausa após 7 dias sem atividade; 5 GB de saída sem cache + 5 GB com cache; sem backup automático. Bom para desenvolvimento e teste restrito. |
| **Supabase Pro — recomendado para piloto** | US$25/mês; crédito de US$10 cobre um Micro; 8 GB de disco de banco por projeto, 100 GB de arquivos, 100 mil usuários ativos/mês | Auth, Storage privado e Realtime | Backups diários do banco com 7 dias; 250 GB de saída sem cache + 250 GB com cache. Cobrança adicional por uso/compute. |
| **Neon** | Free: US$0, 1 GB de PostgreSQL e 100 CU-h/mês por projeto. Launch: US$0,106/CU-h + US$0,35/GB-mês de banco, sem mínimo mensal | A página atual também inclui Better Auth gerenciado e Object Storage; Free com 5 GB de arquivos | Alternativa PostgreSQL válida. Launch anuncia exemplo de US$15/mês para carga intermitente, não mensalidade fixa. Histórico, snapshots, arquivos e funções têm medidores próprios. |
| **Firebase / Firestore** | Spark gratuito dentro das franquias; Blaze cobra consumo. Firestore: 1 GiB de dados, 50 mil leituras/dia, 20 mil escritas/dia, 10 GiB de saída/mês gratuitos | Firebase Auth; arquivos em Cloud Storage, com faturamento Blaze exigido | Firestore é banco de documentos, demandaria outro modelo para nossas relações. Operações, região, backups e tráfego alteram a conta. Não é minha primeira escolha para o modelo já definido. |
| **PostgreSQL gerenciado, exemplo DigitalOcean** | Tabela atual começa em US$15,15/mês para nó de 1 GiB/1 vCPU; capacidade e disco alteram preço | Login do aplicativo e arquivos são serviços adicionais; Spaces: US$5/mês para 250 GiB e 1 TiB de saída | Backup diário de DB gerenciado incluído. Nó único não é alta disponibilidade; planejar HA separadamente. Boa alternativa quando queremos montar mais peças por conta própria. |
| **Auto-hospedar PostgreSQL / Supabase** | Licença de software não gera mensalidade de hospedagem. Exemplo VPS: US$12/mês para 2 GiB; Supabase completo exige mais recursos | PostgreSQL sozinho não inclui portal de login/arquivos. Supabase completo pode reuni-los, com manutenção própria | Para Supabase completo, mínimo oficial 4 GB RAM/2 cores/40 GB SSD; VPS de exemplo correspondente: US$24/mês. Backup de VM semanal +20% ou diário +30%, além da estratégia de cópia/restauração do banco e arquivos. |

Fontes: [Supabase preços](https://supabase.com/pricing), [Supabase tráfego](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [Neon preços](https://neon.com/pricing), [Firebase preços](https://firebase.google.com/pricing), [Firebase Storage e Blaze](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [DigitalOcean DB](https://www.digitalocean.com/pricing/managed-databases), [DigitalOcean Spaces](https://www.digitalocean.com/pricing/spaces-object-storage), [VPS](https://www.digitalocean.com/pricing/droplets), [backups VPS](https://www.digitalocean.com/pricing/backups), [Supabase auto-hospedado](https://supabase.com/docs/guides/self-hosting/docker).

No Neon Launch, por exemplo, 140 CU-h e 1 GB de dados resultam em **140 × US$0,106 + US$0,35 = US$15,19**, antes de histórico e outros serviços. Dois exemplos diferentes não permitem concluir que um provedor será sempre mais barato. Hoje, o Supabase reduz peças a integrar e aproveita o modelo proposto no projeto.

No Firebase, SQL Connect oferece também uma opção PostgreSQL sobre Cloud SQL: teste de três meses e preço anunciado a partir de US$9,37/mês, dependente de região/configuração, mais operações e demais serviços. Isso não torna Firestore um PostgreSQL nem inclui todos os componentes por esse valor. [Tabela oficial Firebase](https://firebase.google.com/pricing).

Na DigitalOcean, a documentação genérica ainda menciona entrada de US$15, enquanto a tabela comercial consultada mostra US$15,15. Usamos a tabela comercial neste orçamento; confirmar o carrinho/região. O tráfego do banco gerenciado não consome a franquia de transferência. Há mudanças de planos Standard a partir de 15/10/2026 para novas contas; não presumir standby/HA incluído. [Condições atuais PostgreSQL](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/).

### O que pode aumentar a conta do Supabase

- Um segundo projeto Micro sempre ativo acrescenta aproximadamente **US$10/mês**: US$25 do plano + US$20 de compute − US$10 de crédito = US$35. Um projeto de produção Small + um Micro de teste dá US$25 + US$15 + US$10 − US$10 = **US$40/mês**.
- Arquivos acima de 100 GB: **US$0,0213/GB-mês**; disco de banco é outro medidor. [Storage](https://supabase.com/docs/guides/storage/pricing), [disco de banco](https://supabase.com/docs/guides/platform/manage-your-usage/disk-size).
- Saída além da franquia: **US$0,09/GB sem cache** e **US$0,03/GB com cache**. Fotos grandes, downloads repetidos e vídeos podem dominar o consumo. [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).
- Restauração para um instante específico, PITR: aproximadamente **US$100/mês para 7 dias**, além do plano e compute mínimo Small. O plano Pro já tem backups diários; PITR é adicional opcional. **Backup do banco não inclui os arquivos do Storage**: precisamos de política própria para PDFs e fotos. [Backups e PITR](https://supabase.com/docs/guides/platform/backups).

## Hospedagem Vercel

| Plano | Preço/regras | Aplicação ao projeto |
|---|---|---|
| Hobby | US$0; uso pessoal e não comercial | Não usar como solução permanente de operação comercial da EMET/GTF. |
| Pro | US$20/mês; inclui 1 assento que publica e US$20/mês de crédito de infraestrutura; excesso é medido | Recomendado para o piloto comercial. Os usuários Office/Crew/Client não são assentos da Vercel. |
| Assento adicional de publicação | US$20/mês por Owner/Member adicional | Só contratar se outra pessoa precisar administrar/publicar na Vercel. Viewer é gratuito. |

O crédito não elimina a mensalidade nem paga Supabase, Quo, Stripe ou IA externa. Configuraremos alertas e limites adequados; o alerta padrão de gasto da Vercel é US$200/ciclo, portanto não deve ser confundido com teto de US$20. [Vercel Pro](https://vercel.com/docs/plans/pro-plan), [restrições Hobby](https://vercel.com/docs/plans/hobby).

## Integrações e custos reais

### Google Calendar, Gmail, Outlook e Drive

| Integração | O que vale implementar | Conta, autorização e custo |
|---|---|---|
| **Google Calendar — prioridade** | Hub ↔ Google; evento ligado por ID ao appointment; confirmação de mudanças, conflitos e disponibilidade | Conta/calendário empresarial escolhido, Google Cloud, API e OAuth. Uso padrão sem tarifa adicional; limite diário de referência 1 milhão de requisições/projeto. A documentação ainda anuncia cobrança acima dos limites para depois em 2026, com aviso prévio; não há preço definitivo a inventar. |
| **Gmail — opcional** | Leitura contextual de conversas profissionais e rascunhos revisáveis, somente se desejado | OAuth separado e consentimento do titular. `gmail.readonly` e até `gmail.metadata` são escopos restritos; `gmail.send` é sensível. Leitura por servidor pode exigir verificação e avaliação de segurança, com custo de auditor a cotar. Não incluir acesso à caixa inteira silenciosamente. |
| **Outlook / Microsoft 365 — opcional** | Alternativa para calendário e email de empresas que usam Microsoft | Aplicativo Entra/OAuth, caixa/licença compatível e consentimento. APIs Graph padrão normalmente estão incluídas na licença, dentro dos limites; existem APIs específicas tarifadas. `Mail.Read` concede leitura ampla; política da empresa pode exigir aprovação administrativa. |
| **Google Drive — opcional** | Escolher arquivos específicos para anexar/importar ao projeto | Preferir Google Picker + `drive.file`, com seleção explícita. Não precisa varrer todo o Drive nem dar acesso ao Gmail. Storage do Drive e suas assinaturas são externos à franquia de arquivos do Hub. |

Fontes: [Calendar limites e preços](https://developers.google.com/workspace/calendar/api/guides/quota), [escopos Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes), [verificação e exceções OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [Microsoft Graph cobrança](https://learn.microsoft.com/en-us/graph/metered-api-overview), [permissões Microsoft](https://learn.microsoft.com/en-us/graph/permissions-reference), [Drive mínimo necessário](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

A avaliação OAuth depende do público e dos escopos. Um app interno de uma organização Workspace pode se enquadrar em exceção; abrir o SaaS para outras empresas muda a avaliação. Não prometer aprovação automática nem prazo/custo de auditoria sem análise. Calendar não exige, por si só, comprar Google Workspace. Login com Google também não concede automaticamente acesso a Gmail, Drive ou Calendar.

Mensagens para clientes continuam exigindo revisão e consentimento explícito para envio. Um rascunho não é um email/SMS enviado. Ativar leitura de Gmail/Outlook é uma decisão adicional; não bloqueia banco, agenda, Compliance ou portal.

### Quo: aproveitar a conta existente

A API atual está incluída em **todos os planos**, inclusive Starter. Não precisamos migrar para Business apenas para ter API. Quatro usuários Office no Hub também não obrigam comprar quatro novos assentos Quo. [Planos oficiais Quo](https://www.quo.com/pricing).

| Item | Preço oficial/efeito |
|---|---|
| Business anual | US$23 por usuário/mês equivalente, cobrado anualmente |
| Business mensal | US$33 por usuário/mês |
| Exemplo de 4 assentos Business | US$1.104/ano no anual, equivalente a US$92/mês; ou US$132/mês no mensal |
| SMS automatizado via API | US$0,01 por segmento enviado a EUA/Canadá, em créditos pré-pagos |
| Exemplo de consumo | 1.000 segmentos = US$10; 5.000 = US$50 |
| Registro para textos a números americanos | US$19,50 uma vez; campanha US$1,50–3/mês; US$15 de reapresentação se necessária |

SMS longo ou com certos caracteres pode consumir vários segmentos. Recebimento não gera essa tarifa de SMS enviado pela API; a API atual não suporta MMS. A conta, número e aprovação reais devem ser conferidos no painel. Se assinatura/registro já constam da conta existente, não somar novamente como contratação da EMET. [API e consumo](https://www.quo.com/docs/mdx/pricing-support/pricing-overview), [registro e billing](https://support.quo.com/core-concepts/administration/billing/pricing).

Implementaremos envio de appointment/reagendamento, alerta de mensagens recebidas, estados de entrega, deduplicação e regras por empresa. Webhook recebido não deve ser associado a um cliente apenas por nome semelhante.

### Assinatura eletrônica e garantia

| Serviço | Preço publicado | Adequação |
|---|---|---|
| **SignWell API** | 25 documentos API/mês gratuitos **com cartão cadastrado**; excedente começa em US$0,85/documento, com descontos por volume | Sem mensalidade mínima ou assentos de API. Assinatura incorporada, templates, webhooks e audit trail. Bom candidato ao piloto. |
| SignWell desenvolvedor sem essa ativação | Até 3 documentos/mês anunciados e testes API ilimitados | Não presumir os 25 de produção sem cartão/condições da conta. |
| **Documenso Teams** | US$40/mês equivalente, **US$480 cobrados por ano**, 5 usuários | API para automação e assinatura incorporada. Escolha com custo mais previsível se o plano atender ao volume. |
| Documenso Platform | US$250/mês equivalente, **US$3.000 por ano** | API, documentos/usuários ilimitados e assinatura incorporada com marca própria; opção futura de plataforma. |

Fontes: [SignWell preços API](https://www.signwell.com/api-pricing/), [SignWell recursos API](https://www.signwell.com/api/), [Documenso preços](https://documenso.com/pricing).

Exemplo conservador SignWell: 50 documentos/mês → (50 − 25) × US$0,85 = **US$21,25**; 100 → **US$63,75**, sem aplicar descontos de volume. Um documento API pode ter vários arquivos/signatários. Na página Documenso consultada, os valores acima são anuais; não converter em promessa de mensalidade avulsa. Individual de US$25/mês equivalente tem API para uso pessoal e não é a indicação para automação empresarial. Editor incorporado é diferente de assinatura incorporada e tem condições adicionais. [Editor Documenso](https://docs.documenso.com/docs/developers/embedding/editor/v2).

O Certificate of Acceptance foi recebido e confirmado como aceite no final da obra, separado do contrato inicial; o guia oficial é https://georgiatopfloors.com/care-maintenance/. Ainda precisamos do Agreement inicial e dos termos oficiais de Warranty para configurar os documentos correspondentes. A implementação guardará versão, PDF e evidências por projeto e liberará a garantia após webhook autenticado de assinatura concluída. O provedor não substitui a aprovação do conteúdo oficial da empresa.

### Pagamentos Stripe — EUA

| Item | Tarifa padrão publicada |
|---|---|
| Cartão doméstico online | 2,9% + US$0,30 por transação bem-sucedida |
| Cartão internacional | Acréscimo de 1,5% |
| Conversão cambial | Acréscimo de 1% quando necessária |
| ACH Direct Debit | 0,8%, com teto de US$5 por pagamento |
| Stripe Payments / Checkout / Elements padrão | Sem mensalidade de Payments; processamento por uso |

Fontes: [Stripe preços EUA](https://stripe.com/pricing?filtertags=website-development), [Checkout](https://stripe.com/payments/checkout), [Elements](https://stripe.com/payments/elements).

Cálculos de processamento: US$1.000 no cartão doméstico → **US$29,30**; US$5.000 → **US$145,30**. Em ACH, ambos atingem **US$5**. Esses exemplos não incluem validação bancária, falha, disputa, reembolso, pagamento acelerado, Invoicing ou Connect. ACH pode ter prazo e risco de retorno diferentes; a invoice só deve ser quitada conforme o evento apropriado do provedor.

Podemos gerar a Invoice no próprio Hub. Se contratarmos **Stripe Invoicing**, Starter adiciona 0,4% e Plus 0,5% por invoice paga, além do processamento. Invoice pós-compra avulsa no Checkout é outra opção com preço/limites próprios; não confundir os produtos. [Stripe Invoicing](https://support.stripe.com/questions/stripe-invoicing-pricing?locale=en-GB).

No piloto, a GTF recebe em sua conta. Para empresas diferentes receberem nas próprias contas, avaliar **Stripe Connect**. Se Stripe cobra as connected accounts diretamente, a página não cobra tarifa extra de plataforma por contas/payouts; se a plataforma define seu preço, há US$2 por conta ativa/mês e 0,25% + US$0,25 por payout, além de processamento. [Stripe Connect](https://stripe.com/connect/pricing). Cobrança da assinatura da EMET é separada dos pagamentos dos clientes das flooring companies.

### IA: API, modelo aberto ou treinamento

**Recomendação para o piloto:** API no servidor, com limite de uso, ferramenta de busca no nosso banco e confirmação humana das ações. Não precisamos treinar um modelo do zero para ele entender os dados autorizados da empresa. O modelo recebe o contexto necessário na hora; o backend continua responsável por permissões e gravações.

| Opção | Custo real | Quando faz sentido |
|---|---|---|
| API de modelo econômico | Por tokens; exemplo atual `gpt-6-luna`, contexto curto padrão: US$0,10/milhão de entrada e US$0,50/milhão de saída | Interpretar comandos, preparar mensagens e tarefas simples, após testes de qualidade. |
| API de modelo mais capaz | Exemplo `gpt-6.1-sol`, contexto curto padrão: US$2/milhão de entrada e US$10/milhão de saída | Casos complexos e fallback; não precisa usar em todos os pedidos. |
| Modelo aberto auto-hospedado | Pesos gpt-oss disponíveis; hospedagem, memória/GPU, energia, manutenção e operação continuam tendo custo | Avaliar com volume, privacidade ou requisitos específicos; não há cotação de GPU incluída neste orçamento. |
| Ajustar/treinar modelo | Dados preparados, avaliações, computação e operação; sem preço universal | Não é dependência para colocar a EMET em funcionamento. Preferir primeiro contexto, ferramentas e testes. |

Fonte de tarifas: [OpenAI API preços](https://developers.openai.com/api/docs/pricing). Valores são por tokens efetivamente cobrados, não por funcionário, mensagem ou assinatura ChatGPT. Contextos longos, modos de processamento, raciocínio e ferramentas podem mudar a cobrança. A API possui [faturamento separado da assinatura ChatGPT](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform). A plataforma de fine-tuning OpenAI está sendo encerrada para novos usuários, conforme a página atual; não planejar sua contratação como requisito do Hub.

Exemplo reproduzível, sem cache: uma chamada com 2.000 tokens de entrada + 500 de saída custa **US$0,00045 no Luna** ou **US$0,009 no Sol**. Mil chamadas desse tamanho: **US$0,45 / US$9**. Um comando pode gerar várias chamadas; o tamanho real do histórico, documentos e saídas altera o total. Os exemplos não incluem busca web, voz, imagem ou serviços externos.

Para gpt-oss-20b, a OpenAI indica 16 GB de memória com quantização MXFP4; o 120b cabe em GPU de 80 GB na configuração indicada. Outro formato pode exigir mais: o guia Transformers menciona cerca de 48 GB para 20b em bfloat16. Isso é requisito de configuração, não garantia de concorrência, velocidade ou custo zero. [Repositório oficial gpt-oss](https://github.com/openai/gpt-oss), [guia de execução](https://developers.openai.com/cookbook/articles/gpt-oss/run-transformers), [licença e uso](https://help.openai.com/en/articles/11870455-openai-open-weight-models).

### Mapas, localização e ETA

Preços globais Google Maps, por SKU, no primeiro intervalo pago:

| Uso | Franquia mensal sem cobrança | Depois da franquia, até 100 mil eventos |
|---|---:|---:|
| Dynamic Maps | 10 mil carregamentos | US$7 por mil |
| Routes Compute Routes Essentials | 10 mil solicitações | US$5 por mil |
| Routes Compute Routes Pro | 5 mil solicitações | US$10 por mil |
| Geocoding | 10 mil solicitações | US$5 por mil |
| Maps Embed | Uso ilimitado sem tarifa do SKU listado | Não fornece sozinho tracking/ETA |

Franquias e volume são agregados pela conta de faturamento nos critérios do Google, não uma nova cota para cada usuário da EMET. Tráfego em tempo real e recursos avançados podem acionar SKU Pro. O orçamento não deve assumir que todo ETA usa o SKU Essentials. [Tabela oficial Maps](https://developers.google.com/maps/billing-and-pricing/pricing), [Routes billing](https://developers.google.com/maps/documentation/routes/usage-and-billing).

Precisamos de faturamento Google Cloud, APIs e chaves com restrições adequadas. O navegador do funcionário precisa autorizar localização. Compartilhar somente durante o trajeto autorizado e interromper ao chegar; mostrar quando posição está antiga/indisponível. Navegador pode suspender localização com aplicativo em segundo plano/tela bloqueada; rastreamento contínuo robusto pode exigir solução móvel própria. Não declarar que a animação da demo oferece GPS real.

### Email transacional e domínio

Login por convite/reset e notificações do sistema precisam de envio de email confiável. O SMTP padrão Supabase é de teste, limitado atualmente a endereços da equipe e 2 emails/hora; não serve para usuários reais do portal. [SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

**Resend** é uma opção: Free com 3.000 emails/mês e 100/dia; Pro **US$20/mês para 50 mil emails**, sem limite diário, e excedente de US$0,90/mil na tabela consultada. [Preços Resend](https://resend.com/pricing).

Para enviar por Resend, precisamos verificar um domínio que controlamos, com DNS. Uma conta `@gmail.com` usada para administrar os serviços ou receber respostas **não é domínio verificado de envio**. Podemos usar endereço no domínio da empresa para From e endereço pessoal como Reply-To quando apropriado. Isso não exige assinar quatro caixas Google Workspace só para enviar convites. [Domínios verificados Resend](https://resend.com/docs/dashboard/domains/introduction).

Google Domains foi adquirido e migrado para **Squarespace**; não recomendar abrir uma conta nova no antigo Google Domains. [Migração oficial](https://support.squarespace.com/hc/en-us/articles/17131164996365-About-the-Google-Domains-migration-to-Squarespace).

| Registrador | .com padrão, registro de 1 ano | Renovação anual publicada | Recomendação |
|---|---:|---:|---|
| **Cloudflare Registrar** | US$10,46 | US$10,46 | Bom preço transparente; usar DNS Cloudflare e configurar registros para Vercel/email. |
| **Porkbun** | US$11,08 | US$11,08 | Alternativa simples; confirmar preço do nome específico no carrinho. |
| **Squarespace** | Referência US$20/ano | Referência US$20/ano | Pode manter se o domínio já estiver lá; não exige transferir para hospedar na Vercel. |

Fontes: [Cloudflare preços](https://pricing.registrar.cloudflare.com/), [Cloudflare regras de DNS](https://developers.cloudflare.com/registrar/get-started/register-domain/), [Porkbun tabela](https://porkbun.com/products/domains), [Squarespace FAQ](https://support.squarespace.com/hc/en-us/articles/205812208-Squarespace-domains-FAQ). Domínio premium, aquisição de terceiro, impostos, restauração e mudanças futuras não estão incluídos. As tabelas não confirmam disponibilidade nem registram uma marca/nome.

Usar subdomínio de um domínio que a empresa já possui normalmente evita outro registro anual. A oferta atual de domínio grátis no primeiro ano do Vercel Pro inclui TLDs específicos e **não inclui .com**; renovação futura é paga. Uma URL HTTPS Vercel serve para testes do site, mas a configuração de produção/OAuth e do remetente deve usar domínios apropriados e verificáveis. [Oferta Vercel](https://vercel.com/docs/plans/pro-plan#free-first-year-domain-with-pro).

## Cinco cenários de orçamento

**São cenários calculados, não nomes de planos comerciais.** Todos consideram uma empresa piloto, quatro Office e **um assento de publicação Vercel**. Não compram novos assentos Quo: partem da conta existente. Valores mostram os componentes listados, sem impostos, domínio, registro/campanha SMS, processamento de pagamentos ou excessos não descritos.

Para IA, uma chamada pequena significa 2.000 tokens de entrada + 500 de saída no modo padrão de contexto curto, sem cache nem ferramentas cobradas. São hipóteses de consumo, não previsão garantida de solicitações reais. Calendar, geocoding e carregamentos de mapas ficam dentro das franquias, salvo o uso adicional explicitado no Plus.

| Componente mensal | Mínimo: validação interna | Básico: piloto real | Médio: rotina maior | Ótimo: ambientes separados | Plus: plataforma e recuperação |
|---|---:|---:|---:|---:|---:|
| Vercel Pro | US$20 | US$20 | US$20 | US$20 | US$20 |
| Supabase | Free: US$0 | Pro/Micro: US$25 | Pro/Micro: US$25 | Pro/2 Micro: US$35 | Pro/Small + Micro: US$40 |
| PITR 7 dias | — | — | — | — | ~US$100 |
| Email | Free: US$0 | Free: US$0 | Pro: US$20 | Pro: US$20 | Pro: US$20 |
| IA, hipótese | 200 Luna: US$0,09 | 1.000 Luna: US$0,45 | 10.000 Luna: US$4,50 | 5.000 Sol: US$45 | 20.000 Sol: US$180 |
| Assinatura | SignWell, até 25: US$0 | SignWell, até 25: US$0 | SignWell, 50: US$21,25 | Documenso Teams: US$40* | Documenso Platform: US$250* |
| SMS API | 200 segmentos: US$2 | 1.000: US$10 | 3.000: US$30 | 5.000: US$50 | 10.000: US$100 |
| Maps, hipótese | US$0 | US$0 | US$0 | US$0 | 20 mil Routes Essentials: US$50 |
| **Subtotal ilustrativo** | **US$22,09/mês** | **US$55,45/mês** | **US$120,75/mês** | **US$210/mês** | **~US$760/mês** |

\* Documenso: equivalência mensal de pagamento anual, US$480/ano ou US$3.000/ano, não cobrança mensal avulsa verificada. SignWell gratuito exige cartão e condições da franquia de 25 documentos. No Plus, os demais SKUs Maps permanecem dentro de suas franquias; mais uso ou SKU Pro muda o valor. O PITR é aproximado e cobrado por hora.

O **Mínimo é desenvolvimento/teste**, com limites Free e sem backup automático do banco; não é recomendação para sustentar a operação da empresa. **Básico é meu ponto de partida para o piloto**, depois de segurança, backups de arquivos, integrações e testes reais implantados. Os níveis maiores ilustram volume ou recursos opcionais, não obrigatoriedade de comprar tudo para funcionar. Podemos manter SignWell no nível Ótimo ou escolher outro provedor; nesse caso recalculamos o total.

### Custos que somam por fora

- **Quo já existente:** manter assinatura atual na contabilidade da empresa; não pagar outra vez. Se a empresa contratar quatro assentos Business novos, somar US$92/mês equivalente anual ou US$132/mês no mensal. A necessidade de assentos depende de quem usa Quo diretamente, não do número de logins Hub.
- **SMS:** somar campanha US$1,50–3/mês e US$19,50 inicial somente se ainda não estiverem cobertos pelo registro/fatura existente; impostos, novos números e reapresentação quando aplicáveis.
- **Domínio:** aproximadamente US$10,46, US$11,08 ou US$20 por ano nos exemplos .com padrão, cobrado anualmente. Não multiplicar isso por mês.
- **Pagamentos:** somar tarifas sobre o dinheiro recebido; não cabem em uma mensalidade fixa do site. Exemplo: US$10 mil distribuídos em dez pagamentos de US$1.000 no cartão doméstico → **US$293** de processamento; em ACH → **US$50**, sem outros extras.
- **Consumo e operação:** excesso Vercel, fotos/PDFs e saída de dados, cópia externa de arquivos, logs, monitoramento pago, tarefas e filas conforme serviço, mudanças de planos, auditoria OAuth, assessoria contratual, serviços móveis e suporte. Não há preço fechado de desenvolvimento/manutenção embutido nestes subtotais.
- **Google Workspace/Microsoft 365:** se quisermos novas caixas profissionais/licenças, são contratações separadas. Usar uma conta/calendário existente autorizado não implica comprar quatro licenças novas.

## Contas e cliques necessários

1. **Vercel:** entrar na conta existente, selecionar equipe correta, conferir plano e faturamento; autorizar o repositório GitHub e criar/importar o projeto EMET. Configurar variáveis nos ambientes apropriados e limites de gasto. Se a conexão não mostrar a equipe/projeto, corrigir a autorização; não criar duplicatas por suposição.
2. **Supabase:** criar conta/organização de propriedade da empresa e um projeto em região apropriada para os EUA; começar Free para implementação ou Pro quando o piloto estiver pronto. Configurar Auth/URLs, Storage privado, SMTP, migrações e permissões. Uma organização do painel Supabase não precisa representar cada empresa cliente do produto.
3. **Domínio e email:** usar domínio existente ou escolher nome disponível; acesso ao DNS para Vercel e verificação do remetente. Criar/conectar Resend ou outro SMTP; registrar o remetente no painel. Não enviar senha/chave no chat.
4. **Google:** escolher proprietária e calendário(s) autorizados; criar/configurar Google Cloud e OAuth; conectar pelo fluxo Google. Adicionar Gmail/Drive somente se desejados e com consentimentos separados.
5. **Quo:** administrador confere plano atual, número, API e registro de SMS. Configurar chave/webhooks no backend e contatos/consentimentos da equipe; executar teste autorizado de ponta a ponta antes de ativar regras automáticas.
6. **Documentos:** fornecer Agreement, Care Guide e Warranty finais; criar/conectar o provedor escolhido e configurar template/webhook. Testar assinatura e garantia no projeto correto.
7. **Stripe:** conectar/criar conta empresarial; concluir identidade e recebimento bancário dentro do painel Stripe. Começar no ambiente de teste; ativar cobrança real após conferir valores e eventos. Não copiar dados bancários para GitHub/conversa.
8. **IA e Maps:** conectar conta API/faturamento e limites; separar chaves de desenvolvimento/produção e restringir uso. Testar qualidade e falhas antes de deixar ações alterarem dados.

A usuária precisa conectar contas sob sua titularidade e fornecer dados/documentos da empresa. O Codex implementa código, permissões, banco, integrações, testes e publicação. Podemos construir e testar localmente a maior parte dos fluxos enquanto essas contas são preparadas; integração de produção só fica concluída após confirmação das APIs e testes reais.

## Decisões já preservadas

Não precisamos perguntar novamente se o produto terá Office/Crew/Client, será multiempresa, usará projeto central, terá Calendar nos dois sentidos, Quo, assinatura antes da garantia ou UI responsiva com flags discretas. Quatro nomes Office já foram definidos. Dois perfis usarão aliases separados de uma caixa empresarial compartilhada, conforme pedido; faltam os outros emails reais e a responsável administradora. Endereços individuais de configuração não são gravados neste documento público. As explicações continuam em português; mudanças devem preservar funcionalidades e histórico, com commits, testes e reversão conforme autorização.

**As escolhas de plano acima ainda são recomendações. Nenhuma assinatura, domínio, integração ou cobrança foi ativada pela preparação deste documento.**
