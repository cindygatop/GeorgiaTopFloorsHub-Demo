# Validação da v5 no Codex — 09/10/2026

## Base e preservação

- Repositório: `cindygatop/GeorgiaTopFloorsHub-Demo`, branch `main`.
- HEAD anterior confirmado: `4d9e0fba967a8a44a1d9cc8ec329300a2af36488`.
- Referência local de reversão: `backup/pre-v5-2026-10-09` no SHA anterior.
- Conteúdo de `CODIGO_V5/` aplicado à raiz; não existe pasta adicional `CODIGO_V5` no projeto.
- Nenhum arquivo da versão anterior foi excluído. Logos e `supabase-schema.sql` preservados byte a byte.
- Documentos obrigatórios e conversa compartilhada lidos; requisitos preservados em `GTF_MASTER_SPEC.md` e `HISTORY_REVIEW.md`.

## Correções confirmadas

- Assistente usa `projectId` + `appointmentId`; não atualiza Work Orders por nome de cliente.
- Desambiguação mostra endereço, serviço, projeto e appointment. Preview não grava; confirmar exige perfil Office, IDs inequívocos e preview atual.
- Parser PT/EN aceita `Emilly Catrer`, sexta e horários; valida datas/horas, fuso Georgia/DST, duração e conflitos locais de crew novamente na confirmação.
- Work Orders ambíguas sem vínculo a appointment ficam intocadas e geram orientação de revisão.
- Estimate novo recebe projectId imediatamente, preservado ao editar e ao gerar WO/Invoice. Consulta/aprovação por nome retorna sem ação quando há múltiplos projetos.
- Migração de `scheduledDate` vazia deixa de emitir saves/eventos a cada leitura, impedindo loop que travava documentos.
- Notificações de Calendar/SMS guardam IDs e continuam `setup-required`; rascunho de mensagem não é enviado.
- Agreement/Consent no Compliance usa projectId, migra registros antigos por ID e não reutiliza assinatura de outro projeto pelo nome.
- WO permanece visível após alteração de status. Assinatura/Warranty do Client são isoladas por projeto; tracking, ETA e comunicações estão rotulados como demo.
- COI abre GL/WC no mesmo grupo, sem função duplicada nem cards separados na fila de atenção. Calendar preserva nomes com apóstrofo.

## Evidência executada

- `node --test tests/*.test.js`: 24 testes passaram, zero falhas.
- `python3 tests/validate_static.py`: sintaxe JS/MJS, scripts inline e handlers, HTML básico, IDs/atributos, recursos locais e varredura por padrões de segredos passaram. Não é validação W3C nem garantia completa de ausência de segredos.
- Chromium via Playwright em servidor HTTP local: reagendamento PT com typo + sexta, dois projetos da mesma cliente, escolha explícita, preview sem escrita, atualização apenas do job/WO selecionado, estados `PENDING SETUP`, rascunho de mensagem; comando EN com cancelamento; novo Estimate → Approval → Work Order → Invoice pela UI. Todos passaram, zero erros JS capturados.
- Office/Compliance: quatro perfis, saudações/logout, atalhos individuais, flags clicáveis, COI único na tabela e na fila de atenção, GL/WC aninhados, filtros, revisão interna W-9 e Calendar com apóstrofo. Passou.
- Office Home, Database, Documents, Calendar e Compliance a 1440 e 390 px: zero erros JS e zero overflow horizontal após corrigir tamanho mínimo da navegação e Library. Tabelas/menus mantêm rolagem interna.
- Crew Carlos a 1440 e 390 px: atribuição exata (Carlos não vê Carlos Junior), WO persiste após OTW/Problem e reload, acknowledge, problema/alerta local, Maps correto, sem preços na interface e logout. Passou; zero overflow/erros JS.
- Client Emily a 1440 e 390 px: documentos e assinatura do projeto da sessão, outra propriedade não altera a garantia, troca para John bloqueada, garantia inicialmente bloqueada, Guide, assinatura demo e persistência, aviso local ao Office, Before Your Job e logout. Passou; zero overflow/erros JS.

### Reprodução dos testes de navegador

Requer Python com `playwright` e Chromium instalado. Em um terminal execute `python3 -m http.server 8000`; em outro execute `python3 tests/assistant_workflow_smoke.py`, `python3 tests/office_compliance_smoke.py` e `python3 tests/portals_smoke.py`. Os testes usam dados de demonstração em contexto isolado e não enviam mensagens nem chamam APIs de produção. `GTF_BASE_URL` configura o servidor Office/Assistant, `GTF_TEST_URL` o dos portais e `GTF_QA_ARTIFACTS` a pasta de evidências fora do repo.

## Integrações e limites

- Continua sendo demo estática com localStorage e login público de demonstração. Não existe autenticação segura, isolamento real ou sincronização entre dispositivos.
- Google Calendar só abre rascunho de NOVO evento; OAuth, edição de evento existente e sincronização bidirecional pendentes.
- Quo/SMS/webhooks, assinatura legal, pagamentos e IA generativa não conectados.
- Agreement/Care Guide/Warranty são exemplos, aguardando documentos finais e provider com evento de assinatura confirmado.
- Google Review mantém a URL do pacote. A tentativa de verificar o negócio recebeu HTTP 429/CAPTCHA do Google; identidade do Place ID continua pendente.
- QA browser restrito a Chromium automatizado. Safari/Firefox e aparelhos físicos não testados.

## Schema futuro de SaaS

`supabase-schema.sql` é proposta preservada; não aplicada ou validada em banco. Antes de produção resolver: FKs compostas para garantir mesmo tenant entre entidades; membership ativa nas verificações de atribuição/portal; leitura de assignments restrita ao papel; projeção de projetos sem internal_notes para Client/Crew; UPDATE de WO restrito a campos permitidos. Não anunciar RLS seguro/operacional apenas pela existência do arquivo.

## Publicação

Pages confirmado em `https://cindygatop.github.io/GeorgiaTopFloorsHub-Demo/`, fonte `main` na raiz. Último build confirmado: `built`, commit `4d9e0fba967a8a44a1d9cc8ec329300a2af36488` (09/10/2026 14:39 UTC). A publicação da referência de backup foi recusada por HTTP 403 tanto no Git quanto no connector (`Resource not accessible by integration`); listas de instalações/contas da integração vieram vazias. A branch não estava protegida, mas a credencial da integração não autoriza escrita. Até reautorizar a integração e confirmar push/deploy, a v5 não está publicada no GitHub ou no site.
