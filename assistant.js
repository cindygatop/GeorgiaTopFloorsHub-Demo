/* Georgia Top Floors · local Office assistant for demo data.
   Every write requires exact project/appointment identifiers and confirmation.
   Free-form model conversations use the separate, authenticated Emet workspace. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  const clean=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TIMEZONE='America/New_York';
  const gaToday=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=type=>parts.find(p=>p.type===type).value;return `${get('year')}-${get('month')}-${get('day')}`;};
  const plusDays=(iso,days)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
  const renderDate=v=>({Today:'Today',Tomorrow:'Tomorrow'}[v]||v);
  const shortDate=j=>`${renderDate(j.date)} · ${j.window}`;
  const state={mode:'idle',job:null,options:[],request:null,after:null,preview:null,sequence:0};
  const billing={mode:'idle',intent:null,job:null,options:[],draft:null,sourceId:null,invoiceId:null,patch:{},preview:null,last:null,waiting:null};
  const projectId=j=>j.projectId||`project-${j.id}`;
  const appointmentId=j=>j.appointmentId||`appointment-${j.id}`;
  const sameAppointment=(a,b)=>projectId(a)===projectId(b)&&appointmentId(a)===appointmentId(b);
  const jobLabel=j=>`${j.customer} · ${j.address} · ${j.service} · ${shortDate(j)} · ${appointmentId(j)}`;
  const canEdit=()=>window.GTFAuth?.currentUser()?.role==='office';
  const messages=[];
  // Conversation context stores only a topic/language and variation counters.
  // It is never written to browser storage or sent to a model/provider.
  const chat={language:'en',topic:null,variants:Object.create(null),turn:0};
  function say(text,actions=[],kind='assistant'){
    if(!el('assistantConversation'))return;
    messages.push({text,actions,kind});if(messages.length>10)messages.shift();
    el('assistantConversation').innerHTML=messages.map(m=>`<article class="assistant-message ${m.kind}"><div class="assistant-message-text">${safe(m.text).replace(/\n/g,'<br>')}</div>${m.actions.length?`<div class="assistant-message-actions">${m.actions.map(a=>`<button type="button" data-assistant-action="${safe(a.value)}">${safe(a.label)}</button>`).join('')}</div>`:''}</article>`).join('');
    const pane=el('assistantConversation');pane.scrollTop=pane.scrollHeight;
  }
  function button(label,value){return {label,value};}
  function georgiaHour(){return Number(new Intl.DateTimeFormat('en-US',{timeZone:TIMEZONE,hour:'2-digit',hourCycle:'h23'}).format(new Date()));}
  function greeting(){const u=window.GTFAuth?.currentUser(),hour=georgiaHour();const part=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';el('assistantGreeting').textContent=`${part}, ${u?.name||'team'}.`;const phrases=["I'm Ruach. What would you like to take care of today?","I'm Ruach. We can start with a question or a task.",'Ready to make today run smoothly? Ask me where to start.','A question, a project, or a plan — where should we start?'];el('assistantPrompt').textContent=phrases[(Number(gaToday().slice(-2))+((u?.name||'').length))%phrases.length];}
  function languageFor(n){if(/\b(bom dia|boa tarde|boa noite|oi|ola|obrigad[oa]|valeu|tchau|ate logo|como|voce|quem|qual|quais|preciso|quero|posso|minha|meu|ajuda|conta|convite|conectar|dados|precos|banco|enviar|envie|envia|mande|mensagem|senha|tudo bem|nao entendi|pode|por favor|cria|crie|criar|gera|gerar|faz|faca|fazer|monta|muda|altera|alterar|edita|editar|fatura|cobranca|orcamento|pra|uai|vencimento|quantidade|valor)\b/.test(n))return 'pt';if(/\b(hello|hi|hey|good morning|good afternoon|good evening|thanks|thank you|bye|goodbye|how|what|who|help|connect|account|invite|import|prices|send|your|you|create|edit|change|invoice|due|quantity|price)\b/.test(n))return 'en';return chat.language;}
  function varied(key,pt,en){const options=chat.language==='pt'?pt:en,id=chat.language+':'+key,count=chat.variants[id]||0;chat.variants[id]=count+1;return options[count%options.length];}
  function chatReply(text,actions=[]){
    const pt=chat.language==='pt';
    if(state.mode==='confirm'&&state.preview){text+='\n\n'+(pt?'Seu reagendamento continua na prévia; nada foi salvo. Confirme ou cancele quando quiser.':'Your reschedule is still a preview; nothing has been saved. Confirm or cancel when you are ready.');actions=[...actions,button(pt?'Confirmar alteração':'Confirm change',`confirm:${state.preview.token}`),button(pt?'Cancelar':'Cancel','cancel')];}
    else if(state.mode==='choose'){text+='\n\n'+(pt?'A escolha do projeto continua pendente. Para retomar, diga o número da opção ou o appointment ID.':'Your project selection is still pending. To continue, give the option number or appointment ID.');}
    else if(state.mode==='await-name'||state.mode==='missing-date')text+='\n\n'+(pt?'Quando quiser retomar o agendamento, informe o cliente ou a data e o horário que faltam.':'When you want to resume scheduling, provide the missing customer or appointment date and time.');
    if(billing.mode!=='idle'){
      text+='\n\n'+(pt?'A invoice continua em preparação; nada foi salvo. Você pode continuar ou cancelar.':'Your invoice is still being prepared; nothing has been saved. You can continue or cancel.');
      if(billing.mode==='confirm'&&billing.preview)actions=[...actions,button(pt?'Salvar rascunho':'Save draft',`invoice-confirm:${billing.preview.token}`)];
      actions=[...actions,button(pt?'Cancelar invoice':'Cancel invoice','invoice-cancel')];
    }
    say(text,actions);
  }
  function faq(topic){
    chat.topic=topic;const pt=chat.language==='pt';let text,actions=[];
    const settings=(tab,label)=>button(label||'Settings','settings-tab:'+tab);
    if(topic==='accounts'){
      text=varied(topic,[
        'O acesso real começa com um convite da empresa. Um owner, admin ou gerente autorizado define email, papel e empresa; para Client, também o projeto. A conta só recebe acesso depois da verificação do email e da aprovação de um gerente. Em Settings → Team & invitations você vê o fluxo; na demo ele não cria contas reais sem o backend configurado.',
        'Para cadastrar alguém, use Settings → Team & invitations com uma conta autorizada. O convite define a empresa e o papel; cliente recebe vínculo com o projeto correto. Verificar o email e obter aprovação do gerente são duas etapas obrigatórias. Um perfil Office da demo não equivale a essa autorização real.'
      ],[
        'Real access starts with a company invitation. An authorized owner, admin or manager sets the email, company and role; a Client also needs a specific project. Access requires both email verification and manager approval. Settings → Team & invitations shows the flow; real accounts need the configured backend.',
        'Use Settings → Team & invitations with an authorized company account. The invitation fixes the company, role and client project. Email verification and manager approval are separate requirements. An Office demo profile does not grant real invitation privileges.'
      ]);actions=[settings('team',pt?'Contas e convites':'Team & invitations')];
    }else if(topic==='profile'){
      const name=window.GTFAuth?.currentUser()?.name|| (pt?'equipe':'team');
      text=varied(topic,[`Seu perfil atual mostra ${name}. Nome e foto ficam em Settings → Profile. Na demo são preferências locais; senha, email de login e recuperação reais dependem da conta segura configurada. Não preciso que você escreva sua senha aqui.`,`Estou usando o nome ${name}, que vem do seu perfil. Você pode revisar nome e foto em Settings → Profile. Alterar credenciais reais exige o fluxo seguro da conta; conversar comigo não muda seu login.`],[`Your current profile says ${name}. Name and photo are in Settings → Profile. In the demo these are local preferences; real login email, password and recovery need the configured secure account. Please keep passwords out of the chat.`,`I use ${name} from your profile. You can review your name and photo in Settings → Profile. Real credentials use the secure account flow; this conversation does not change your login.`]);actions=[settings('profile',pt?'Abrir meu perfil':'Open my profile')];
    }else if(topic==='data'){
      text=varied(topic,[
        'Você pode abrir Data workspace, escolher CSV, XLSX ou um JSON exportado pelo Hub e revisar planilha, cabeçalho e mapeamento. O preview permite editar linhas e revisar duplicatas sem unir automaticamente. Por enquanto os arquivos ficam só na memória desta aba; exporte para guardar o trabalho. Isso ainda não importa clientes no banco da empresa.',
        'Para preparar seus dados: selecione o arquivo, confira os campos, revise as linhas marcadas e adicione as escolhidas à sessão temporária. Depois exporte JSON ou CSV. Nada é enviado a terceiros ou salvo no Hub por esse workspace; fechar ou recarregar a aba remove a sessão.'
      ],[
        'Open Data workspace, choose CSV, XLSX or a Hub JSON export, then review the sheet, header and column mapping. You can edit rows and review duplicates without automatic merging. Files currently stay in this tab’s memory; export to keep your work. This does not import customers into the company database yet.',
        'To prepare data, select a file, match its fields, review flagged rows and add your selection to the temporary session. Then export JSON or CSV. The workspace does not upload the file or save it to the Hub; closing or reloading the tab clears that session.'
      ]);actions=[button(pt?'Abrir Data workspace':'Open Data workspace','open-data-tools')];
    }else if(topic==='prices'){
      text=varied(topic,[
        'As tabelas de preço podem ser preparadas no Data workspace como Products & services. Para cada coluna de preço, escolha “Price by customer type” e mantenha o tipo correto, como Contractor ou Subcontractor. Zero é preservado; vazio não vira zero, e texto indefinido exige revisão. Eu não consulto uma tabela de preços real da empresa nesta demo.',
        'Um produto pode ter preços diferentes por tipo de cliente. No importador, mapeie cada tabela para seu tipo e confira o preview antes de exportar. Valores originais são preservados no JSON completo; preços pendentes não devem ser tratados como preços válidos. Ainda não há catálogo compartilhado no banco.'
      ],[
        'Prepare a price sheet in Data workspace as Products & services. Map each price column to “Price by customer type” and keep its correct label, such as Contractor or Subcontractor. Zero stays zero; blanks are not invented prices, and unresolved text needs review. I cannot query a real company price list in this demo.',
        'A product can have a different price for each customer type. Map each tier and check the preview before exporting. Full JSON preserves the original values; unresolved prices are not usable rates. A shared database catalog is not connected yet.'
      ]);actions=[button(pt?'Preparar tabela de preços':'Prepare a price list','open-data-tools')];
    }else if(topic==='database'){
      text=varied(topic,[
        'Supabase é a base planejada para autenticação, banco e arquivos privados. A fundação de contas já tem código, mas precisa de projeto, configuração e validação real. Clientes, jobs e preços desta demo ainda não foram migrados para um banco compartilhado. Para ativar isso, precisamos aplicar as migrações certas e testar permissões por empresa; não envie chaves no chat.',
        'Os dados operacionais da demo ficam neste navegador; os arquivos do Data workspace ficam só na memória da aba. O backend de contas foi preparado para Supabase, mas publicar o código não configura o serviço nem migra seus clientes. A etapa real inclui banco, isolamento por empresa, backups e testes.'
      ],[
        'Supabase is the planned foundation for authentication, the database and private files. Account backend code exists, but it needs a configured project and real validation. Demo customers, jobs and prices have not been migrated to a shared database. Activation needs the right migrations and tenant permission tests; keep keys out of the chat.',
        'Operational demo data stays in this browser; Data workspace files stay only in tab memory. The account foundation targets Supabase, but publishing code does not provision the service or migrate customers. Real activation includes the database, tenant isolation, backups and tests.'
      ]);actions=[settings('data',pt?'Dados e configuração':'Data & setup')];
    }else if(topic==='gmail'){
      text=varied(topic,[
        'Gmail é uma autorização opcional, separada do Calendar. Em Settings → Integrations, meu guia mostra a conta e as permissões que você deve revisar antes de autorizar. Esta conversa não lê sua caixa nem envia email. A conexão real exige OAuth e backend seguro; não preciso da sua senha.',
        'Para conectar Gmail, escolha uma conta autorizada e revise o acesso à caixa no guia de Settings. Permissão de agenda não concede permissão de email. Só uma confirmação do serviço pode indicar conexão real; abrir ou concluir o guia não conecta a conta.'
      ],[
        'Gmail access is optional and separate from Calendar. In Settings → Integrations, my guide explains the account and permissions to review before authorization. This chat does not read your inbox or send email. A real connection needs OAuth and a secure backend; I do not need your password.',
        'To link Gmail, choose an authorized account and review inbox access in the Settings guide. Calendar permission does not grant email permission. Only a confirmed service response can establish a real connection; finishing the guide does not connect the account.'
      ]);actions=[button(pt?'Guia Gmail e permissões':'Ruach · Gmail permissions','settings:gmail')];
    }else if(topic==='quo'){
      text=varied(topic,[
        'Quo será o canal de SMS e alertas de mensagens. Precisamos da conta e do número autorizados, API no servidor, webhooks verificados e consentimentos. Meu guia em Settings explica cada etapa. Nesta demo, mensagens e reminders são locais; nenhum SMS é enviado. Antes de um envio real, você deve revisar destinatário e texto.',
        'Para conectar Quo, um administrador confere o plano, o número e as permissões da conta da empresa. A credencial fica no servidor, e o teste precisa confirmar resposta da API e estado de entrega. Não cole a chave aqui. Posso abrir o guia e preparar rascunhos; este chat não envia mensagens.'
      ],[
        'Quo is the planned channel for SMS and incoming message alerts. It needs an authorized account and number, server-side API access, verified webhooks and consent. Settings has a step-by-step guide. In this demo, reminders stay local and no SMS is sent. Review the recipient and exact message before any real send.',
        'To connect Quo, an administrator checks the company account’s plan, number and permissions. The credential stays on the server; a test must confirm the API response and delivery state. Do not paste the key here. I can offer the guide and drafts, but this chat does not send messages.'
      ]);actions=[button(pt?'Guia de conexão Quo':'Ruach · Quo setup guide','settings:quo')];
    }else if(topic==='calendar'){
      text=varied(topic,[
        'Para conectar Calendar, escolha a conta empresarial e o calendário que a empresa autoriza. Settings → Integrations explica OAuth e permissões; Gmail é separado. Sincronização bidirecional exige backend, IDs de eventos e tratamento de alterações/conflitos. O link atual abre apenas um rascunho de evento NOVO, não atualiza a agenda real.',
        'O primeiro passo é definir qual calendário pode ser lido e editado, sem incluir agendas privadas por padrão. Depois o backend conclui OAuth e testa ida e volta das alterações. Abrir o guia ou criar um rascunho não comprova conexão. Posso orientar a configuração, mas não sincronizo um Google Calendar real nesta demo.'
      ],[
        'To connect Calendar, choose the company-owned account and explicitly authorized calendar. Settings → Integrations explains OAuth and permissions; Gmail is separate. Two-way sync needs a backend, event IDs and conflict handling. The current link only opens a NEW event draft; it does not update a real calendar.',
        'First choose which calendar can be read and edited, leaving private calendars out unless authorized. The backend then completes OAuth and tests changes in both directions. Opening a guide or event draft does not prove connection. I can guide setup, but this demo does not sync a real Google Calendar.'
      ]);actions=[button(pt?'Guia Google Calendar':'Link calendars · Ruach guide','settings:google'),button(pt?'Ver Jobs':'View Jobs','open-jobs')];
    }else if(topic==='signature'){
      text=pt?'O Certificate of Acceptance é o aceite no final da obra, separado do Agreement inicial. O guia oficial de cuidados já foi indicado, mas ainda precisamos do Agreement inicial e dos termos oficiais da Warranty para a integração. Assinatura real exige provedor e webhook confirmado por projeto; digitar um nome na demo não é prova legal nem ativa uma garantia real.':'The Certificate of Acceptance is for job completion, separate from the initial Agreement. The official care guide has been identified, while the initial Agreement and official Warranty terms are still needed for integration. Real signing needs a provider and a confirmed project-specific webhook; typing a name in the demo is not legal proof or an active warranty.';actions=[button(pt?'Guia de assinatura':'Signature setup guide','settings:signature')];
    }else if(topic==='payments'){
      text=pt?'A Invoice da demo calcula valores e permite um lançamento local, mas não cobra dinheiro. Pagamento real exige conta empresarial do provedor, checkout seguro e webhook validando invoice, valor e moeda. A cobrança da assinatura Emet será separada do pagamento dos clientes da empresa.':'Demo invoices calculate amounts and support local records, but do not charge money. Real payments need the business provider account, secure checkout and a webhook verifying the invoice, amount and currency. Emet subscription billing will be separate from the company’s customer payments.';actions=[button(pt?'Guia de pagamentos':'Payment setup guide','settings:payments')];
    }else if(topic==='ai'){
      text=varied(topic,[
        'Sou Ruach, o assistente da Emet. Nesta versão, respondo com regras e textos programados localmente; não tenho um LLM conectado nem consulta geral à internet. Posso conversar sobre o Hub, orientar configurações e preparar algumas ações da demo com confirmação. Uma IA real precisa de backend autorizado, provedor e testes.',
        'A conversa atual é uma camada local programada. Eu não estou usando uma API de IA para gerar estas respostas, ler arquivos externos ou acessar suas contas. O plano é conectar um modelo no servidor, com permissões, ferramentas e confirmação antes das gravações.'
      ],[
        'I’m Ruach, Emet’s assistant. In this version I use local rules and prepared responses; no LLM or general web lookup is connected. I can discuss the Hub, guide setup and prepare supported demo actions with confirmation. A live AI needs an authorized backend, provider and testing.',
        'This conversation uses a programmed local layer. I am not calling an AI API, reading external files or accessing your accounts to generate these replies. A future server-side model needs permissions, tools and confirmation before changes.'
      ]);actions=[button(pt?'Guia de IA segura':'Secure AI setup guide','settings:ai')];
    }else if(topic==='emet'){
      text=varied(topic,['Emet é a plataforma que está sendo construída para organizar empresas, equipes, clientes e projetos. Georgia Top Floors é a empresa piloto; Ruach é o assistente dentro da plataforma. A arquitetura mantém dados e permissões separados por empresa quando o backend estiver configurado.','A plataforma se chama Emet, e eu sou Ruach. A ideia é ligar o Office, o Crew e o Client ao mesmo projeto, preservando permissões por empresa. A Georgia Top Floors é o piloto; esta tela ainda contém demonstrações locais.'],['Emet is the platform being built to organize companies, crews, customers and projects. Georgia Top Floors is the pilot company; Ruach is the assistant inside it. The architecture keeps company data and permissions separate when the backend is configured.','The platform is Emet, and I’m Ruach. Its goal is to connect Office, Crew and Client around each project, with company-specific permissions. Georgia Top Floors is the pilot; this screen still contains local demos.']);
    }else if(topic==='budget'){
      text=pt?'O orçamento depende das contas e do uso. A referência de infraestrutura do piloto é Vercel Pro US$20/mês e Supabase Pro US$25/mês, antes de domínio, email, SMS, assinatura, IA e taxas de pagamento. Não consigo verificar sua fatura aqui, e nenhuma contratação é feita por esta conversa. Os cenários e condições estão no documento de serviços e orçamento.':'Costs depend on the accounts and usage. The pilot infrastructure reference is Vercel Pro at US$20/month and Supabase Pro at US$25/month, before domain, email, SMS, signatures, AI and payment fees. I cannot verify your bill here, and this conversation purchases nothing. The service budget document lists scenarios and conditions.';actions=[button(pt?'Ver serviços e orçamento':'View services & budget','open-budget')];
    }else{
      text=varied('help',[
        'Podemos começar com uma pergunta ou uma tarefa. Posso orientar contas e convites, arquivos e preços, perfil e integrações. Na demo também encontro jobs, mostro prioridades, preparo reagendamentos e crio ou edito invoices em Draft com confirmação. O que você quer resolver primeiro?',
        'Claro. Você pode perguntar “como importar meus clientes?”, “como conectar o Calendar?” ou pedir “cria uma invoice para Emily”. Para salvar, preciso identificar o projeto e os dados; mostro a prévia antes de confirmar. Qual desses caminhos faz sentido agora?'
      ],[
        'We can start with a question or a task. I can explain accounts and invitations, files and prices, profile settings and integrations. In the demo I also find jobs, show priorities, preview reschedules and create or edit Draft invoices with confirmation. What would you like to handle first?',
        'Of course. Ask “how do I import customers?” or “how do I connect Calendar?”, or say “create an invoice for Emily”. I need the exact project and fields, and show a preview before you confirm a save. Where would you like to start?'
      ]);actions=[settings('integrations',pt?'Configurações e guias':'Settings & guides'),button(pt?'Revisar prioridades':'Review priorities','show-priorities')];
    }
    chatReply(text,actions);
  }
  function conversation(text,n){
    chat.language=languageFor(n);const pt=chat.language==='pt',name=window.GTFAuth?.currentUser()?.name||(pt?'equipe':'team');
    if(/^(?:(?:oi|ola|hello|hi|hey)(?: ruach)? )?(?:(?:bom dia|boa tarde|boa noite|oi|ola|hello|hi|hey|good morning|good afternoon|good evening)(?: ruach)?)(?: tudo bem| como vai| how are you)?$/.test(n)){
      const hour=georgiaHour(),part=pt?(hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite'):(hour<12?'Good morning':hour<18?'Good afternoon':'Good evening');
      chatReply(varied('greeting',[`${part}, ${name}! Sou Ruach. Como posso ajudar hoje?`,`Olá, ${name}! Podemos conversar ou começar por uma tarefa. O que você tem em mente?`,`${part}, ${name}. Quer tirar uma dúvida ou organizar algo no Hub?`],[`${part}, ${name}! I’m Ruach. How can I help today?`,`Hi, ${name}! We can talk through a question or start a task. What’s on your mind?`,`${part}, ${name}. Is there something you’d like to understand or organize in the Hub?`]));return true;
    }
    if(/^(?:ruach|voce esta ai|esta ai|are you there)$/.test(n)){chatReply(pt?`Estou aqui, ${name}. Pode me contar o que precisa.`:`I’m here, ${name}. Tell me what you need.`);return true;}
    if(/^(?:como (?:voce )?esta|como vai|tudo bem(?: com voce)?|how are you(?: doing)?|how is it going)(?: ruach)?$/.test(n)){chatReply(varied('wellbeing',['Tudo certo por aqui, obrigada por perguntar! Estou pronta para ajudar. E você, como está?','Estou pronta para conversar, sim. Como está seu dia e o que podemos organizar juntos?'],['I’m here and ready to help, thanks for asking! How are you doing?','Ready to talk things through. How is your day going?']));return true;}
    if(/^(?:ok )?(?:muito |muita |muitissimo |muitissima )?(?:obrigad[oa]|valeu|agradeco|thanks|thank you)(?: mesmo| pela ajuda| por ajudar| muito| so much| very much| for your help| ruach){0,3}$/.test(n)){chatReply(varied('thanks',['Por nada! Quando quiser, seguimos de onde paramos.','Disponha. Quer continuar nesse assunto ou ver outra coisa?','Fico à disposição, '+name+'. Qual é o próximo passo?'],['You’re welcome! We can pick up where we left off whenever you’re ready.','Happy to help. Would you like to continue with this or look at something else?','You’re welcome, '+name+'. What would you like to do next?']));return true;}
    if(/^(?:tchau|ate logo|ate mais|boa noite e ate amanha|bye|goodbye|see you|see you later)(?: ruach)?$/.test(n)){chatReply(varied('bye',['Até mais, '+name+'!','Até logo! Quando voltar, diga por onde quer começar.'],['See you, '+name+'!','Take care! When you return, tell me where you’d like to start.']));return true;}
    if(/^(?:quem e voce|quem e ruach|qual (?:e )?(?:o )?seu nome|voce (?:e|se chama) ruach|who are you|who is ruach|what (?:is|s) your name|are you ruach)$/.test(n)){chatReply(varied('identity',['Sou Ruach, o assistente da Emet. Estou aqui para orientar você pelo Hub e ajudar com os fluxos disponíveis. O que gostaria de conversar?','Pode me chamar de Ruach. Vamos por partes: qual dúvida ou tarefa você quer cuidar hoje?'],['I’m Ruach, Emet’s assistant. I can help you understand the Hub and work through its supported flows. What would you like to talk about?','You can call me Ruach. We can take things one step at a time — what question or task would you like to start with?']));return true;}
    if(/\b(?:qual (?:e )?(?:o )?meu nome|quem sou eu|what is my name|who am i|meu perfil|minha foto|my profile|my photo|mudar meu nome|alterar meu nome|change my name|minha senha|my password|email de login|login email|recuperar acesso|password reset)\b/.test(n)){faq('profile');return true;}
    // Sending is never an implicit side effect of chat, even after a draft.
    if(/\b(?:enviar|envie|envia|mande|mandar|send)\b/.test(n)&&! /\b(?:como|how|conectar|connect|permissao|permission)\b/.test(n)){
      chat.topic=/\b(gmail|email)\b/.test(n)?'gmail':'quo';
      chatReply(pt?'Não enviei nada. Nesta demo posso preparar um rascunho para você revisar; envio real depende da conexão autorizada e da confirmação do destinatário e do texto. Quer o guia ou um rascunho?':'Nothing was sent. In this demo I can prepare a draft for review; real sending requires an authorized connection and confirmation of the recipient and exact message. Would you like the guide or a draft?', [...(state.after?[button(pt?'Preparar rascunho':'Draft a message','draft')]:[]),button(pt?'Ver guia de conexão':'Open connection guide','settings:'+chat.topic)]);return true;
    }
    const howTo=/^(?:e )?(?:como (?:eu )?(?:faco|comeco|conecto|conectar|procedo)|como assim|qual (?:e )?o proximo passo|e agora|how (?:do i|can i|to)|and how (?:do i|can i|to)|what next|and then)/.test(n);
    if(/^(?:(?:e|and) )?(?:como (?:eu )?(?:faco|conecto|conectar|procedo)|how (?:do i|can i|to)(?: connect)?|what next|e agora)(?: isso| isto| conectar| it| this)?$/.test(n)||/^(?:nao entendi|me explica|pode explicar(?: melhor)?|can you explain|explain that|tell me more)$/.test(n)){if(chat.topic)faq(chat.topic);else chatReply(pt?'Você quer começar por contas e convites, importar dados ou conectar uma integração? Diga qual deles e eu explico o próximo passo.':'Would you like to start with accounts and invitations, importing data or connecting an integration? Tell me which one and I’ll explain the next step.');return true;}
    // Leave action requests to the existing schedule parser. How-to questions
    // about settings remain explanatory and never start a write preview.
    if(!howTo&&/(altera|muda|troca|reagenda|remarca|resched|change|move|shift|adiar|antecipar|novo horario|new time)/.test(n))return false;
    if(/\b(emet)\b/.test(n)&&/\b(quem|que|what|who|plataforma|platform)\b/.test(n)){faq('emet');return true;}
    if(/\b(llm|ia|inteligencia artificial|artificial intelligence|ai|modelo|model|chatgpt|conversa livre|como voce funciona|how do you work)\b/.test(n)){faq('ai');return true;}
    if(/\b(convite|convites|convidar|convidado|convidados|invite|invites|invitation|invitations|cadastro|cadastrar|registrar|signup|sign up|gerente|manager|aprovar|aprovacao|approval|minha conta|my account|conta real|real account|criar conta|criar contas|create an account|create account|nova conta|new account)\b/.test(n)){faq('accounts');return true;}
    if(/\b(quanto custa|custo|custos|mensalidade|orcamento|budget|cost|costs|subscription|plano supabase|supabase plan)\b/.test(n)){faq('budget');return true;}
    if(/\b(supabase|banco|database|banco de dados|dados salvos|data stored)\b/.test(n)){faq('database');return true;}
    if(/\b(preco|precos|price|prices|pricing|tabela|catalogo|catalog|contractor|subcontractor)\b/.test(n)){faq('prices');return true;}
    if(/\b(importar|importacao|import|importing|exportar|export|csv|xlsx|planilha|spreadsheet|arquivo|arquivos|meus dados|my data)\b/.test(n)){faq('data');return true;}
    if(/\b(gmail|email|e mail|inbox|caixa de entrada)\b/.test(n)){faq('gmail');return true;}
    if(/\b(quo|sms|whatsapp)\b/.test(n)){faq('quo');return true;}
    if(/\b(google calendar|calendar|calendario|sincronizar|sync)\b/.test(n)||howTo&&/\b(agenda|agendamento|horario|appointment|schedule)\b/.test(n)){faq('calendar');return true;}
    if(/\b(assinatura|assinar|agreement|warranty|garantia|certificate of acceptance|signwell|documenso|e signature)\b/.test(n)){faq('signature');return true;}
    if(/\b(stripe|pagamento|pagamentos|payment|payments|checkout)\b/.test(n)){faq('payments');return true;}
    if(/\b(integracao|integracoes|integration|integrations|conectar|connect)\b/.test(n)){chat.topic=null;chatReply(pt?'Qual serviço você quer conectar: Google Calendar, Gmail, Quo, assinatura, pagamentos ou IA? Cada um tem permissões e etapas próprias em Settings.':'Which service would you like to connect: Google Calendar, Gmail, Quo, signatures, payments or AI? Each has its own permissions and steps in Settings.',[button(pt?'Ver integrações':'View integrations','settings-tab:integrations')]);return true;}
    if(/^(?:ajuda|help|me ajuda|me ajude|preciso de ajuda|o que (?:voce )?(?:pode|consegue) fazer|o que (?:voce )?faz|como (?:voce )?(?:pode )?me ajuda|what can you do|what do you do|what can you help with|capabilities|podemos conversar|pode conversar comigo|can we talk|can you chat)$/.test(n)){faq('help');return true;}
    return false;
  }
  function unknownReply(){const pt=chat.language==='pt';chatReply(varied('unknown',[
    'Me conta um pouco mais: você está falando de uma tela do Hub, uma conta ou um projeto específico? Assim posso orientar o próximo passo sem adivinhar.',
    'Você quer entender como algo funciona ou preparar uma ação? Diga qual área do Hub e o resultado que espera.',
    'Ainda não entendi o pedido com segurança. Pode dar um exemplo do que quer fazer? Posso ajudar com contas, arquivos, integrações ou jobs.'
  ],[
    'Could you give me a little more context? Do you mean a Hub screen, an account or a particular project? That will help me guide the next step without guessing.',
    'Would you like an explanation or help preparing an action? Tell me which part of the Hub and the result you want.',
    'I haven’t understood the request confidently yet. Could you give an example? I can help with accounts, files, integrations or jobs.'
  ]),[button(pt?'O que posso fazer':'What can you help with?','chat-help')]);}
  // Billing proposals stay in memory until a fresh preview is explicitly confirmed.
  // Invoices are local Drafts: they never issue a bill, send it or record payment.
  const invoiceWord=n=>n.split(' ').some(t=>['invoice','invoices','fatura','faturas','cobranca','cobrancas'].includes(t)||t.length>=6&&t.length<=8&&distance(t,'invoice')<=2);
  const editWords=n=>/\b(altera\w*|muda\w*|troca\w*|edita\w*|corrig\w*|ajusta\w*|atualiza\w*|edit|change|update|modify|fix)\b/.test(n);
  const createWords=n=>/\b(cria\w*|gera\w*|faz|faca|fazer|monta\w*|emiti\w*|emite|quero|preciso|create|make|new|draft|prepare)\b/.test(n);
  const refWords=n=>/\b(isso|isto|essa|esse|ela|dela|that|this|it)\b/.test(n);
  const billText=(pt,en)=>chat.language==='pt'?pt:en;
  const copy=value=>JSON.parse(JSON.stringify(value));
  function resetBilling(){Object.assign(billing,{mode:'idle',intent:null,job:null,options:[],draft:null,sourceId:null,invoiceId:null,patch:{},preview:null,waiting:null});}
  function billingData(){const w=window.GTFWorkflow;if(!w||typeof w.load!=='function'||typeof w.createInvoiceDraft!=='function'||typeof w.updateInvoiceDraft!=='function')throw new Error('draft_tools_unavailable');const s=w.load();if(!s||!Array.isArray(s.invoices)||!Array.isArray(s.estimates)||!Array.isArray(s.payments))throw new Error('invalid_workflow');return s;}
  function validISO(value){if(!/^20\d{2}-\d{2}-\d{2}$/.test(value||''))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
  function invoiceNumber(raw,{quantity=false}={}){
    let value=String(raw||'').trim();
    if(!/^-?\d+(?:[.,]\d+)*$/.test(value))return null;
    if(value.includes('.')&&value.includes(',')){
      const decimal=value.lastIndexOf('.')>value.lastIndexOf(',')?'.':',',thousands=decimal==='.'?',':'.';
      const pieces=value.split(decimal);if(pieces.length!==2||pieces[1].length>2||!/^\d{1,3}(?:[.,]\d{3})+$/.test(pieces[0]))return null;
      value=pieces[0].split(thousands).join('')+'.'+pieces[1];
    }else if(/[.,]/.test(value)){
      const pieces=value.split(/[.,]/);if(pieces.length!==2||pieces[1].length>(quantity?3:2))return null;
      // A single three-digit suffix is ambiguous between a decimal and thousands.
      if(pieces[1].length===3)return null;value=pieces.join('.');
    }
    const number=Number(value);return Number.isFinite(number)&&number>=0&&number<=1000000?number:null;
  }
  function invoiceFields(text,waiting){
    const raw=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,''),n=clean(raw),patch={};let error=null;
    if(/R\$|\b(?:BRL|reais|EUR|euros?|GBP|libras?)\b|[€£]/i.test(raw))return {patch:{},error:billText('Este fluxo usa USD. Informe o valor em dólares; não vou converter outra moeda automaticamente.','This flow uses USD. Enter the dollar amount; I will not convert another currency automatically.')};
    const label=(expr)=>raw.match(new RegExp('\\b(?:'+expr+')\\s*(?:(?:para|pra|to|de|of|e|is)\\s*)?[:=]?\\s*(?:US\\$|USD|\\$)?\\s*(-?\\d[\\d.,]*)(?![\\w.,])','i'));
    const quantity=label('quantidade|qtd|qty|quantity'),price=label('preco(?:\\s+unitario)?|valor\\s+unitario|unit\\s+price|rate|price'),total=label('valor\\s+total|total|lump\\s+sum|valor(?!\\s+unitario)');
    if(quantity){patch.qty=invoiceNumber(quantity[1],{quantity:true});if(patch.qty===null||patch.qty<=0)error=billText('Informe uma quantidade positiva, sem separador de milhares.','Enter a positive quantity without a thousands separator.');}
    if(price){patch.unitPrice=invoiceNumber(price[1]);if(patch.unitPrice===null)error=billText('Informe o preço em USD com até duas casas decimais, por exemplo 1250.50.','Enter the USD unit price with up to two decimals, for example 1250.50.');}
    if(total&&!price){patch.total=invoiceNumber(total[1]);if(patch.total===null)error=billText('O valor está ambíguo ou inválido. Use por exemplo 1250.50, sem separador de milhares.','The amount is ambiguous or invalid. Use e.g. 1250.50 without a thousands separator.');}
    const item=raw.match(/\b(?:item|linha|line)\s*#?\s*(\d+)\b/i);if(item)patch.itemIndex=Number(item[1])-1;
    const description=raw.match(/\b(?:descricao|servico|description|service)\s*[:=]\s*([^;\n]+)/i);
    if(description)patch.description=description[1].trim();
    const notes=raw.match(/\b(?:nota|notas|observacao|observacoes|notes?)\s*[:=]\s*([^;\n]+)/i);if(notes)patch.notes=notes[1].trim();
    const due=raw.match(/\b(?:vencimento|vence|vencer|due(?:\s+date)?)\s*[:=]?\s*(?:em|on|para|pra)?\s*([^;\n]+)/i);
    if(due){patch.dueDate=appointment(due[1]).date;if(!patch.dueDate||!validISO(patch.dueDate))error=billText('Qual a data de vencimento? Use YYYY-MM-DD ou “amanhã”.','What is the due date? Use YYYY-MM-DD or “tomorrow”.');}
    if(!Object.keys(patch).length&&waiting){
      if(waiting==='dueDate'){const date=appointment(raw).date;if(date)patch.dueDate=date;}
      if(['qty','unitPrice'].includes(waiting)&&/^\s*(?:US\$|USD|\$)?\s*-?\d[\d.,]*\s*$/i.test(raw)){
        patch[waiting]=invoiceNumber(raw.replace(/US\$|USD|\$/ig,'').trim(),{quantity:waiting==='qty'});
        if(patch[waiting]===null||waiting==='qty'&&patch[waiting]<=0)error=billText('Esse número precisa de revisão. Use 980 para quantidade ou 4.50 para preço.','That number needs review. Use 980 for quantity or 4.50 for price.');
      }
      if(waiting==='description'&&raw.trim().length<=240&&!invoiceWord(n)&&!editWords(n)&&!createWords(n)&&! /\b(como|voce|what|how)\b/.test(n))patch.description=String(text).trim();
    }
    return {patch,error};
  }
  function draftError(draft){
    if(!draft||!Array.isArray(draft.items)||!draft.items.length||draft.items.length>100)return 'items';
    for(const item of draft.items){if(!String(item.description||'').trim()||String(item.description).length>240)return 'description';if(!Number.isFinite(item.qty)||item.qty<=0||item.qty>1000000)return 'qty';if(!Number.isFinite(item.unitPrice)||item.unitPrice<0||item.unitPrice>1000000)return 'unitPrice';}
    if(!validISO(draft.dueDate))return 'dueDate';
    if(!Number.isFinite(Number(draft.taxRate))||Number(draft.taxRate)<0||Number(draft.taxRate)>100||!Number.isFinite(Number(draft.discount))||Number(draft.discount)<0)return 'totals';
    const subtotal=draft.items.reduce((sum,i)=>sum+i.qty*i.unitPrice,0),total=subtotal*(1+Number(draft.taxRate)/100)-Number(draft.discount);
    if(!Number.isFinite(total)||total<=0||total>100000000)return 'totals';return null;
  }
  function needInvoiceField(){
    const error=draftError(billing.draft);billing.waiting=error;billing.preview=null;billing.mode='fields';
    const examples={description:billText('Qual é a descrição do serviço? Exemplo: descrição: Sand & Finish.','What is the service description? Example: description: Sand & Finish.'),qty:billText('Qual é a quantidade? Exemplo: quantidade 980. Para preço fechado, diga “valor total 500”.','What is the quantity? Example: quantity 980. For a lump sum, say “total 500”.'),unitPrice:billText('Qual é o preço unitário em USD? Exemplo: preço unitário 4.50.','What is the USD unit price? Example: unit price 4.50.'),dueDate:billText('Qual é a data de vencimento? Pode dizer “vencimento amanhã” ou “vencimento 2026-10-30”.','What is the due date? Say “due tomorrow” or “due 2026-10-30”.'),totals:billText('Os valores precisam de revisão: o total deve ser positivo, com imposto e desconto válidos. Abra Billing para conferir.','The amounts need review: use a positive total with valid tax and discount. Open Billing to check.'),items:billText('Preciso de pelo menos um serviço com descrição, quantidade e preço.','I need at least one service with a description, quantity and price.')};
    say((examples[error]||billText('O que você quer alterar no rascunho? Diga o campo e o novo valor, por exemplo “vencimento amanhã” ou “item 1 preço 4.50”.','What should change in this draft? Give the field and new value, e.g. “due tomorrow” or “item 1 price 4.50”.'))+'\n'+billText('Rascunho local de demonstração; nada foi salvo ou enviado.','Local demo draft; nothing has been saved or sent.'),[button(billText('Abrir Billing','Open Billing'),'open-billing'),button(billText('Cancelar','Cancel'),'invoice-cancel')]);
  }
  function billingSnapshot(s,job){return JSON.stringify({job,source:billing.sourceId?s.estimates.filter(e=>e.id===billing.sourceId):[],invoices:s.invoices.filter(i=>i.projectId===projectId(job)),payments:s.payments.filter(p=>s.invoices.some(i=>i.projectId===projectId(job)&&i.id===p.invoiceId))});}
  function previewInvoice(){
    if(draftError(billing.draft)){needInvoiceField();return;}
    const s=billingData(),job=billing.job,source=billing.sourceId?s.estimates.find(e=>e.id===billing.sourceId):null,draft=billing.draft;
    billing.mode='confirm';billing.waiting=null;billing.preview={token:++state.sequence,signature:billingSnapshot(s,job),draft:copy(draft)};
    const money=n=>window.GTFWorkflow.money(n),totals=window.GTFWorkflow.totals(draft),pt=chat.language==='pt';
    let text=billText('Confira o rascunho da invoice:','Review the invoice draft:')+`\n${job.customer} · ${job.address}\n${billText('Cobrar de','Bill to')}: ${draft.customer}${draft.company&&draft.company!==draft.customer?' · '+draft.company:''}\nProject: ${projectId(job)} · Appointment: ${appointmentId(job)}\n`+(source?`${source.number} · ${source.status}\n`:'')+draft.items.map((item,i)=>`${i+1}. ${item.description} · ${item.qty} ${item.unit||'Project'} × ${money(item.unitPrice)} = ${money(item.qty*item.unitPrice)}`).join('\n')+`\n${billText('Imposto','Tax')}: ${draft.taxRate}% · ${billText('Desconto','Discount')}: ${money(draft.discount)}\nTotal: ${money(totals.total)} USD\n${billText('Vencimento','Due')}: ${draft.dueDate}\nStatus: Draft · ${billText('oculto no portal do cliente','hidden from the client portal')}`;
    if(draft.notes)text+=`\n${billText('Notas','Notes')}: ${draft.notes}`;
    if(source&&source.status!=='Approved')text+='\n'+billText('O orçamento de origem ainda não foi aprovado; esta ação não o aprova nem emite a invoice.','The source estimate is not approved; this action does not approve it or issue the invoice.');
    text+='\n\n'+billText('Salvar este rascunho somente neste navegador? Não haverá envio, cobrança ou pagamento.','Save this draft only in this browser? This does not send an invoice, charge or record a payment.');
    say(text,[button(pt?'Salvar rascunho':'Save draft',`invoice-confirm:${billing.preview.token}`),button(pt?'Cancelar':'Cancel','invoice-cancel')]);
  }
  function applyInvoicePatch(patch){
    billing.preview=null;billing.mode='fields';const draft=copy(billing.draft),lineKeys=['description','qty','unitPrice','total'];
    if(lineKeys.some(key=>Object.hasOwn(patch,key))){
      let index=patch.itemIndex;
      if(index===undefined&&draft.items.length===1)index=0;
      if(index===undefined){billing.mode='choose-item';billing.patch=patch;billing.options=draft.items.map((item,i)=>({itemIndex:i,label:`${i+1}. ${item.description}`}));say(billText('Qual item da invoice você quer alterar? O total não será substituído automaticamente.','Which invoice line should change? I will not replace the total automatically.'),billing.options.map(o=>button(o.label,`invoice-item:${o.itemIndex}`)));return;}
      if(!Number.isInteger(index)||index<0||index>=draft.items.length){say(billText('Esse item não existe. Informe o número de uma linha da invoice.','That item does not exist. Give the number of an invoice line.'));return;}
      if(Object.hasOwn(patch,'total')){
        if(draft.items.length!==1){say(billText('Para preservar as outras linhas, informe o preço unitário do item escolhido. Não vou transformar um total em preço sem essa informação.','To preserve the other lines, give the selected line’s unit price. I will not infer it from a total.'));return;}
        Object.assign(draft.items[index],{qty:1,unit:'Project',unitPrice:patch.total});
      }
      for(const key of ['description','qty','unitPrice'])if(Object.hasOwn(patch,key))draft.items[index][key]=patch[key];
    }
    if(Object.hasOwn(patch,'dueDate'))draft.dueDate=patch.dueDate;
    if(Object.hasOwn(patch,'notes'))draft.notes=patch.notes;
    billing.draft=draft;billing.patch={};previewInvoice();
  }
  function sourceInvoiceDraft(source,s){
    billing.sourceId=source?.id||null;const job=billing.job;
    billing.draft={projectId:projectId(job),appointmentId:appointmentId(job),estimateId:source?.id||null,customer:source?(source.company==='Direct Homeowner'?source.customer:source.company||source.customer):job.company&&job.company!=='Direct Homeowner'?job.company:job.customer,projectCustomer:job.customer,company:source?.company||job.company||'Direct Homeowner',customerType:source?.customerType||(job.company&&job.company!=='Direct Homeowner'?'contractor':'direct'),address:job.address,status:'Draft',customerVisible:false,issued:gaToday(),dueDate:'',paymentRule:'To review before issuing',notes:'',items:source?copy(source.items):[{description:job.service||'',qty:null,unit:'Project',unitPrice:null}],taxRate:Number(source?.taxRate||0),discount:Number(source?.discount||0)};
    const patch=billing.patch;billing.patch={};if(Object.keys(patch).length)applyInvoicePatch(patch);else needInvoiceField();
  }
  function selectInvoiceDocument(invoice){
    const s=billingData();if(invoice.status!=='Draft'||s.payments.some(p=>p.invoiceId===invoice.id)){
      resetBilling();say(billText('Essa invoice já foi emitida ou tem pagamentos. Não vou alterar seus valores pelo chat. Abra Billing para revisar os registros e o procedimento correto.','That invoice is issued or has payments. I will not change its amounts in chat. Open Billing to review its records and the appropriate correction.'),[button('Open Billing','open-billing')]);return;}
    if(invoice.projectId!==projectId(billing.job)||invoice.appointmentId&&invoice.appointmentId!==appointmentId(billing.job)){resetBilling();say(billText('O vínculo entre invoice, projeto e appointment não confere. Nada foi alterado.','The invoice, project and appointment links disagree. Nothing was changed.'));return;}
    billing.invoiceId=invoice.id;billing.sourceId=invoice.estimateId||null;billing.draft=copy(invoice);billing.mode='fields';
    billing.last={projectId:invoice.projectId,appointmentId:appointmentId(billing.job),invoiceId:invoice.id,turn:chat.turn};
    const patch=billing.patch;billing.patch={};if(Object.keys(patch).length)applyInvoicePatch(patch);else needInvoiceField();
  }
  function selectBillingJob(job){
    billing.job=job;const s=billingData(),invoices=s.invoices.filter(i=>i.projectId===projectId(job)&&(!i.appointmentId||i.appointmentId===appointmentId(job)));
    if(billing.intent==='edit'){
      const explicit=billing.invoiceId?invoices.filter(i=>i.id===billing.invoiceId):invoices;
      if(!explicit.length){resetBilling();say(billText('Não encontrei uma invoice desse projeto e appointment. Posso preparar uma nova; diga “cria uma invoice” e o projeto.','I could not find an invoice for that project and appointment. To prepare one, say “create an invoice” and the project.'));return;}
      if(explicit.length===1){selectInvoiceDocument(explicit[0]);return;}
      billing.mode='choose-invoice';billing.options=explicit;say(billText('Qual invoice desse projeto?','Which invoice in this project?'),explicit.map((i,n)=>button(`${n+1}. ${i.number} · ${i.status}`,`invoice-document:${encodeURIComponent(i.id)}`)));return;
    }
    if(invoices.length){billing.intent='edit';billing.mode='choose-invoice';billing.options=invoices;say(billText('Esse projeto já tem invoice. Para evitar duplicação, escolha o rascunho que quer editar; invoices emitidas ou pagas serão preservadas.','This project already has an invoice. To avoid a duplicate, choose the draft to edit; issued or paid invoices will be preserved.'),invoices.map((i,n)=>button(`${n+1}. ${i.number} · ${i.status}`,`invoice-document:${encodeURIComponent(i.id)}`)));return;}
    const sources=s.estimates.filter(e=>e.projectId===projectId(job));
    if(sources.length>1){billing.mode='choose-source';billing.options=sources;say(billText('Qual orçamento será a base do rascunho?','Which estimate should be the source of the draft?'),sources.map((e,n)=>button(`${n+1}. ${e.number} · ${e.status}`,`invoice-source:${encodeURIComponent(e.id)}`)));return;}
    sourceInvoiceDraft(sources[0]||null,s);
  }
  function chooseBillingJobs(text){
    const candidates=matches(text);
    offerBillingJobs(candidates);
  }
  function offerBillingJobs(candidates){
    if(!candidates.length){billing.mode='await-project';say(billText('Para qual cliente e projeto? Diga o nome, endereço ou project/appointment ID. Vou preparar só um rascunho local.','Which customer and project? Give a name, address or project/appointment ID. I will prepare a local draft only.'),[button(billText('Ver Jobs','View Jobs'),'open-jobs'),button(billText('Cancelar','Cancel'),'invoice-cancel')]);return;}
    if(candidates.length===1){selectBillingJob(candidates[0]);return;}
    billing.mode='choose-project';billing.options=candidates;say(billText('Encontrei mais de um projeto ou appointment. Qual deles é para esta invoice?','I found more than one project or appointment. Which one is for this invoice?'),candidates.map((j,n)=>button(`${n+1}. ${jobLabel(j)}`,`invoice-job:${encodeURIComponent(projectId(j))}:${encodeURIComponent(appointmentId(j))}`)));
  }
  function confirmInvoice(){
    if(billing.mode!=='confirm'||!billing.preview)return;
    if(!canEdit()){resetBilling();say(billText('Somente um perfil Office da demonstração pode salvar esse rascunho.','Only an Office demo profile can save this draft.'));return;}
    try{
      const s=billingData(),job=billing.job,found=(window.GTFJobs?.()||[]).filter(j=>projectId(j)===projectId(job)&&appointmentId(j)===appointmentId(job));
      if(found.length!==1||billingSnapshot(s,found[0])!==billing.preview.signature||draftError(billing.preview.draft)){
        resetBilling();say(billText('O projeto, orçamento ou invoice mudou desde a prévia. Peça uma nova prévia; nada foi salvo.','The project, estimate or invoice changed since the preview. Request a new preview; nothing was saved.'));return;
      }
      const draft=copy(billing.preview.draft),actor=window.GTFAuth.currentUser().name||'Office';let saved;
      if(billing.invoiceId){const current=s.invoices.find(i=>i.id===billing.invoiceId);saved=window.GTFWorkflow.updateInvoiceDraft(billing.invoiceId,{items:draft.items,taxRate:draft.taxRate,discount:draft.discount,dueDate:draft.dueDate,notes:draft.notes||'',paymentRule:draft.paymentRule,actor},window.GTFWorkflow.invoiceDraftSignature?{expectedSignature:window.GTFWorkflow.invoiceDraftSignature(current)}:{});}
      else saved=window.GTFWorkflow.createInvoiceDraft({...draft,actor});
      if(!saved||saved.status!=='Draft'||saved.customerVisible!==false||saved.projectId!==projectId(job))throw new Error('unverified_draft');
      const last={projectId:saved.projectId,appointmentId:appointmentId(job),invoiceId:saved.id,turn:chat.turn};resetBilling();billing.last=last;chat.topic='invoice';
      say(billText(`Rascunho ${saved.number} salvo neste navegador para ${job.customer}.`,`Draft ${saved.number} saved in this browser for ${job.customer}.`)+`\nProject: ${saved.projectId} · Appointment: ${appointmentId(job)}\n`+billText('Status Draft; oculto no portal do cliente. Nada foi enviado, emitido, cobrado ou pago. Você pode pedir “altera essa invoice” e dizer o campo.','Status Draft; hidden from the client portal. Nothing was sent, issued, charged or paid. You can ask “edit this invoice” and specify the field.'),[button(billText('Abrir Billing','Open Billing'),'open-billing')]);
      if(typeof window.renderAll==='function')window.renderAll();
    }catch(_){billing.preview=null;billing.mode='fields';say(billText('Não consegui confirmar a gravação do rascunho. Nenhum envio ou pagamento foi feito. Confira Billing e peça uma nova prévia antes de tentar novamente.','I could not confirm the draft was saved. Nothing was sent or paid. Check Billing and request a fresh preview before trying again.'),[button('Open Billing','open-billing')]);}
  }
  function invoiceConversation(text,n){
    const noun=invoiceWord(n)||/\binv[ -]\d/.test(n),editing=editWords(n),creating=createWords(n),reference=refWords(n),pending=billing.mode!=='idle';
    if(pending&&!noun&&editing&&/\b(job|appointment|agendamento|horario|reagendar|reagenda|remarcar|reschedule)\b/.test(n))return false;
    if(pending&&/^(?:sim|yes|confirm|confirmar|ok|pode|pode salvar|salva|salvar|save|save draft|salvar rascunho|pode sim|manda ver|bora|fechou)$/.test(n)){
      if(billing.mode==='confirm')confirmInvoice();else needInvoiceField();return true;
    }
    if(pending&&/^(?:nao|no|cancel|cancelar|cancela|deixa pra la|esquece)$/.test(n)){resetBilling();say(billText('Cancelei a preparação da invoice. Nada foi salvo.','Invoice preparation canceled. Nothing was saved.'));return true;}
    if((noun||pending||reference&&billing.last)&&/\b(paga\w*|paid|dar baixa|marca\w* pago|charge|delete|apaga\w*|exclu\w*)\b/.test(n)){
      chatReply(billText('Não registrei pagamento, cobrança ou exclusão. Este fluxo só prepara rascunhos; pagamentos reais precisam do provedor e da confirmação do servidor.','No payment, charge or deletion was recorded. This flow prepares drafts only; real payments need the provider and server confirmation.'),[button('Open Billing','open-billing')]);return true;
    }
    if(/\b(enviar|envie|envia|mande|mandar|send)\b/.test(n))return false;
    if(!noun&&/\b(orcamento|estimate|quote)\b/.test(n)&&creating&&!/^como\b|^how\b/.test(n)){
      chatReply(billText('Orçamento é Estimate; invoice é a fatura. Posso preparar uma invoice pelo chat ou abrir o editor de Estimate para montar o orçamento. Qual deles você quer?','An estimate is a quote; an invoice is billing. I can prepare an invoice in chat or open the Estimate editor. Which document do you want?'),[button(billText('Abrir Estimates & Billing','Open Estimates & Billing'),'open-billing')]);return true;
    }
    const fieldInput=pending?invoiceFields(text,billing.waiting):{patch:{},error:null};
    if(pending&&fieldInput.error){billing.preview=null;billing.mode='fields';say(fieldInput.error+' '+billText('Nada foi salvo.','Nothing was saved.'));return true;}
    if(pending&&['choose-project','await-project','choose-source','choose-invoice','choose-item'].includes(billing.mode)){
      if(/^\d+$/.test(n)){
        const option=billing.options[Number(n)-1];if(option){if(billing.mode==='choose-project')selectBillingJob(option);else if(billing.mode==='choose-source')sourceInvoiceDraft(option,billingData());else if(billing.mode==='choose-invoice')selectInvoiceDocument(option);else if(billing.mode==='choose-item')applyInvoicePatch({...billing.patch,itemIndex:option.itemIndex});return true;}
      }
      if(['choose-project','await-project'].includes(billing.mode)&&!noun&&!editing&&!creating&&(matches(text).length||/\b(project|appointment|cliente|client)\b/.test(n))){chooseBillingJobs(text);return true;}
    }
    if(pending&&['fields','confirm'].includes(billing.mode)&&Object.keys(fieldInput.patch).length){
      if(fieldInput.error){billing.preview=null;billing.mode='fields';say(fieldInput.error+' '+billText('Nada foi salvo.','Nothing was saved.'));return true;}
      applyInvoicePatch(fieldInput.patch);return true;
    }
    if(noun&&/^(?:como|how)\b/.test(n)){
      chatReply(billText('Diga “cria uma invoice para Emily” para começar. Vou confirmar projeto, valores e vencimento, mostrar a prévia e pedir aprovação para salvar um Draft local. Para editar, diga a invoice e o campo; documentos emitidos ou pagos ficam preservados.','Say “create an invoice for Emily” to start. I will confirm the project, amounts and due date, show a preview and ask before saving a local Draft. To edit, name the invoice and field; issued or paid invoices are preserved.'),[button('Open Billing','open-billing')]);return true;
    }
    const newRequest=noun&&(creating||editing)||editing&&reference;
    if(!newRequest){
      if(noun){chatReply(billText('Você quer criar uma invoice ou editar um rascunho? Diga também o cliente/projeto; para editar, informe o campo e o novo valor.','Would you like to create an invoice or edit a draft? Include the customer/project; to edit, specify the field and new value.'),[button('Open Billing','open-billing')]);return true;}
      if(pending&&editing){chatReply(billText('Qual campo da invoice quer alterar? Pode dizer “item 1 preço 4.50” ou “vencimento amanhã”.','Which invoice field should change? Say “item 1 price 4.50” or “due tomorrow”.'));return true;}
      return false;
    }
    if(!canEdit()){say(billText('Somente um perfil Office da demonstração pode preparar invoices.','Only an Office demo profile can prepare invoices.'));return true;}
    if(state.mode!=='idle'&&state.mode!=='after'){
      chatReply(billText('Há um reagendamento pendente. Confirme ou cancele essa prévia antes de preparar outra alteração.','A reschedule is pending. Confirm or cancel that preview before preparing another change.'));return true;
    }
    if(pending&&editing&&reference){
      if(fieldInput.error){billing.preview=null;billing.mode='fields';say(fieldInput.error);return true;}
      if(Object.keys(fieldInput.patch).length)applyInvoicePatch(fieldInput.patch);else{billing.mode='fields';billing.preview=null;billing.waiting=null;needInvoiceField();}return true;
    }
    if(pending){chatReply(billText('Uma invoice já está em preparação. Continue esse rascunho ou cancele antes de escolher outro projeto.','An invoice is already being prepared. Continue this draft or cancel before choosing another project.'));return true;}
    const parsed=invoiceFields(text,null);if(parsed.error){say(parsed.error);return true;}
    const last=billing.last,lastValid=last&&chat.topic==='invoice'&&chat.turn-last.turn<=8;
    if(editing&&reference&&!lastValid){say(billText('O que você quer alterar: invoice, agendamento ou outro registro? Diga o projeto e o campo para eu não adivinhar.','What should change: an invoice, appointment or another record? Give the project and field so I do not guess.'));return true;}
    try{
      const s=billingData();resetBilling();billing.last=null;billing.intent=editing?'edit':'create';billing.patch=parsed.patch;chat.topic='invoice';
      if(editing&&reference&&lastValid){billing.invoiceId=last.invoiceId;const jobs=(window.GTFJobs?.()||[]).filter(j=>projectId(j)===last.projectId&&appointmentId(j)===last.appointmentId);if(jobs.length===1)selectBillingJob(jobs[0]);else chooseBillingJobs('');}
      else {
        const mentions=value=>value&&(' '+n+' ').includes(' '+clean(value)+' '),explicit=s.invoices.filter(i=>mentions(i.id)||mentions(i.number));
        if(editing&&explicit.length===1){billing.invoiceId=explicit[0].id;offerBillingJobs((window.GTFJobs?.()||[]).filter(j=>projectId(j)===explicit[0].projectId&&(!explicit[0].appointmentId||appointmentId(j)===explicit[0].appointmentId)));}
        else if(editing&&explicit.length>1){resetBilling();say(billText('Você citou mais de uma invoice. Informe só o número ou ID do documento que quer editar.','You mentioned more than one invoice. Give only the number or ID of the document to edit.'));}
        else chooseBillingJobs(text);
      }
    }catch(_){resetBilling();say(billText('As ferramentas de rascunho de invoice não estão disponíveis nesta página. Abra Estimates & Billing para revisar os documentos; nenhuma alteração foi feita.','Invoice draft tools are not available on this page. Open Estimates & Billing to review documents; nothing was changed.'),[button('Open Billing','open-billing')]);}
    return true;
  }
  function priorities(){const result=[];const compliance=window.GTFCompliance?.issues?.()||[];
    compliance.forEach(r=>{const st=GTFCompliance.derivedStatus(r);result.push({level:st==='Expired'||st==='Missing'?'red':'yellow',label:r.documentType,detail:`${r.entity} · ${st}`,href:'compliance.html'});});
    (window.GTFJobs?.()||[]).forEach(j=>{if(j.status==='Problem')result.push({level:'red',label:`Problem · ${j.customer}`,detail:j.service,jobId:j.id});else if(j.status==='Waiting for Material')result.push({level:'yellow',label:`Materials · ${j.customer}`,detail:j.service,jobId:j.id});else if(['Completed','Arrived'].includes(j.status))result.push({level:'green',label:`${j.status} · ${j.customer}`,detail:j.service,jobId:j.id});});
    const sms=window.GTFIntegrations?.notifications?.()||[];
    sms.filter(n=>n.type==='crew-problem'&&!n.read).forEach(n=>result.push({level:'red',label:n.title,detail:n.body||'',href:'index.html'}));
    return result;
  }
  function refresh(){if(!el('assistantStatusbar'))return;const ps=priorities();const red=ps.filter(p=>p.level==='red').length,yellow=ps.filter(p=>p.level==='yellow').length;const green=Math.max(0,(window.GTFJobs?.()||[]).filter(j=>['Completed','Arrived'].includes(j.status)).length);el('assistantStatusbar').innerHTML=`<button type="button" class="priority-pill is-red" data-priority="red"><i></i><b>${red}</b> Needs attention</button><button type="button" class="priority-pill is-yellow" data-priority="yellow"><i></i><b>${yellow}</b> Upcoming / review</button><button type="button" class="priority-pill is-green" data-priority="green"><i></i><b>${green}</b> Done / arrived</button>`;maybeAlert(ps);}
  function maybeAlert(ps){const critical=ps.filter(p=>p.level==='red');const last=JSON.stringify(critical.map(x=>x.label));if(!critical.length||sessionStorage.getItem('gtfAssistantAlertsSeen')===last)return;sessionStorage.setItem('gtfAssistantAlertsSeen',last);const box=el('assistantConversation');if(!box||box.dataset.importantShown)return;box.dataset.importantShown='yes';say(`Heads up: ${critical.length} priority item(s) need attention. You can review them here without leaving your dashboard.`,[button('Review priorities','show-priorities')]);}
  function priorityClick(level){const ps=priorities().filter(p=>!level||p.level===level).slice(0,15);if(!ps.length){say('No matching priority items at the moment.');return;}say(ps.map((p,i)=>`${i+1}. ${p.label} — ${p.detail}`).join('\n'),[button('Open Compliance','open-compliance'),button('View Jobs','open-jobs')]);}
  function distance(a,b){const rows=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));for(let i=0;i<=a.length;i++)rows[i][0]=i;for(let j=0;j<=b.length;j++)rows[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])rows[i][j]=Math.min(rows[i][j],rows[i-2][j-2]+1);}return rows[a.length][b.length];}
  function scoreJob(text,job){const query=clean(text),full=clean(job.customer),tokens=full.split(' ');let score=0;
    const includes=value=>(' '+query+' ').includes(' '+value+' ');
    if(includes(clean(appointmentId(job))))return 1000;
    if(includes(clean(projectId(job))))return 500;
    if(includes(full))score=100;
    else {for(const t of tokens){if(t.length>=3&&query.split(' ').includes(t))score+=40;else if(t.length>=4&&query.split(' ').some(q=>q.length>=4&&distance(q,t)<=1))score+=19;}}
    const city=clean(job.address).split(' ').filter(t=>t.length>3).slice(0,8);if(city.some(c=>query.split(' ').includes(c)))score+=25;
    return score;
  }
  function matches(text){const all=window.GTFJobs?.()||[];const scored=all.map(job=>({job,score:scoreJob(text,job)})).filter(x=>x.score>=19).sort((a,b)=>b.score-a.score);if(!scored.length)return [];
    const max=scored[0].score;return scored.filter(x=>x.score>=Math.max(19,max-15)).map(x=>x.job);
  }
  function appointment(text){const raw=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''),n=clean(raw),today=gaToday();let date=null;let time=null,error=null;
    if(/\b(amanha|tomorrow)\b/.test(n))date=plusDays(today,1);
    else if(/\b(hoje|today)\b/.test(n))date=today;
    const weekdays=[['domingo','sunday','sun'],['segunda','monday','mon'],['terca','tuesday','tue'],['quarta','wednesday','wed'],['quinta','thursday','thu'],['sexta','friday','fri'],['sabado','saturday','sat']];
    if(!date){const day=weekdays.findIndex(names=>names.some(name=>new RegExp(`\\b${name}\\b`).test(n)));if(day>=0){const current=new Date(today+'T12:00:00Z').getUTCDay();date=plusDays(today,(day-current+7)%7||7);}}
    const iso=raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    const br=raw.match(/\b(\d{1,2})[\/\.](\d{1,2})(?:[\/\.](20\d{2}))?\b/);
    if(iso)date=`${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
    else if(br){const first=Number(br[1]),second=Number(br[2]),pt=/\b(alterar?|horario|amanha|hoje|as|pra|reagendar?|sexta|segunda|terca|quarta|quinta|sabado|domingo)\b/.test(n),en=/\b(change|move|reschedule|at|tomorrow|today|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/.test(n);let month,day;if(first>12||pt){day=first;month=second;}else if(second>12||en||first===second){month=first;day=second;}else error='Please clarify the date using YYYY-MM-DD (for example, 2026-10-15).';if(!error)date=`${br[3]||today.slice(0,4)}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
    // 24h clock or am/pm. 2 pm, 14:30, 2h30, às 14.
    const clock=raw.match(/\b(\d{1,2})(?::|h)(\d{2})\s*(am|pm)?\b/i) || raw.match(/\b(\d{1,2})\s*(am|pm)\b/i) || raw.match(/\b(\d{1,2})h\b/i);
    if(clock){let h=Number(clock[1]),mins=/^\d{2}$/.test(clock[2]||'')?Number(clock[2]):0;const mer=clock[3]||(/^(am|pm)$/i.test(clock[2]||'')?clock[2]:'');if(h>23||mins>59||(mer&&(h<1||h>12)))error='Please provide a valid time, such as 14:30 or 2:30 PM.';else{if(mer){if(h===12)h=0;if(mer.toLowerCase()==='pm')h+=12;}time={h,mins};}}
    // permit hour-only 'às 14' / 'at 2' but avoid treating job IDs as times.
    if(!time&&!clock){const b=raw.match(/\b(?:as|at|para|for)\s*(\d{1,2})(?![\d/:h.-])\b/i);if(b){const h=Number(b[1]);if(h>23)error='Please provide a valid hour between 00 and 23.';else if(h>=1&&h<=12)error='Please specify AM or PM, or use a 24-hour time such as 14:00.';else time={h,mins:0};}else if(/\b\d{1,2}[:h]\d+\b/i.test(raw))error='Please provide minutes with two digits, such as 14:03.';}
    if(date){const d=new Date(date+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date){date=null;error='That date does not exist. Please use a valid date in YYYY-MM-DD format.';}}
    return {date,time,...(error?{error}:{})};
  }
  function clockTime({h,mins}){const period=h>=12?'PM':'AM',h12=h%12||12;return `${h12}:${String(mins).padStart(2,'0')} ${period}`;}
  function windowTime(start,duration=60){const minutes=start.h*60+start.mins+duration;return `${clockTime(start)}–${clockTime({h:Math.floor(minutes/60)%24,mins:minutes%60})}`;}
  function scheduleWindow(value){const times=[...String(value||'').matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)?/ig)];if(times.length!==2)return null;const [first,last]=times;let a=(first[3]||last[3]||'').toUpperCase(),b=(last[3]||first[3]||'').toUpperCase();if(!a||!b)return null;if(!first[3]&&b==='PM'&&Number(first[1])!==12&&Number(first[1])>Number(last[1])%12)a='AM';const minute=(t,suffix)=>{const h=Number(t[1]),m=Number(t[2]);return h>=1&&h<=12&&m<=59?(h%12+(suffix==='PM'?12:0))*60+m:null;};const start=minute(first,a),end=minute(last,b);if(start===null||end===null)return null;const duration=(end-start+1440)%1440;if(!duration)return null;return {time:{h:Math.floor(start/60),mins:start%60},duration};}
  function calendarDate(value){if(value==='Today')return gaToday();if(value==='Tomorrow')return plusDays(gaToday(),1);if(/^20\d{2}-\d{2}-\d{2}$/.test(String(value||'')))return value;return null;}
  function localTimeCandidates(date,time){const [y,m,d]=date.split('-').map(Number),utc=Date.UTC(y,m-1,d,time.h,time.mins);const formatter=new Intl.DateTimeFormat('en-US',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});return [4,5].map(offset=>utc+offset*3600000).filter(value=>{const p=formatter.formatToParts(new Date(value));const get=type=>Number(p.find(x=>x.type===type).value);return get('year')===y&&get('month')===m&&get('day')===d&&get('hour')===time.h&&get('minute')===time.mins;});}
  function localTimeError(date,time,duration=0){const start=localTimeCandidates(date,time);if(!start.length)return 'That local time does not exist in Georgia because of daylight saving time. Please choose another time.';if(start.length===2)return 'That local time occurs twice in Georgia during the daylight saving transition. Please choose an unambiguous time.';if(duration){const endMinutes=time.h*60+time.mins+duration,endDate=plusDays(date,Math.floor(endMinutes/1440)),end=localTimeCandidates(endDate,{h:Math.floor(endMinutes/60)%24,mins:endMinutes%60});if(end.length!==1||end[0]-start[0]!==duration*60000)return 'This appointment overlaps a daylight saving transition. Please choose a time outside the transition or review its exact duration in Jobs.';}return null;}
  function crewMembers(job){return clean(job.crew).split(/\s+(?:team|to assign)\s*/).join(' ').split(' ').filter(x=>x&&!['team','to','assign'].includes(x));}
  function conflicts(original,date,time,duration){const crew=crewMembers(original);if(!crew.length)return [];const start=Date.parse(date+'T00:00:00Z')+((time.h*60+time.mins)*60000),end=start+duration*60000;return (window.GTFJobs?.()||[]).filter(j=>{if(sameAppointment(j,original)||['Completed','Cancelled','Canceled'].includes(j.status)||!crewMembers(j).some(c=>crew.includes(c)))return false;const date=calendarDate(j.date),range=scheduleWindow(j.window);if(!date||!range)return false;const other=Date.parse(date+'T00:00:00Z')+(range.time.h*60+range.time.mins)*60000;return start<other+range.duration*60000&&end>other;});}
  function startReschedule(original,request){state.job=original;state.request=request;state.preview=null;
    if(request.error||(!request.date&&!request.time)){say(request.error||'What new date or time should I use? For example: “tomorrow at 2 PM” or “2026-10-15 at 14:30”.');state.mode='missing-date';return;}
    const nextDate=request.date||calendarDate(original.date),range=scheduleWindow(original.window);
    if(!nextDate){state.mode='missing-date';say('Please specify the exact appointment date using YYYY-MM-DD. The current job has only a weekday label.');return;}
    if(!range){state.mode='missing-date';say('The current appointment needs an exact start and end time before it can be rescheduled. Please review it in Jobs.');return;}
    const time=request.time||range.time,error=localTimeError(nextDate,time,range.duration);
    if(error){state.mode='missing-date';say(error);return;}
    const overlaps=conflicts(original,nextDate,time,range.duration);
    if(overlaps.length){state.mode='missing-date';say(`The assigned crew has a local schedule conflict:\n${overlaps.map(jobLabel).join('\n')}\nPlease choose another date or time. Nothing has been saved.`);return;}
    state.mode='confirm';const nextWindow=request.time?windowTime(time,range.duration):original.window;
    state.preview={date:nextDate,window:nextWindow,signature:JSON.stringify(original),token:++state.sequence,projectId:projectId(original),appointmentId:appointmentId(original)};
    say(`I found ${original.customer} in ${original.address}.\nProject: ${projectId(original)} · Appointment: ${appointmentId(original)}\nService: ${original.service}\nCurrent: ${shortDate(original)}\nProposed: ${nextDate} · ${nextWindow}\nTimezone: ${TIMEZONE}. Existing appointment duration is preserved.\nNo conflict was found in this browser; external crew availability is not connected.\n\nShould I save this change locally and create setup-required Google Calendar and crew SMS reminders?`,[button('Confirm change',`confirm:${state.preview.token}`),button('Cancel','cancel')]);
  }
  function selectJob(job){const req=state.request;state.job=job;state.mode='idle';startReschedule(job,req);}
  function suggestMatches(text,request){const arr=matches(text);state.request=request;if(!arr.length){state.mode='await-name';say('I could not identify the client confidently. What is their name or city? You can also open the full Jobs list.',[button('Open Jobs','open-jobs')]);return;}
    if(arr.length===1){selectJob(arr[0]);return;}
    state.mode='choose';state.options=arr;
    say('I found more than one possible job or appointment. Which customer, property and service do you mean?',arr.map((j,i)=>button(`${i+1}. ${jobLabel(j)}`,`choose:${encodeURIComponent(projectId(j))}:${encodeURIComponent(appointmentId(j))}`)));
  }
  function confirm(){const preview=state.preview;if(state.mode!=='confirm'||!preview)return;if(!canEdit()){say('Only an Office demo profile can confirm schedule changes.');return;}const all=window.GTFJobs?.()||[],found=all.filter(j=>projectId(j)===preview.projectId&&appointmentId(j)===preview.appointmentId),job=found[0];if(found.length!==1||JSON.stringify(job)!==preview.signature){state.mode='idle';state.preview=null;say('This appointment changed since the preview, or its identifiers are not unique. Please request a fresh preview. Nothing was saved.');return;}
    const range=scheduleWindow(preview.window);if(conflicts(job,preview.date,range.time,range.duration).length){state.mode='missing-date';state.preview=null;say('The crew schedule changed after this preview and now conflicts with the proposed appointment. Please choose another time. Nothing was saved.');return;}
    const before=JSON.parse(JSON.stringify(job));Object.assign(job,{projectId:preview.projectId,appointmentId:preview.appointmentId,date:preview.date,window:preview.window,updatedBy:window.GTFAuth.currentUser().name,updatedAt:new Date().toISOString()});
    try{if(typeof window.persist==='function')window.persist();else localStorage.setItem('gtfDemoJobs',JSON.stringify(all));}catch(error){Object.keys(job).forEach(key=>delete job[key]);Object.assign(job,before);say('The browser could not save the appointment. Nothing was changed; check browser storage and try again.');return;}
    const notes=[];
    if(window.GTFWorkflow){try{const s=window.GTFWorkflow.load(),projectOrders=(s.workOrders||[]).filter(w=>w.projectId===job.projectId),projectAppointments=all.filter(j=>projectId(j)===job.projectId),linked=projectOrders.filter(w=>w.appointmentId? w.appointmentId===job.appointmentId : job.workOrderId? w.id===job.workOrderId : projectAppointments.length===1&&projectOrders.length===1);linked.forEach(w=>{if(!window.GTFWorkflow.updateWorkOrder(w.id,{appointmentId:job.appointmentId,scheduledDate:job.date,arrival:job.window}))throw new Error('Work Order not found');});if(projectOrders.some(w=>!linked.includes(w)&&!w.appointmentId))notes.push('Unlinked Work Orders were left unchanged; select their appointment in Jobs before updating them.');}catch(error){notes.push('The appointment was saved, but the related Work Order could not be updated. Please review Jobs.');}}
    for(const [method,label] of [['queueCalendarSync','Google Calendar'],['queueCrewSMS','Crew SMS']]){try{const result=window.GTFIntegrations?.[method]?.(job);notes.push(result?.status==='failed'?`${label}: FAILED to save the local reminder; nothing was sent.`:result?`${label}: PENDING SETUP — local reminder only, not sent.`:`${label}: NOT CONNECTED — no reminder was saved.`);}catch(error){notes.push(`${label}: FAILED to save the local reminder; nothing was sent.`);}}
    if(typeof window.renderAll==='function')window.renderAll();state.mode='after';state.after=job;state.job=null;state.preview=null;
    say(`${job.customer}'s appointment was saved in this browser to ${job.date} at ${job.window}.\n${notes.join('\n')}\nWould you like me to prepare a message for the client?`,[button('Draft a message','draft'),button('Open Calendar draft','calendar-draft'),button('Not now','cancel')]);
  }
  function draftMessage(){const j=state.after||state.job;if(!j)return;say(`Here is a draft in English. Copy it and send it only after reviewing the details:\n\nHello ${j.customer.split(' ')[0]}, this is Georgia Top Floors. We wanted to confirm that your appointment for ${j.service} is now scheduled for ${j.date}, ${j.window}. Please let us know if you have any questions. Thank you!`,[button('Copy message','copy-draft'),button('Open job','open-job'),button('Ruach · connect Quo','settings:quo')]);}
  function eventDraft(){const j=state.after||state.job;if(!j)return;const url=calendarUrl(j);if(!url){say('A precise date and time are needed for a Google Calendar draft. The appointment is saved locally.');return;}window.open(url,'_blank','noopener,noreferrer');say('I opened a prefilled NEW event in Google Calendar. Review it there before saving. This does not edit an existing Google event and does not establish two-way sync.');}
  function calendarUrl(job){
    const d=calendarDate(job.date),range=scheduleWindow(job.window);if(!d||!range||localTimeError(d,range.time,range.duration))return null;
    const {h:hour,mins:minute}=range.time,startMin=hour*60+minute,endMin=startMin+range.duration;
    const compact=(date,h,m)=>date.replace(/-/g,'')+'T'+String(h).padStart(2,'0')+String(m).padStart(2,'0')+'00';
    const endDate=endMin>=1440?plusDays(d,1):d;
    const qp=new URLSearchParams({action:'TEMPLATE',text:`Georgia Top Floors · ${job.customer} · ${job.service}`,dates:`${compact(d,hour,minute)}/${compact(endDate,Math.floor(endMin/60)%24,endMin%60)}`,ctz:TIMEZONE,details:`GTF project ${projectId(job)} · appointment ${appointmentId(job)}. Manual NEW event draft, not a sync. Verify time before saving.`,location:job.address||''});
    return 'https://calendar.google.com/calendar/render?'+qp.toString();
  }
  function handleAction(a){
    if(a.startsWith('invoice-confirm:')){if(billing.mode==='confirm'&&Number(a.slice(16))===billing.preview?.token)confirmInvoice();return;}
    if(a==='invoice-cancel'){if(billing.mode!=='idle'){resetBilling();say(billText('Cancelei a preparação da invoice. Nada foi salvo.','Invoice preparation canceled. Nothing was saved.'));}return;}
    if(a==='open-billing'){location.href='documents.html';return;}
    if(a.startsWith('invoice-job:')&&billing.mode==='choose-project'){const [,project,appointment]=a.split(':');const selected=billing.options.find(j=>encodeURIComponent(projectId(j))===project&&encodeURIComponent(appointmentId(j))===appointment);if(selected)selectBillingJob(selected);return;}
    if(a.startsWith('invoice-source:')&&billing.mode==='choose-source'){const selected=billing.options.find(e=>encodeURIComponent(e.id)===a.slice(15));if(selected)sourceInvoiceDraft(selected,billingData());return;}
    if(a.startsWith('invoice-document:')&&billing.mode==='choose-invoice'){const selected=billing.options.find(i=>encodeURIComponent(i.id)===a.slice(17));if(selected)selectInvoiceDocument(selected);return;}
    if(a.startsWith('invoice-item:')&&billing.mode==='choose-item'){const index=Number(a.slice(13));if(billing.options.some(o=>o.itemIndex===index))applyInvoicePatch({...billing.patch,itemIndex:index});return;}
    if(a.startsWith('confirm:')){if(state.mode==='confirm'&&Number(a.slice(8))===state.preview?.token)confirm();return;}if(a==='cancel'){state.mode='idle';state.job=null;state.request=null;state.preview=null;state.options=[];say('Okay, no further changes.');return;}if(a.startsWith('choose:')){if(state.mode!=='choose')return;const [,project,appointment]=a.split(':');const selected=state.options.find(j=>encodeURIComponent(projectId(j))===project&&encodeURIComponent(appointmentId(j))===appointment);if(selected)selectJob(selected);return;}
    if(a==='chat-help'){faq('help');return;}
    if(a==='open-data-tools'){location.href='data-tools.html';return;}
    if(a==='open-budget'){location.href='docs/EMET_SERVICES_AND_BUDGET.md';return;}
    if(a.startsWith('settings-tab:')){const tab=a.slice(13);if(['profile','team','integrations','company','data'].includes(tab))location.href='settings.html?tab='+encodeURIComponent(tab);return;}
    if(a.startsWith('settings:')){const service=a.slice(9);if(['google','gmail','quo','signature','payments','ai'].includes(service))location.href='settings.html?integration='+encodeURIComponent(service);return;}
    if(a==='show-priorities'){priorityClick();return;}if(a==='open-compliance'){location.href='compliance.html';return;}if(a==='open-jobs'){window.goPage?.('jobs');return;}if(a==='draft'){draftMessage();return;}if(a==='calendar-draft'){eventDraft();return;}if(a==='copy-draft'){const last=messages.slice().reverse().find(m=>m.text.includes('Hello '));if(last)navigator.clipboard?.writeText(last.text.split('\n\n').slice(1).join('\n\n')).then(()=>say('Message copied. Please review it before sending.'),()=>say('Copy unavailable in this browser; select the message text manually.'));return;}if(a==='open-job'){const j=state.after||state.job;if(j){window.goPage?.('jobs');window.openDetail?.(j.id);}return;}}
  function process(raw){const input=String(raw||'');if(input.length>4096){chat.language=languageFor(clean(input.slice(0,256)));chatReply(chat.language==='pt'?'Esse texto é muito longo para este chat local. Resuma seu pedido em até 4.096 caracteres. Para planilhas CSV ou XLSX, use o Data workspace em vez de colar as linhas aqui. Nada foi alterado.':'That text is too long for this local chat. Summarize your request in 4,096 characters or fewer. For CSV or XLSX spreadsheets, use Data workspace instead of pasting rows here. Nothing was changed.',[button(chat.language==='pt'?'Abrir Data workspace':'Open Data workspace','open-data-tools')]);return;}const text=input.trim();if(!text)return;say(text,[],'user');const n=clean(text);chat.turn++;chat.language=languageFor(n);
    if(invoiceConversation(text,n))return;
    if(state.mode==='confirm'){if(/^(sim|yes|confirm|confirmar|ok|pode|pode salvar)$/.test(n)){confirm();return;}if(/^(nao|não|no|cancel|cancelar)$/.test(n)){handleAction('cancel');return;}}
    if(/^(nao|no|cancel|cancelar)$/.test(n)&&['choose','await-name','missing-date'].includes(state.mode)){handleAction('cancel');return;}
    if(conversation(text,n))return;
    if(/(altera|alterar|muda|mudar|troca|trocar|reagenda|reagendar|remarca|remarcar|resched|change|move|shift|adiar|antecipar|novo horario|new time)/.test(n)){if(billing.mode!=='idle'){chatReply(billText('Há uma invoice em preparação. Continue ou cancele esse rascunho antes de reagendar.','An invoice is being prepared. Continue or cancel that draft before rescheduling.'));return;}if(!canEdit()){say('Only an Office demo profile can reschedule appointments.');return;}chat.topic='schedule';billing.last=null;state.mode='idle';state.job=null;state.preview=null;state.after=null;suggestMatches(text,appointment(text));return;}
    if(state.mode==='choose'||state.mode==='await-name'){const a=appointment(text);state.request={...state.request,...(a.date?{date:a.date}:{}),...(a.time?{time:a.time}:{}),...(a.error?{error:a.error}:{})};if(state.mode==='choose'&&/^\d+$/.test(n)){const i=Number(n);if(i>=1&&i<=state.options.length){selectJob(state.options[i-1]);return;}}const candidates=matches(text);if(candidates.length===1){selectJob(candidates[0]);return;}if(candidates.length>1){state.options=candidates;state.mode='choose';say('Please choose a specific customer, property and appointment.',candidates.map((j,i)=>button(`${i+1}. ${jobLabel(j)}`,`choose:${encodeURIComponent(projectId(j))}:${encodeURIComponent(appointmentId(j))}`)));return;}say('I still need a more specific name, address or appointment ID.');return;}
    if(state.mode==='missing-date'||state.mode==='confirm'){const a=appointment(text);if(!a.date&&!a.time&&!a.error){say('Please include a date or time, for example “tomorrow at 2 PM”, or confirm/cancel the current preview.');return;}const request={...state.request,...(a.date?{date:a.date}:{}),...(a.time?{time:a.time}:{}),error:a.error||null};startReschedule(state.job,request);return;}
    if(/(atencao|attention|urgente|priority|prioridade|pendenc|overdue|atrasad)/.test(n)){priorityClick();return;}
    if(/(compliance|\bcoi\b|w 9|seguro|insurance)/.test(n)){say('I can take you to the Compliance Center or list the most urgent records.',[button('Open Compliance','open-compliance'),button('Show priorities','show-priorities')]);return;}
    if(/(mensagem|message|sms)/.test(n)&&state.after){draftMessage();return;}
    if(/\b(gmail|email|e-mail)\b/.test(n)){say('I can guide you through linking Gmail. Inbox access is optional and separate from Calendar. You will see the requested permissions before authorizing; I will not read your inbox or send a message from this demo.',[button('Ruach · Gmail permissions','settings:gmail')]);return;}
    if(/(mensagem|message|sms|contatar|contact|quo|enviar)/.test(n)){say('Would you like to connect Quo to contact customers? My step-by-step guide explains the account, number, permissions and secure setup. Nothing is sent until the service is connected and you approve the message.',[button('Ruach · Quo setup guide','settings:quo')]);return;}
    if(/(calendar|calendario|agenda)/.test(n)){say('Choose which business calendars to link and review their permissions in Settings. Calendar access never enables Gmail inbox access. Two-way sync will only be shown as connected after the secure service confirms it.',[button('Link calendars · Ruach guide','settings:google'),button('View Jobs','open-jobs')]);return;}
    if(/(cliente|client|customer|encontr|buscar|find|search|job|projeto)/.test(n)){const found=matches(text);if(found.length){say(found.slice(0,5).map(j=>`${j.customer} · ${j.address}\n${j.service} · ${shortDate(j)} · ${j.status}`).join('\n\n'),[button('Open Jobs','open-jobs')]);return;}say('I did not find a confident match. Try the customer name or the city, or open the Jobs directory.',[button('Open Jobs','open-jobs')]);return;}
    unknownReply();
  }
  function init(){if(!el('assistantForm'))return;greeting();refresh();el('assistantForm').addEventListener('submit',e=>{e.preventDefault();const input=el('assistantInput'),t=input.value;input.value='';process(t);});el('assistantInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();el('assistantForm').requestSubmit();}});el('assistantConversation').addEventListener('click',e=>{const btn=e.target.closest('[data-assistant-action]');if(btn)handleAction(btn.dataset.assistantAction);});el('assistantStatusbar').addEventListener('click',e=>{const btn=e.target.closest('[data-priority]');if(btn)priorityClick(btn.dataset.priority);});el('assistantSuggestions').addEventListener('click',e=>{const btn=e.target.closest('[data-query]');if(btn)process(btn.dataset.query);});window.addEventListener('gtf-profile-changed',greeting);window.addEventListener('gtf-compliance-changed',refresh);window.addEventListener('gtf-notifications-changed',refresh);window.addEventListener('gtf-jobs-changed',refresh);}
  window.GTFAssistant={refresh,process,appointment,matches,calendarUrl};document.addEventListener('DOMContentLoaded',init);
})();
