# Revisão do histórico compartilhado

Analisado em 09/10/2026: https://chatgpt.com/share/6ac93bb9-eba8-83e9-abad-da6549559579

Foram recuperadas e lidas 11 mensagens da usuária, incluindo pedidos repetidos. Os requisitos estão contemplados em `GTF_MASTER_SPEC.md`; nenhum requisito novo foi identificado fora da especificação. O histórico confirma a autorização para commits/publicação direta e reversão posterior preservando o histórico.

Prioridades preservadas:

- Office Assistant como home: saudação pessoal no horário da Georgia, flags discretas, atalhos individuais, comandos PT/EN, tolerância a erros e confirmação antes de alterações.
- Reagendamento identificado por cliente/propriedade/projeto/appointment, incluindo clientes com vários jobs, com sugestão de mensagem após confirmação.
- Integração Google Calendar bidirecional como prioridade de produção; criar um rascunho de evento novo não cumpre a integração real.
- Office, Crew e Client responsivos; Crew vê apenas atribuições e não preços.
- Projeto central ligando Estimate, Work Order, Invoice, appointments, pessoas e documentos.
- COI único por entidade com GL/WC dentro, filtros e revisão interna periódica de W-9.
- Client com preparação do job, Google Review, Agreement + Care Guide, Warranty bloqueada até assinatura confirmada por projeto.
- Quo SMS para appointments e alerta de mensagens recebidas; pagamentos futuros; SaaS multiempresa com isolamento e configuração por organização.
- Interface leve, hierarquia e cores discretas; funcionalidades anteriores preservadas.

A v5 é uma demo de navegador. Autenticação segura, dados compartilhados, Calendar bidirecional, Quo/SMS, assinatura legal, pagamentos, IA generativa e SaaS operacional continuam pendentes. O histórico não define contas/credenciais finais nem autoriza contratação de serviços. Os documentos finais de Agreement, Care Guide e Warranty ainda precisam ser fornecidos na etapa da integração real.

A conversa anterior contém afirmações de publicação que foram posteriormente corrigidas após erro 403. Publicação e integrações devem ser informadas somente com evidências atuais. Consulte `VALIDATION_V5.md` para os testes e limites desta entrega.
