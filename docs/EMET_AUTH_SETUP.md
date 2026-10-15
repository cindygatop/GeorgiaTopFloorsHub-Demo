# Emet — fundação de contas, empresas e convites

Data: 15/10/2026. **Código preparado; serviço não provisionado nem ativado em produção.**

O backend usa Supabase Auth para senhas e verificação de email, PostgreSQL/RLS para permissões e Resend para mensagens transacionais. Os handlers são CommonJS, Node.js 22, sem dependências npm. Existem **11 Vercel Functions** em `api/emet/`; os módulos internos ficam em `server/`.

Sem configuração completa, `GET /api/emet/status` responde **503 / `provisioning_required`**. A interface deve bloquear as ações reais. GitHub Pages executa somente a demo estática; não executa estas funções. Nenhum código de convite inventado pelo navegador é aceito como conta real.

## Separação da demo

A sessão Emet não é a sessão `GTFAuth` da demo. Não copiar tokens, senhas, convites ou permissões reais para `localStorage`; não usar a presença de um perfil local como autorização. Uma conta Emet autenticada abre o workspace de contas, sem transformar os dados de exemplo em dados da empresa.

`capabilities.businessData`, `googleCalendar`, `gmail`, `payments` e `eSignature` permanecem **false**. Esta entrega não migra Jobs, documentos, finanças ou integrações reais. A proposta antiga `supabase-schema.sql` não foi aplicada e não é pré-requisito desta migração.

## Regras aplicadas no servidor e no banco

- O gerente escolhe empresa, email, papel e, para cliente, um projeto específico. O servidor gera um código aleatório com 256 bits; o banco guarda somente seu SHA-256. Expiração: 48 horas por padrão, máximo de 7 dias.
- A pessoa informa código, email, nome e senha definitiva. O papel e a empresa vêm exclusivamente do convite; campos adicionais de autorização são rejeitados. Cada convite é consumido uma única vez, com bloqueio transacional.
- A criação pelo Auth Admin inclui o hash do convite em `app_metadata`, que não pode ser definido pelo signup público. Um trigger cria perfil, consome convite e registra a solicitação na mesma transação de criação do usuário. Um signup sem convite confiável é rejeitado.
- A conta só recebe acesso quando **o email foi verificado e um gerente autorizado aprovou**. Aprovar antes da verificação resulta em `pending_email`; verificar antes da aprovação mantém `pending_approval`.
- O email ao gerente contém um link de revisão. Abrir o link não aprova nada. É preciso entrar com uma conta autorizada e enviar `POST` com `organizationId`, `userId`, `requestId` e a decisão exatos.
- Hierarquia: owner pode convidar admin/manager/office/crew/client; admin pode convidar manager/office/crew/client; manager pode convidar office/crew/client. Nenhum convite concede owner. Office, Crew e Client não emitem nem aprovam convites.
- Um convite não modifica o papel de uma membership existente. A entrada em outra empresa exige outro convite. Convites adicionais de cliente podem conceder outros projetos da mesma empresa, com aprovação específica por solicitação; não liberam os demais projetos.
- As tabelas `emet_*` têm RLS. Usuários não recebem INSERT/UPDATE/DELETE direto em memberships, convites ou acessos. RPCs administrativas validam a identidade e a empresa; RPCs de consumo, lookup de email, envio e rate limit são exclusivas do `service_role` no servidor.
- Avatares ficam em bucket privado, pasta do próprio usuário, com PNG/JPEG/WebP e limite de 2 MiB. URLs de leitura expiram em 5 minutos; URLs de upload não concedem acesso ao projeto.

## Preparar a infraestrutura

1. Criar um projeto Supabase de staging dedicado ao Emet. Fazer backup se já houver dados. Revisar e aplicar `supabase/migrations/202610150001_emet_identity.sql` uma única vez. Ela cria tabelas, funções, triggers em `auth.users`, políticas e o bucket privado `emet-avatars`.
2. Configurar Supabase Auth: email habilitado, confirmação obrigatória, redirects limitados ao domínio Emet, tokens de email com prazo curto, rotação de refresh tokens e política de senha. Desabilitar métodos de cadastro não usados. Mesmo se o signup público for chamado diretamente, o trigger não concede acesso sem o `app_metadata` confiável do backend.
3. Configurar domínio remetente no Resend e verificar que as mensagens chegam. Os retornos `accepted` significam que a API aceitou a mensagem; não confirmam entrega na caixa de entrada. Não há webhook de entrega/bounce nesta fundação.
4. Criar o primeiro owner pelo procedimento separado abaixo. Não existe endpoint público de bootstrap.
5. Configurar Vercel com Node.js 22 e os valores privados descritos em `.env.example`. Usar `EMET_APP_ORIGIN` exato, incluindo `https://`, sem barra final. Chaves de service role, Resend e rate limit são exclusivamente do servidor. Não usar prefixos `NEXT_PUBLIC_*`, HTML ou JavaScript público para esses valores.
6. Manter `EMET_AUTH_ENABLED=false` até revisar RLS e completar o teste real de staging. Só então ativar e consultar `/api/emet/status`; readiness depende também do RPC `emet_capabilities` e do rate limiter no banco, nunca somente de um botão da interface.

Em desenvolvimento, HTTP local exige `EMET_ALLOW_LOCAL_HTTP=true` e `NODE_ENV` diferente de `production`; cookies locais perdem o prefixo `__Host-`. Produção exige HTTPS e cookies `__Host-`, `Secure`, `HttpOnly`, `SameSite=Strict` e `Path=/`.

### Primeiro owner, fora do fluxo público

Um operador autorizado cria o usuário pelo Supabase Auth Admin com `app_metadata: {"emet_bootstrap": true}` e nome em `user_metadata.display_name`. Esse atributo só permite criar o perfil inicial: **não cria empresa nem membership owner**. Não expor essa opção em nenhum formulário.

Verificar o email por um processo real; não marcar `email_confirm` como verdadeiro para contornar a posse da caixa. Depois, em transação SQL administrativa revisada, criar `emet_organizations` e inserir `emet_memberships` para o UUID desse usuário com `role='owner'`, `status='active'`, `approved_at=now()` e `approved_by` desse operador/owner. Confirmar que `auth.users.email_confirmed_at` existe antes da inserção. A autorização também verifica esse campo a cada consulta.

O SQL administrativo depende dos UUIDs e dos nomes reais escolhidos na implantação. Não inclui senha padrão, owner universal ou chave de bootstrap reutilizável no repositório. Projetos reais de cliente devem ser criados com o `organization_id` correto por uma futura operação administrativa autorizada; esta fundação não importa os projetos fictícios do navegador.

### Alicia e Cristiano usando a mesma caixa

Não cadastrar duas pessoas com o mesmo email e recuperação compartilhada como se fossem identidades independentes. Os endereços reais foram mantidos fora do Git público. Exemplo ilustrativo a validar com o provedor:

- Alicia: `company+alicia@gmail.com`
- Cristiano: `company+cristiano@gmail.com`

Esses aliases podem receber mensagens na mesma caixa `company@gmail.com` e permitem identificadores/UUIDs separados no Auth, se o provedor os aceitar como distintos. **Quem controla a caixa compartilhada pode recuperar ambas as contas.** Portanto, a recuperação não é independente. Para separação efetiva de acesso e auditoria, usar caixas individuais e MFA; testar entrega e unicidade dos aliases antes de ativar contas.

## Contrato HTTP para as páginas

Todos os retornos são JSON com `Cache-Control: no-store`. Todo `POST` exige `Content-Type: application/json`, `Origin` igual a `EMET_APP_ORIGIN`, cookies de mesma origem e `X-Emet-CSRF` com o `csrfToken` recebido de `/status` ou `/session`. O navegador deve usar `credentials: 'same-origin'`. O limite de corpo é 8 KiB; nenhuma senha ou chave deve ir em URL, log ou armazenamento local.

`GET /api/emet/status` configurado retorna:

```json
{"status":"ready","platform":"Emet","csrfToken":"...","capabilities":{"authentication":true,"invitations":true,"profile":true,"businessData":false,"googleCalendar":false,"gmail":false,"payments":false,"eSignature":false}}
```

Esse `ready` indica configuração acessível e versão do schema reconhecida; não substitui os testes reais de implantação.

`GET /api/emet/session` autenticado retorna:

```json
{"status":"authenticated","csrfToken":"...","user":{"id":"UUID","email":"person@example.com","displayName":"Person","avatarUrl":null},"memberships":[{"organizationId":"UUID","organizationName":"Example Floors","role":"office","status":"pending_approval"}]}
```

Sem sessão válida, retorna 401. Tokens do Supabase nunca aparecem nesse JSON: ficam em cookies HttpOnly. Memberships podem ser `pending_approval`, `pending_email`, `active`, `rejected` ou `revoked`; não interpretar todas como ativas.

| Endpoint | Corpo / comportamento |
| --- | --- |
| `POST /api/emet/session` | `{action:"login",email,password}`, `{action:"refresh"}` ou `{action:"logout"}`. Login/refresh retornam conta real; não redirecionam para dados da demo. Logout elimina cookies locais e solicita revogação ao Auth. |
| `POST /api/emet/invitations` | `{action:"create",organizationId,email,role,projectId?,expiresHours?}`. Manager autorizado; client exige UUID de projeto da mesma empresa. Retorno 201 `invitation_created`, `invitation:{id,organizationId,email,role,projectId,expiresAt}`, `code` mostrado uma vez e `delivery:{status:"not_sent"}`. Criar código não envia email automaticamente. |
| `POST /api/emet/invitations` | `{action:"preview",code,email}`. Valida no banco e devolve empresa/papel/projeto/prazo fixos; não cria conta, não consome convite, não concede acesso. |
| `POST /api/emet/invitations` | `{action:"accept",code}` com sessão existente. O email vem da conta autenticada. Aceita outra empresa/projeto permitido pelo convite, mantendo aprovação obrigatória. |
| `POST /api/emet/register` | `{code,email,password,displayName}`. Senha entre 12 e 128 caracteres; nenhum campo role/company/authorization. Retorno 202 `pending_verification_and_approval`, `requestId` e `delivery:{verification,approval}`. Conta existente deve entrar e usar `invitations/accept`. |
| `POST /api/emet/client-access` | `{code,email}`. Somente convite client de projeto específico. Envia magiclink e solicitação de aprovação. Não retorna bearer token, sessão pública permanente ou acesso sem prova de email. |
| `POST /api/emet/verify` | `{tokenHash,type:"magiclink"}`. Auth valida token de uso único e prazo. Resposta `email_verified` com conta/memberships; aprovação pendente continua bloqueada. |
| `GET /api/emet/approvals?organizationId=UUID` | Sessão manager autorizada. Retorna `requests` com `requestId`, empresa, usuário, email, papel e projeto exatos. GET não aprova. |
| `POST /api/emet/approvals` | `{organizationId,userId,requestId,decision:"approve"|"reject"}`. Todos os IDs são obrigatórios; sem aprovação de si próprio, de outro tenant ou de papel acima do permitido. Retorno `approved`/`rejected` e `request.membershipStatus`. |
| `GET /api/emet/profile` | `{user,memberships}` da conta autenticada. |
| `POST /api/emet/profile` | `{displayName,avatarPath?}`. Retorno `profile_updated` com `{user,memberships}`. Não aceita mudança de papel/email/senha por metadata. `avatarPath:null` remove o avatar. |
| `POST /api/emet/avatar` | `{contentType:"image/jpeg"|"image/png"|"image/webp"}`. Retorna `upload_authorized`, `uploadUrl`, `avatarPath`, `maxBytes:2097152`. Fazer PUT do arquivo no signed upload URL, sem cookies Emet; após 2xx, salvar o caminho via `/profile`. |
| `POST /api/emet/credentials` | `{currentPassword,newPassword}` ou `{currentPassword,newEmail}`. Reautentica a mesma identidade antes de alterar. Retornos `password_updated` ou `email_change_requested`. Troca de email permanece 503 até `EMET_SECURE_EMAIL_CHANGE_CONFIGURED=true` e SMTP/secure email change testados no Auth; precisa confirmar mensagens, não troca email por metadata. |
| `POST /api/emet/recovery` | `{email}`. Retorno genérico 202 `recovery_requested_if_account_exists`; não revela token ou confirma existência da conta no payload. |
| `POST /api/emet/verify` | `{tokenHash,type:"recovery",newPassword}`. Verifica token do email no Auth, grava a nova senha e revoga as outras sessões de refresh. |

As mensagens usam `/emet.html#token_hash=...&type=magiclink` ou `type=recovery`. A página deve retirar o fragmento com `history.replaceState` antes de enviar o POST; não consumir token por GET, nem armazená-lo localmente. O email de aprovação usa `/emet.html?view=approval&organizationId=...&userId=...&requestId=...`: esses IDs não autorizam nada.

Erros esperados: 400 campos inválidos; 401 sessão/senha não confirmada; 403 origem/CSRF/permissão; 409 convite consumido/expirado ou membership incompatível; 429 limite atingido; 503 serviço não configurado/indisponível. Mensagens brutas dos provedores não são repassadas ao navegador.

## Operação e limites desta entrega

- Rate limit é compartilhado no PostgreSQL e falha fechado se indisponível; não há fallback em memória. Produção Vercel usa o endereço fornecido em `x-vercel-forwarded-for`; testes locais usam `socket.remoteAddress`. O identificador é HMAC, não o IP/email em texto. Configurar WAF/rate limits da plataforma também; remover buckets antigos de `emet_rate_limits` por manutenção periódica.
- A outbox guarda somente contexto e estado de email, sem senha/código bruto/link secreto. `accepted` é confirmação da API, não entrega. Falhas mantêm a conta pendente. **Não há worker, webhook de bounce ou fluxo automático de reenvio nesta entrega.** Na ativação, preparar reenvio operacional auditado com token novo e prazo curto; nunca reutilizar convite para criar outra identidade ou marcar email confirmado manualmente após falha de envio.
- Senha/email são gerenciados pelo Supabase Auth. Revogar refresh sessions não invalida instantaneamente access JWTs já emitidos; eles expiram conforme o Auth, limitados no cookie a uma hora. Para revogação imediata de autorização empresarial, revogar a membership no banco; os helpers verificam o estado atual.
- Não há MFA, worker de outbox, importação de dados reais, tela de administração global de empresas, alteração de roles, transferência de owner ou proteção server-side de dados antigos da demo nesta fundação. Essas capacidades não são anunciadas como prontas.
- O bootstrap e projetos ainda dependem de operação administrativa fora dos endpoints públicos. Nunca expor uma service role ao cliente para contornar essa limitação.

## Validação

`node tests/emet-auth.test.js` executa testes de handlers com rede inteiramente simulada: configuração ausente, CSRF/origin/métodos, rate limit, código aleatório/hash, restrição de roles, cadastro pendente, falha real do envio simulado, cookies HttpOnly, aprovações específicas, links de cliente, perfil/avatar, alteração de credenciais e recuperação. Não chama Supabase ou Resend reais.

A migração também foi aplicada em PostgreSQL 17 local isolado com tabelas mínimas de Auth/Storage para testar sintaxe, funções, RLS, concorrência e estados de aprovação. Isso **não equivale a testar Supabase Auth/Storage/SMTP reais**. Antes de ativar produção, validar em staging: convite expira/uso único sob concorrência, dois tenants e vários projetos por cliente, verificação antes/depois da aprovação, GET de aprovação sem efeito, revogação de manager, SMTP/links/recuperação, sessão/cookies, avatar privado e isolamento de dados. Publicar o código não provisiona esses serviços.
