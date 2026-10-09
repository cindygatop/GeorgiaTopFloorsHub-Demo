# Instruções persistentes — Georgia Top Floors Hub (Codex)

**Leia primeiro:** `docs/GTF_MASTER_SPEC.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/QA_ACCEPTANCE.md`, além de `DEPLOYMENT_AND_ARCHITECTURE.md` e `GOOGLE_CALENDAR_IMPLEMENTATION.md`. A primeira tarefa é publicar v5 no GitHub com segurança e informar link do commit.

## Produto e usuário

- Projeto piloto Georgia Top Floors, SaaS multiempresa depois. Office (Caritas/Cristiano/Alicia/Cindy), Crew, Client.
- Interface premium clean, mas com hierarquia visual e cores discretas; adaptativa desktop/mobile em TODAS as visões. Flags de urgência red/yellow/green de forma discreta em todo Hub.
- Home Office = assistente personalizado, não dashboard pesado. Comandos natural PT/EN, tolerância a typos, desambiguação, confirmação antes de escrever, sugestão de mensagem após reagendamento. Extensão futura via LLM seguro server-side.
- COI único por entidade, General Liability/Workers Compensation dentro dele. W-9 review sem inventar expiração legal.
- Client: Before Your Job, link real Google Review, Agreement legal online + guide + e-sign real futura + Warranty bloqueada até confirmação assinada.
- Project-centric (client/project/estimate/work order/invoice/appointment/crew). Google Calendar bidirecional + Quo SMS/webhooks + payments futuro.

## Regras de engenharia

- `CODIGO_V5` (quando recebido como pacote) deve ser aplicado na raiz do repo, **não como pasta**. Ao continuar o desenvolvimento, mantenha sempre documentação de decisões e roadmap atualizada.
- V5 é uma demo estática localStorage e credenciais triviais (`gtf2026`); **não é autenticação segura**. Nunca aceitar `localStorage` como fonte de verdade de compliance legal, pagamentos ou garantias reais. Implementar auth server-side e tenant RLS para produção.
- Nunca credenciais/tokens no Git/public HTML. Não usar ou editar dados reais de cliente sem backend seguro, papéis, backups e proteção.
- Integrações devem ter estados reais `pending`, `connected`, `failed`, nunca registrar sucesso de SMS, Calendar, assinatura ou pagamento se API não confirmou.
- Sempre usar `projectId`/`appointmentId`; não atualizar work order com base exclusiva em nome de cliente. Auditar casos de cliente com múltiplos jobs.
- Calendar Google: owner autorizado, OAuth seguro, ids e etags, incremental sync/webhook, timezone America/New_York, idempotência, prevenção de loops e conflitos. Um rascunho Google NÃO é sync bidirecional.
- Testar responsividade, sintaxe, smoke flows e segurança mínima antes de qualquer commit. Preservar mudanças alheias, não fazer `force push` na main, não apagar arquivos só porque não estão no ZIP. Criar referência de rollback antes de publicar mudanças relevantes.
- A usuária prefere mudanças diretamente no GitHub para testar online. Executar commit/push quando autorizado e disponível, respeitando proteções de branch; fornecer SHA, link, testes, status de deploy e saber reverter sob pedido. Sem promessa de execução em background.
- Responder em português, com passos curtos, evitando transferir tarefas de código para a usuária; pedir informações somente quando forem realmente necessárias (ex.: OAuth, documentos finais, pagamento).
