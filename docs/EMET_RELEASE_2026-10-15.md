# Emet / Ruach — incremento de 15/10/2026

## Escopo e preservação

Base conferida: `f49754d974ca60b21711c4a627c619063298e91f`, branch main. Referência anterior: `backup/pre-emet-2026-10-15`. A demo GTF e seus fluxos Office/Crew/Client foram preservados. Os anexos CSV/XLSX e as informações reais de configuração continuam fora do Git público.

## Implementado neste incremento

- Entrada Emet com identidade visual própria, acesso da empresa e link explícito para a demo GTF. Ruach é o nome da assistente.
- Configurações com perfil/foto, empresa, equipe/convites, dados e guias interativos de integrações. Nome/foto da demo são preferências locais; email e senha reais só mudam por API autenticada e confirmação do provedor.
- Backend inicial de identidade: convites aleatórios de uso único, empresa/papel fixados pelo gerente, senha definitiva escolhida pela pessoa, email verificado e aprovação separada. Cliente recebe acesso por convite de projeto e prova de email. Código não fica em texto puro no banco; senha/token não vão para localStorage.
- Migração isolada `emet_*` com RLS e restrições de papéis. O schema GTF antigo não foi aplicado. O backend fica bloqueado por padrão sem serviços e configuração verificados.
- Workspace de importação/exportação CSV/XLSX/JSON com seleção de sheet/cabeçalho, mapeamento, paginação, edição, revisão humana de duplicatas, preservação de preços por tipo de cliente e proteção contra fórmulas em CSV. Arquivos importados ficam somente em memória, com exportação explícita; não são gravados no banco nem no localStorage.
- Certificate of Acceptance com QR substituído por links clicáveis, cláusulas preservadas e utilização confirmada no final da obra. Care Guide oficial e Instagram acessíveis. A garantia da demo não anuncia prazo oficial sem os termos da empresa.
- Ruach oferece guias de vínculo no contexto de Calendar/mensagens. Calendar e Gmail têm consentimentos separados. Guias não concedem permissões nem simulam conexão concluída.
- Conversa inicial Ruach corrigida: cumprimentos PT/EN, agradecimentos, nome do perfil, ajuda e perguntas sobre o Hub com respostas variadas e contexto curto em memória. Saudação durante confirmação mantém a prévia; pedido de envio não envia. Há limite de tamanho de entrada. A conversa segue regras programadas, sem LLM conectado ou treinamento anunciado.
- Avatar abre configurações, mantém nome por perfil e preserva atribuições/projeto. Cabeçalhos mobile ajustados para nomes longos em Client, Crew e Calendar.
- Fontes oficiais e orçamento com cinco cenários, banco explicado e alternativas de infraestrutura em `EMET_SERVICES_AND_BUDGET.md`.

## Validação

- 77 testes Node de parser/reagendamento, conversa PT/EN, vínculos de documentos, Compliance, ferramentas de dados e handlers de identidade aprovados. Respostas de Supabase/Resend nos testes HTTP são controladas e não representam integração ativa.
- PostgreSQL 17 local isolado: snapshot final da migração e 43 verificações de RLS/empresas/papéis/projetos, verificação + aprovação, TTL, rejeição de requestId nulo e consumo concorrente. O teste de oito consumos concorrentes permitiu apenas um vencedor. SHA da migração carregada antes/depois dos testes: `e60464d44c180364a696d4994922e46a3f8136c92728ded3ddafe8bb8c2b079b`. Estruturas mínimas de Auth/Storage são shims locais, não serviços Supabase reais.
- Revisão independente HTTP: 17 verificações de cookies, Origin/CSRF, métodos/corpo, payloads e ausência de tokens no JSON, com rede simulada.
- Chromium: Assistant (reagendamento e documentos), Office/Compliance, Crew/Client, ferramentas de dados, Settings e entrada Emet. Layouts a 1440/390 px, incluindo nomes longos. Correções de overflow rechecadas. Testes usam contas/arquivos fictícios em contextos isolados.
- CSV e XLSX recebidos foram analisados somente em memória, preservando colunas e tipos de preço; nenhuma lista de contatos ou tabela real foi publicada.
- Sintaxe, HTML básico, recursos locais, padrões de segredos e `git diff --check`. HTML não foi validado por W3C; varredura por padrões não garante ausência absoluta de segredos.
- PDF renderizado e inspecionado, texto acima do rodapé comparado ao original, dois links corretos e QR removidos. URL do Care Guide respondeu HTTP 200.

Scripts versionados: `tests/*.test.js`, `tests/validate_static.py`, `tests/assistant_workflow_smoke.py`, `tests/office_compliance_smoke.py`, `tests/portals_smoke.py`, `tests/data_tools_smoke.py`, `tests/settings_smoke.py`, `tests/emet_entry_smoke.py`.

## O que continua pendente

- Conectar Supabase, remetente verificado e contas reais; aplicar e testar a migração em staging; preparar owner e recuperação operacional/reenvio de emails. A fundação não tem worker/reenvio automático nem MFA.
- Migrar os dados de negócio e os fluxos Office/Crew/Client para APIs/banco compartilhado. `capabilities.businessData` permanece false; uma sessão real não transforma a demo local em workspace protegido.
- OAuth/sync Google, inbox Gmail opcional, Quo/webhooks/SMS, assinatura eletrônica e garantia reais, Stripe e confirmação de pagamento, motor LLM e GPS/ETA. Continuam sem conexão real.
- Contrato inicial, termos oficiais da garantia, demais emails Office e responsável administradora. O certificado final não substitui o contrato inicial.
- Permissão administrativa da conexão Vercel à equipe `gtf12`, recusada com 403. O projeto existente `gtf-hub` já publica via GitHub; não foi criado projeto duplicado nem alterada proteção para contornar acesso.

## Publicação

- Commit de implementação: [`16e0e6c44f29610e35e0416f11f067bdfb0ad3a3`](https://github.com/cindygatop/GeorgiaTopFloorsHub-Demo/commit/16e0e6c44f29610e35e0416f11f067bdfb0ad3a3), enviado à main junto à referência remota `backup/pre-emet-2026-10-15` no SHA anterior.
- GitHub Pages: build `built` desse commit, concluído em 15/10/2026 às 15:08 (America/Sao_Paulo); [workflow com sucesso](https://github.com/cindygatop/GeorgiaTopFloorsHub-Demo/actions/runs/38783004212). [Entrada Emet](https://cindygatop.github.io/GeorgiaTopFloorsHub-Demo/emet.html).
- Vercel: [deployment desse commit](https://vercel.com/gtf12/gtf-hub/GDLSpG8refM7zVyVAfcaZs3sFZ9H) reportado como `success` pela integração GitHub. A gestão administrativa continua sem acesso pela conexão disponível (403); o deployment observado usa proteção SSO. Os testes remotos abaixo foram feitos no GitHub Pages, sem contornar essa proteção.
- Verificação HTTP/SHA256: os 17 arquivos principais publicados, incluindo interface Emet, Settings, importador, scripts compartilhados, CSS e PDF, responderam HTTP 200 com conteúdo idêntico ao local testado.
- No site publicado passaram os smoke scripts Assistant/Workflow, Settings, Data Tools e Emet Entry (1440/390 px). Respostas de conta são mocks explícitos nos ramos de contrato; no ramo real estático a ausência do backend deixa o cadastro bloqueado. Não há prova de Supabase/Resend ativos.
- Teste adicional do chat publicado: cumprimento PT, nome do perfil, conversa básica, agradecimento, contexto Gmail e abertura do guia; zero POST para provedores, zero erro JavaScript e sem overflow a 390 px.
- A requisição do PDF no smoke Emet foi ajustada para respeitar o proxy HTTP(S) do ambiente via urllib. O teste remoto completo passou após a correção; o PDF publicado não foi alterado por ela.

Publicar funções e SQL não configura serviços ou aplica migrações. O banco de negócio, login real e integrações continuam pendentes conforme a seção anterior.
