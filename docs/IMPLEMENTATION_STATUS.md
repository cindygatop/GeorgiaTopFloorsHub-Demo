# GTF Hub — status técnico do repasse v5 e ressalvas

Data de preparação: 2026-10-09. Material retirado do ZIP `GeorgiaTopFloorsHub-Demo-v5-FULL.zip`, conferido localmente. O GitHub da usuária foi consultado em 09/10/2026. Último HEAD observado da branch `main`: `4d9e0fba967a8a44a1d9cc8ec329300a2af36488` (pode ter mudado; Codex DEVE verificar antes de escrever). Visto `main` com estrutura da v4 (sem `assistant.js`, `calendar.html`, `google-calendar-service.example.mjs` etc.).

## A. Implementado na demo v5 (não equivale a produção)

| Recurso | Estado no pacote v5 | Dependências/ressalvas |
|---|---|---|
| 4 usuários Office + Crew + Client | Botões/login demo em `login.html`, `app-core.js` | Login no navegador, não seguro / não multi-dispositivo |
| Home Office Assistant | `index.html`, `assistant.js`, `theme.css` | Parser local, não LLM real |
| Saudação e pequenos flags | Implementado visualmente com contadores e alerta condicionado | QA visual em browsers ainda necessário |
| Atalhos adaptativos individuais Office | heurística local por frequência + recência em `app-core.js` | Não há machine learning, sem coleta central |
| Reagendamento com matching tolerante | `assistant.js`; confirmação e persistência local | Verificar associação correta de projetos; não sync Google |
| Projeto central estimate/WO/invoice | `project-docs.js` e views | Modelo local; auditar criação de múltiplos jobs do mesmo cliente |
| Calendar | `calendar.html` + exemplo server `.mjs` | Só NOVO evento pré-preenchido em site Google; não OAuth, patch, webhook, sync |
| Crew responsivo | `crew.html`, CSS | QA obrigatório desktop/celular |
| Client Agreement/Guide/Warranty | `customer.html` | Placeholders, assinatura de demonstração local, **não evidência legal** |
| Feedback Google Review | `customer.html` / URL `app-core.js` | Verificar Place ID do negócio correto |
| COI único e GL/WC aninhados | `compliance.html`, `compliance.js` | QA de filtro por tipo/W-9 na UI |
| W-9 review | Estado local | Não tratar como vencimento anual legal |
| Notifications / Quo SMS | Estado/fila local com rótulo setup-required | Não envia SMS/integra Quo real |
| Schema Supabase | `supabase-schema.sql` | Não executado em DB; revisar RLS/SQL antes de produção |
| Plano de implantação/custos | `DEPLOYMENT_AND_ARCHITECTURE.md` | Orçamentos são estimativas e decisões em aberto |

## B. Testes disponíveis e limitações

- O `QA_V5.txt` original registra testes de sintaxe JS e unitários de parser realizados na fase anterior; a validação visual de browsers foi BLOQUEADA naquele ambiente e deve ser refeita pelo Codex.
- Nesta transferência foi executado `node --check` nos JS e `.mjs` do ZIP, todos passaram (app-core, assistant, compliance, project-docs, google-calendar-service.example).
- Codex precisa abrir o site localmente com um servidor, verificar console, interface, fluxos Office/Crew/Client, responsividade e não somente sintaxe.
- Um aspecto a auditar: `assistant.js` busca work orders por `projectId` **ou nome do cliente** como fallback. Isso pode atingir work order errado se a mesma pessoa tiver vários projetos. Corrigir o matching para usar `projectId`/`appointmentId` inequívocos; nunca atualizar múltiplos trabalhos por coincidência de nome.
- Verificar a URL de review `https://search.google.com/local/writereview?placeid=ChIJvdGf-LAT9YgRl6baSSmrcSI` antes de assumir que é a GTF correta.
- Não há validação de autenticação real. Não colocar dados pessoais de clientes / tokens num repo público.

## C. O que é planejado mas ainda NÃO funciona

Autenticação segura; backend; dados compartilhados; sincronização multiusuário; Google Calendar OAuth e sincronização bidirecional; geração/transmissão SMS Quo; alerta real de Quo message; assinatura eletrônica com audit trail; pagamentos no portal; ML real/LLM no Assistant; SaaS billing, cobrança por tenant, onboarding de novas empresas, políticas RLS aplicadas no banco, métricas e observabilidade de produção. Jamais reportar essas funcionalidades como prontas por existir um botão/placeholder.

## D. Diferença entre o ZIP v5 completo e o GitHub

- `CODIGO_V5/` contém o projeto v5 completo mais `AGENTS.md` e documentação consolidada do repasse. Não copiar o diretório `CODIGO_V5` como uma pasta adicional no repo: seu CONTEÚDO deverá ser aplicado à **raiz** da branch.
- Compare os blobs/diffs com a HEAD do GitHub. Não descarte arquivos que existirem apenas em `main`; preserve `.github`, assets, mudanças novas de outras pessoas e conteúdo não listado.
- Alguns arquivos `*.md` podem ter sido modificados a partir da v4. Mantenha o conteúdo atualizado da v5 e documentação adicional, mas evite sobrescrever mudanças mais recentes no GitHub sem revisão.
- O ZIP isolado `GTF-v5-ONLY-FILES-TO-UPLOAD.zip` anterior tem 20 arquivos v5 novos/modificados. Este pacote consolidado já inclui todos esses arquivos; não exigir esse ZIP anterior adicionalmente.
- Se `main` ainda for a v4, o objetivo é um commit claro, e.g. `feat: publish GTF Hub v5 assistant and portal improvements`. Confirmar commit push e status do Pages/Vercel se disponível.

## E. Falha da integração ChatGPT/GitHub anterior

Leitura funcionou, repo `cindygatop/GeorgiaTopFloorsHub-Demo`, usuário `cindygatop`. Tentativas de criar arquivo/blob pelo GitHub connector falharam com `403 Resource not accessible by integration` e `list_installations`/`list_installed_accounts` vieram vazios naquele contexto. Nenhum commit da v5 foi feito via ChatGPT; por isso Codex precisa conectar o GitHub com escopos próprios. Se Codex não tiver permissão push, solicitar autorização na interface, sem pedir token no chat e sem afirmar publicação.

## F. Validação do Codex em 09/10/2026

O código v5 foi aplicado e auditado sobre o HEAD confirmado `4d9e0fba967a8a44a1d9cc8ec329300a2af36488`. As correções e evidências atuais estão em `VALIDATION_V5.md`, e a revisão dos pedidos da conversa compartilhada em `HISTORY_REVIEW.md`. Estes resultados atualizam as ressalvas históricas de QA do pacote. A publicação continua sujeita a acesso real de escrita e confirmação do push/deploy.
