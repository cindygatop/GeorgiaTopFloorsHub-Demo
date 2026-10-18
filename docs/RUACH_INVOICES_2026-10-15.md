# Ruach — invoices, conversa e acesso administrativo

Incremento de 15/10/2026. Base anterior: `f6fd2ab06be5305ede334ac1711f645d90fba54b`; referência de reversão: `backup/pre-ruach-invoices-2026-10-15`.

## Pedido e comportamento

A usuária informou o projeto Supabase e os emails de Cindy e Caritas, definiu Cindy/Cristiano/Alicia como administradores e pediu que Ruach compreendesse pedidos operacionais, erros como “incoice” e linguagem informal. Os identificadores e emails de implantação ficam em área privada. Receber uma URL não concedeu acesso administrativo ao banco.

Há dois caminhos separados:

- **Hub demo:** interpretação local para criar/editar rascunhos de invoice, além dos fluxos anteriores. Os dados continuam fictícios e locais. Perguntas, seleção do projeto, prévia e confirmação precedem qualquer gravação. Rascunhos ficam ocultos do cliente e não recebem pagamentos. Depois da revisão, a tela Billing permite emitir o rascunho localmente com estimate aprovado do mesmo projeto/appointment, prévia e nova confirmação; preserva a privacidade de contractor e não envia mensagens ou cobranças. Alterações concorrentes invalidam a prévia.
- **Conta Emet:** conversa com um modelo através do servidor, disponível somente depois de configurar Auth, banco e AI Gateway. Exige email verificado, acesso Office ativo na empresa e consentimento antes de enviar mensagens. A resposta pode conter uma proposta de invoice ou reagendamento, sem executar a operação. O banco operacional ainda precisa de migração e APIs autorizadas.

A conversa local não virou um modelo treinado. O novo caminho de IA efetivamente usa um provedor quando configurado; antes disso permanece indisponível, sem respostas simuladas apresentadas como IA conectada. Não há promessa de compreensão perfeita de qualquer frase: pedidos ambíguos exigem esclarecimento.

## Segurança e limites

- Propostas de IA não concedem permissões, não criam IDs confiáveis e não executam ferramentas de envio, cobrança ou assinatura.
- O endpoint valida cookies, origem/CSRF, email verificado, papel e empresa no banco. Limites compartilhados, mensagens/histórico reduzidos, timeout e saída estruturada limitam cada pedido.
- O modelo é configurado no servidor por ID presente no catálogo atual. Chaves e tokens não aparecem no navegador, repositório ou logs de conversa.
- O operador deve configurar orçamento no AI Gateway antes de ativar a flag de IA. A declaração dessa configuração não substitui a verificação do limite no provedor.
- O histórico do chat de conta fica na memória da página. Limpar, sair ou trocar a empresa remove o contexto local; uma solicitação já recebida pelo provedor pode ter sido processada.
- A sessão Emet e a demo `GTFAuth` permanecem distintas. O chat real não recebe a lista de clientes ou preços fictícios da demo.

## Acessos e provisionamento

Cindy será a owner inicial; Cristiano e Alicia receberão convites admin; Caritas terá papel Office. Nenhuma conta foi criada ou promovida pelo recebimento desses dados. A owner pode convidar admins; admins e managers respeitam a hierarquia do servidor. A escolha de papel no cadastro não permite elevar acesso.

O endereço público Supabase respondeu, mas sem credenciais autorizadas não permite aplicar migrações ou configurar Auth. A conexão Supabase foi sugerida para autorização pela proprietária. Na primeira preparação, a consulta administrativa Vercel à equipe `gtf12` recebeu 403. Na retomada, o acesso administrativo foi confirmado no projeto existente `gtf-hub`. Foram cadastradas em produção a URL Supabase informada, a origem do aplicativo, o modelo de IA conferido no catálogo e as flags de configuração; o runtime foi alinhado a Node.js 22. Auth e Ruach permanecem desativados, pois faltam banco/migração, segredos, remetente e orçamento verificados. Não foi criado projeto duplicado nem alterada a proteção SSO.

Passos de infraestrutura e owner em [EMET_AUTH_SETUP.md](EMET_AUTH_SETUP.md). Calendar/Gmail, Quo, e-signature, Stripe e GPS continuam dependentes de implementação, contas autorizadas e testes reais. Conectar uma conta Google ao ChatGPT não configura automaticamente o OAuth do aplicativo Emet.

## Verificação e publicação

- **136 testes Node.js 22 aprovados**, incluindo interpretação de invoices, confirmação, isolamento de IDs, rascunhos/emissão, contas e contrato de IA. O SDK instalado também foi exercitado com HTTP controlado, sem geração cobrada.
- **9 scripts Chromium aprovados em 1440/390 px:** Assistant Workflow, Assistant Invoice, Office/Compliance, Portals, Data Tools, Settings, Emet Entry, Ruach Account e Invoice Drafts. Sem erros de página ou overflow nos cenários cobertos.
- Validação estática básica: 11 HTML, 34 JS, 15 scripts inline, 122 handlers e 122 referências locais. `git diff --check` aprovado; auditoria das dependências de produção sem vulnerabilidades reportadas.
- Verificação independente do endpoint/modelo: SDK real com resposta HTTP simulada, cookies/CSRF, email, empresa, papéis, limites e saídas inválidas. Nenhum teste controlado é confirmação de integração de produção.
- A consulta autorizada ao endpoint Vercel existente confirmou `503 / provisioning_required`, sem anunciar serviços ativos. As novas flags continuam desativadas até o provisionamento.

O commit e os estados observados da publicação são informados na entrega. Não houve chamada real de geração, criação de conta, aplicação de SQL no Supabase informado, envio externo ou cobrança. Integrações continuam pendentes conforme os acessos acima.
