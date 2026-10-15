# GTF Hub — aceitação mínima para o PRIMEIRO commit v5

**Toda funcionalidade testada deve estar relacionada a um comportamento real. Mostrar limites da demo.**

## Integração e branches

- [x] Buscar HEAD atual do `main`, confirmar repositório e backing branch.
- [x] Criar referência de rollback (tag/branch backup ou anotar SHA) e preservar arquivos desconhecidos.
- [x] Aplicar diferença de `CODIGO_V5/` à raiz do repo e verificar conflitos.
- [x] Rodar `node --check` em JS/MJS, validar HTML e checar sintaxe console no browser.
- [x] Verificar exposição de `.env`, tokens, dados privados e credenciais; demo `gtf2026` deve estar marcadamente como DEMO.

## Office

- [x] `login.html`: entrar como Caritas, Cristiano, Alicia e Cindy, ver saudação correta e tela Office. Logout funciona.
- [x] Dashboard: logo central, frases variáveis, campo de texto amplo, pequenas bandeirolas no topo centralizadas. Conteúdo não fica carregado.
- [x] Contadores clicam nos itens correspondentes; bandeiras vêm de dados corretos e vermelho aparece para item crítico real.
- [x] Atalhos Office são persistidos separadamente por usuário, no navegador.
- [x] Digitar `Alterar horário da Emily Carter para amanhã às 14h30`, `Emilly Catrer` e frase em inglês, confirmar opções.
- [x] Criar dois jobs para mesmo cliente ou nomes semelhantes com endereços diferentes: pedir desambiguação; jamais alterar projeto incorreto.
- [x] Antes de confirmar, nada é gravado. Depois, atualiza SOMENTE appointment/job/WO pertencente ao `projectId` correto.
- [x] Mensagem cliente é só rascunho, não foi enviada; Google e SMS indicam PENDING/NOT CONNECTED.
- [x] Verificar menu, botões e cards em telas desktop e mobile, sem overflow horizontal inesperado.

## Compliance

- [x] Um card `Certificate of Insurance` por subcontractor; dentro dele General Liability e Workers’ Compensation, não duplicados na tela principal.
- [x] Filtro tipo documento e status, W-9 review, bandeiras e alertas coerentes.
- [x] Renovação W-9 descrita como revisão interna, não validade legal automática.

## Crew

- [x] Testar wide desktop 1440 px e mobile 390 px; não ficar estreito tipo telefone no desktop.
- [x] Usuário Crew vê seus jobs/appointments/WO, confirma WO e informa problema ao Office (via fluxo DEMO local).
- [x] Não expor invoice prices/margens por interface Crew; backend real futuramente precisa reforçar.
- [x] Mapas abrem endereço correto; botões sem serviço externo explicam estado pendente.

## Client

- [x] `Before Your Job` legível e natural em inglês.
- [x] Warranty começa bloqueada; clique orienta Agreement; demo assinatura libera garantia e exibe verde. É DEMO, não doc legal.
- [x] Link oficial do Care & Maintenance Guide abre; a proprietária confirmou em 15/10/2026 que a URL Google Review existente é a correta. Não confundir essa confirmação com validação automatizada do Google Business Profile.
- [x] Mobile/desktop legíveis; Cliente não navega para outros projetos no fluxo de demo.

## Google / deploy

- [x] Calendar não promete edição de evento já existente. Draft deve sinalizar que abre NOVO evento.
- [x] Sem OAuth/API keys client-side. `google-calendar-service.example.mjs` é exemplo e deve permanecer não executado no Pages.
- [x] Verificar que site publicou a URL, dar URL, commit SHA e resultado dos testes ao usuário. Se branch protection impedir, criar PR e mostrar pendência real.

## Após primeiro commit

Solicitar apenas dados de integrações realmente indispensáveis para a próxima fase: Google calendar owner/email, domínio, Agreement/Care Guide, política SMS. Não repetir perguntas já respondidas no histórico. Continuar pela etapa de autenticação segura e Google Calendar quando permissões/serviços estiverem configurados.

## Evidência do Codex (09/10/2026)

Checks marcados refletem a validação da demo descrita em VALIDATION_V5.md: 24 testes unitários locais, validação estática e três scripts de navegador aprovados localmente e no site publicado. HTML passou validação básica e sintaxe de scripts, não W3C. Commit de implementação `e26c069d48d54068655d8af33853701e93b2ffda` publicado na `main` e GitHub Pages com build confirmado. Referência remota de rollback: `backup/pre-v5-2026-10-09`, no SHA anterior `4d9e0fba967a8a44a1d9cc8ec329300a2af36488`. A recusa 403 foi resolvida pela reinstalação da integração. O Care Guide oficial foi conectado e o Google Review foi confirmado pela proprietária em 15/10/2026; a tentativa automatizada anterior recebeu CAPTCHA/429. Integrações de produção continuam pendentes.
