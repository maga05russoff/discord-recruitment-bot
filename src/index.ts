import "dotenv/config";
import {Client,GatewayIntentBits,Events,ChannelType,PermissionsBitField,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,EmbedBuilder,SlashCommandBuilder,REST,Routes} from "discord.js";
import {db} from "./db.js";
import {DEFAULT_QUESTIONS,type InterviewType} from "./questions.js";
if(!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is not set");
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.DirectMessages]});
type Cfg={candidate_role_id:string|null;staff_role_id:string|null;applications_channel_id:string|null;forms_channel_id:string|null;category_id:string|null};
const cfg=(g:string)=>db.prepare("SELECT candidate_role_id,staff_role_id,applications_channel_id,forms_channel_id,category_id FROM settings WHERE guild_id=?").get(g) as Cfg|undefined;
const isStaff=(i:any,c:Cfg|undefined)=>Boolean(i.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild))||Boolean(c?.staff_role_id&&i.member&&"roles" in i.member&&(i.member as any).roles.cache.has(c.staff_role_id));
const questions=(g:string,t:InterviewType)=>{const saved=db.prepare("SELECT position,text FROM questions WHERE guild_id=? AND type=? ORDER BY position").all(g,t) as {position:number;text:string}[];return saved.length?saved.map(x=>x.text):DEFAULT_QUESTIONS[t];};
const BRAND=0xB5122A;
const themed=(title:string,description?:string)=>new EmbedBuilder().setColor(BRAND).setTitle(title).setDescription(description).setFooter({text:"REDLINE • Система собеседований"}).setTimestamp();
const row=(...buttons:ButtonBuilder[])=>new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
const adminDashboard=(guildId:string,view="overview")=>{
 const counts=db.prepare("SELECT status,COUNT(*) n FROM applications WHERE guild_id=? GROUP BY status").all(guildId) as {status:string;n:number}[];
 const count=(status:string)=>counts.find(x=>x.status===status)?.n??0;
 const total=counts.reduce((n,x)=>n+x.n,0);
 const rows=db.prepare("SELECT id,user_id,type,status,interview_at,created_at,candidate_name,candidate_age,about,nickname,reviewed_by FROM applications WHERE guild_id=? AND status IN ('pending','scheduled','interview','accepted','rejected') ORDER BY id DESC LIMIT 10").all(guildId) as any[];
 const selected=rows.filter(x=>view==="pending"?x.status==="pending":view==="scheduled"?x.status==="scheduled":view==="interview"?x.status==="interview":true);
 const labels:Record<string,string>={pending:"🟡 Ожидают рассмотрения",scheduled:"🔵 Запланированы",interview:"🟣 На собеседовании",accepted:"🟢 Приняты",rejected:"🔴 Отклонены"};
 const description=view==="overview"
  ? "**ЦЕНТР УПРАВЛЕНИЯ ПЕРСОНАЛОМ**\nСводка по заявкам и кандидатам на сервере."
  : "**РАЗДЕЛ:** "+(view==="pending"?"ОЖИДАЮТ РАССМОТРЕНИЯ":view==="scheduled"?"ЗАПЛАНИРОВАНЫ":"НА СОБЕСЕДОВАНИИ");
 const embed=themed("🔴 REDLINE • АДМИНИСТРАТИВНАЯ ПАНЕЛЬ",description);
 if(view==="overview"){
  embed.addFields(
   {name:"📨 Всего заявок",value:String(total),inline:true},
   {name:"🟡 На рассмотрении",value:String(count("pending")),inline:true},
   {name:"🔵 Запланировано",value:String(count("scheduled")),inline:true},
   {name:"🎙️ Собеседование",value:String(count("interview")),inline:true},
   {name:"🟢 Принято",value:String(count("accepted")),inline:true},
   {name:"🔴 Отклонено",value:String(count("rejected")),inline:true}
  );
 } else {
  embed.addFields({name:"Найдено записей",value:String(selected.length),inline:true});
  if(selected.length) embed.addFields({name:"Последние заявки",value:selected.map(x=>`**#${x.id}** • <@${x.user_id}>\n**Должность:** ${x.type==="leader"?"Лидер":"Администратор"} • ${labels[x.status]??x.status}\n**Имя:** ${x.candidate_name??"—"} | **Возраст:** ${x.candidate_age??"—"}\n**Nickname:** ${x.nickname??"—"}\n**О себе:** ${(x.about??"—").slice(0,350)}\n**Время:** ${x.interview_at??"Не указано"}\n**Заявку рассмотрел:** ${x.reviewed_by?`<@${x.reviewed_by}>`:"Ещё не рассмотрена"}`).join("\n\n").slice(0,3900)});
  else embed.addFields({name:"Пока пусто",value:"В этом разделе пока нет заявок."});
 }
 embed.addFields({name:"Быстрые действия",value:"Используйте кнопки ниже для обновления сводки и просмотра очередей."});
 const controls=row(
  new ButtonBuilder().setCustomId("admin:overview").setLabel("⌂ Обзор").setStyle(view==="overview"?ButtonStyle.Primary:ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId("admin:pending").setLabel("◷ На рассмотрении").setStyle(view==="pending"?ButtonStyle.Primary:ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId("admin:scheduled").setLabel("▣ Запланированы").setStyle(view==="scheduled"?ButtonStyle.Primary:ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId("admin:interview").setLabel("● На интервью").setStyle(view==="interview"?ButtonStyle.Primary:ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId("admin:refresh").setLabel("↻ Обновить").setStyle(ButtonStyle.Success)
 );
 const deleteControl=row(new ButtonBuilder().setCustomId("admin:delete-open").setLabel("⌫ Удалить заявки по Discord ID").setStyle(ButtonStyle.Danger));
 return {embeds:[embed],components:[controls,deleteControl]};
};

client.once(Events.ClientReady,c=>console.log("Бот запущен: "+c.user.tag));
client.on(Events.InteractionCreate,async i=>{
 try{
  if(i.isChatInputCommand()){
   if(i.commandName==="setup"){
    if(!i.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)){await i.reply({content:"Нужно право «Управление сервером».",ephemeral:true});return;}
    const r=i.options.getRole("candidate_role",true),s=i.options.getRole("staff_role",true),a=i.options.getChannel("applications_channel",true),f=i.options.getChannel("forms_channel",true),cat=i.options.getChannel("category");
    db.prepare(`INSERT INTO settings(guild_id,candidate_role_id,staff_role_id,applications_channel_id,forms_channel_id,category_id) VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET candidate_role_id=excluded.candidate_role_id,staff_role_id=excluded.staff_role_id,applications_channel_id=excluded.applications_channel_id,forms_channel_id=excluded.forms_channel_id,category_id=excluded.category_id`).run(i.guildId,r.id,s.id,a.id,f.id,cat?.id??null);
    await i.reply({embeds:[themed("⚙️ НАСТРОЙКИ СОХРАНЕНЫ","Система собеседований успешно настроена. Теперь можно публиковать панель записи.")],ephemeral:true});return;
   }
   if(i.commandName==="admin"){
    if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Доступ только для администрации.",ephemeral:true});return;}
    await i.reply({...adminDashboard(i.guildId),ephemeral:true});return;
   }
   if(i.commandName==="notifications"){
    if(!i.guildId){await i.reply({content:"Команда доступна только на сервере.",ephemeral:true});return;}
    const state=i.options.getString("state",true);
    if(state==="on")db.prepare("INSERT OR IGNORE INTO notification_optins(guild_id,user_id) VALUES(?,?)").run(i.guildId,i.user.id);
    else db.prepare("DELETE FROM notification_optins WHERE guild_id=? AND user_id=?").run(i.guildId,i.user.id);
    await i.reply({content:state==="on"?"Вы подписались на личные объявления сервера. Отписаться можно командой /notifications state:Отключить.":"Вы отписались от личных объявлений сервера.",ephemeral:true});return;
   }
   if(i.commandName==="broadcast"){
    if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Создавать рассылки может только администрация.",ephemeral:true});return;}
    const message=i.options.getString("message",true).trim();
    if(!message){await i.reply({content:"Текст объявления не может быть пустым.",ephemeral:true});return;}
    const saved=db.prepare("INSERT INTO pending_broadcasts(guild_id,admin_id,message) VALUES(?,?,?)").run(i.guildId,i.user.id,message);
    await i.reply({embeds:[themed("Предпросмотр объявления",message).addFields({name:"Получатели",value:String((db.prepare("SELECT COUNT(*) n FROM notification_optins WHERE guild_id=?").get(i.guildId) as any).n)+" подписчиков"})],components:[row(new ButtonBuilder().setCustomId("broadcast:send:"+saved.lastInsertRowid).setLabel("Подтвердить отправку").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("broadcast:cancel:"+saved.lastInsertRowid).setLabel("Отменить").setStyle(ButtonStyle.Secondary))],ephemeral:true});return;
   }
   if(i.commandName==="panel"){
    if(!i.guildId||!i.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)){await i.reply({content:"Команда доступна администрации.",ephemeral:true});return;}
    const ch=i.channel;if(!ch?.isTextBased()||!("send" in ch)){await i.reply({content:"Нельзя опубликовать панель здесь.",ephemeral:true});return;}
    await ch.send({embeds:[themed("🔴 REDLINE ROLEPLAY","**СИСТЕМА НАБОРА ПЕРСОНАЛА**\n\nДобро пожаловать в центр собеседований проекта.\n\nВыберите должность, укажите удобные дату и время — администрация рассмотрит вашу заявку.\n\n*Пожалуйста, указывайте время внимательно.*")],components:[row(new ButtonBuilder().setCustomId("book").setLabel("✦ Записаться на собеседование").setStyle(ButtonStyle.Primary))]});
    await i.reply({content:"Панель опубликована.",ephemeral:true});return;
   }
   if(i.commandName==="applications"){
    if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Только для администрации.",ephemeral:true});return;}
    const open=i.options.getString("state",true)==="open";
    db.prepare("INSERT INTO settings(guild_id,applications_open) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET applications_open=excluded.applications_open").run(i.guildId,open?1:0);
    await i.reply({content:open?"Набор заявок открыт.":"Набор заявок закрыт.",ephemeral:true});return;
   }
   if(i.commandName==="history"){
    if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Только для администрации.",ephemeral:true});return;}
    const user=i.options.getUser("candidate",true);
    const list=db.prepare("SELECT id,type,score,total,result,created_at FROM interviews WHERE user_id=? ORDER BY id DESC LIMIT 10").all(user.id) as any[];
    await i.reply({content:list.length?list.map(x=>`#${x.id} · ${x.type==="leader"?"Лидер":"Администратор"} · ${x.score}/${x.total} · ${x.result} · ${x.created_at}`).join("\n"):"История собеседований отсутствует.",ephemeral:true});return;
   }
   if(i.commandName==="questions"){
    if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Только для администрации.",ephemeral:true});return;}
    const action=i.options.getSubcommand(),type=i.options.getString("type",true) as InterviewType;
    if(action==="list"){await i.reply({content:questions(i.guildId,type).map((q,n)=>`${n+1}. ${q}`).join("\n").slice(0,1900),ephemeral:true});return;}
    if(action==="add"){const q=i.options.getString("text",true);const pos=questions(i.guildId,type).length+1;db.prepare("INSERT INTO questions(guild_id,type,position,text) VALUES(?,?,?,?)").run(i.guildId,type,pos,q);await i.reply({content:"Вопрос добавлен. Для изменения набора используйте список вопросов.",ephemeral:true});return;}
    if(action==="delete"){const pos=i.options.getInteger("number",true);const all=questions(i.guildId,type);if(pos<1||pos>all.length){await i.reply({content:"Нет вопроса с таким номером.",ephemeral:true});return;}const next=all.filter((_,n)=>n!==pos-1);db.prepare("DELETE FROM questions WHERE guild_id=? AND type=?").run(i.guildId,type);next.forEach((q,n)=>db.prepare("INSERT INTO questions(guild_id,type,position,text) VALUES(?,?,?,?)").run(i.guildId,type,n+1,q));await i.reply({content:"Вопрос удалён.",ephemeral:true});return;}
   }
  }
  if(i.isButton()&&i.customId.startsWith("admin:")){
   if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Доступ только для администрации.",ephemeral:true});return;}
   const action=i.customId.split(":")[1];
   if(action==="delete-open"){
    const modal=new ModalBuilder().setCustomId("admin_delete_user").setTitle("Удаление заявок кандидата");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("user_id").setLabel("Discord ID кандидата").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(17).setMaxLength(20)));
    await i.showModal(modal);return;
   }
   if(action==="delete-confirm"){
    const userId=i.customId.split(":")[2];
    const apps=db.prepare("SELECT id FROM applications WHERE guild_id=? AND user_id=?").all(i.guildId,userId) as {id:number}[];
    if(!apps.length){await i.update({content:"Заявки уже отсутствуют.",embeds:[],components:[]});return;}
    const ids=apps.map(x=>x.id),marks=ids.map(()=>"?").join(",");
    const interviews=db.prepare("SELECT id FROM interviews WHERE application_id IN ("+marks+")").all(...ids) as {id:number}[];
    if(interviews.length){const im=interviews.map(()=>"?").join(",");db.prepare("DELETE FROM answers WHERE interview_id IN ("+im+")").run(...interviews.map(x=>x.id));db.prepare("DELETE FROM interviews WHERE id IN ("+im+")").run(...interviews.map(x=>x.id));}
    db.prepare("DELETE FROM candidate_forms WHERE application_id IN ("+marks+")").run(...ids);
    db.prepare("DELETE FROM applications WHERE id IN ("+marks+")").run(...ids);
    await i.update({content:"Удалено заявок: "+apps.length+". Связанные собеседования, ответы и анкеты также удалены.",embeds:[],components:[]});return;
   }
   const view=action==="refresh"?"overview":action;
   await i.update(adminDashboard(i.guildId,view));return;
  }
  if(i.isModalSubmit()&&i.customId==="admin_delete_user"){
   if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Доступ только для администрации.",ephemeral:true});return;}
   const userId=i.fields.getTextInputValue("user_id").trim();
   if(!/^\d{17,20}$/.test(userId)){await i.reply({content:"Укажите корректный Discord ID (17–20 цифр).",ephemeral:true});return;}
   const apps=db.prepare("SELECT id,type,status,created_at FROM applications WHERE guild_id=? AND user_id=? ORDER BY id DESC").all(i.guildId,userId) as any[];
   if(!apps.length){await i.reply({content:"Для этого пользователя заявки не найдены.",ephemeral:true});return;}
   await i.reply({content:"Найдено заявок: "+apps.length+" для <@"+userId+">. Будут также удалены связанные собеседования, ответы и анкеты. Это действие необратимо.",components:[row(new ButtonBuilder().setCustomId("admin:delete-confirm:"+userId).setLabel("Подтвердить удаление").setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId("admin:overview").setLabel("Отмена").setStyle(ButtonStyle.Secondary))],ephemeral:true});return;
  }
  if(i.isButton()&&i.customId.startsWith("broadcast:")){
   if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Доступ только для администрации.",ephemeral:true});return;}
   const [,action,idText]=i.customId.split(":"),id=Number(idText);
   const item=db.prepare("SELECT * FROM pending_broadcasts WHERE id=? AND guild_id=?").get(id,i.guildId) as any;
   if(!item||item.admin_id!==i.user.id){await i.reply({content:"Рассылка не найдена или создана другим администратором.",ephemeral:true});return;}
   if(action==="cancel"){db.prepare("DELETE FROM pending_broadcasts WHERE id=?").run(id);await i.update({content:"Рассылка отменена.",embeds:[],components:[]});return;}
   await i.update({content:"Рассылка запущена. Отправляю сообщения подписчикам…",embeds:[],components:[]});
   const targets=db.prepare("SELECT user_id FROM notification_optins WHERE guild_id=?").all(i.guildId) as {user_id:string}[];
   let sent=0,failed=0;
   for(const target of targets){
    try{
     const member=await i.guild!.members.fetch(target.user_id).catch(()=>null);
     if(!member){failed++;continue;}
     await member.send({embeds:[themed("Объявление сервера",item.message)]});
     sent++;
    }catch{failed++;}
    await new Promise(resolve=>setTimeout(resolve,1100));
   }
   db.prepare("DELETE FROM pending_broadcasts WHERE id=?").run(id);
   await i.followUp({content:"Рассылка завершена. Отправлено: "+sent+". Не доставлено: "+failed+". Получателей с подпиской: "+targets.length+".",ephemeral:true});return;
  }
  if(i.isButton()&&i.customId==="book"){
   const menu=new StringSelectMenuBuilder().setCustomId("book_type").setPlaceholder("Выберите должность").addOptions({label:"Администратор",value:"admin"},{label:"Лидер",value:"leader"});
   await i.reply({content:"Выберите должность:",components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],ephemeral:true});return;
  }
  if(i.isStringSelectMenu()&&i.customId==="book_type"){
   const m=new ModalBuilder().setCustomId("book_time:"+i.values[0]).setTitle("Анкета кандидата");
   m.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("candidate_name").setLabel("ИМЯ").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("candidate_age").setLabel("ВОЗРАСТ").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("about").setLabel("О СЕБЕ").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("nickname").setLabel("NICKNAME").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("when").setLabel("Дата и время собеседования").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40))
   );
   await i.showModal(m);return;
  }
  if(i.isModalSubmit()&&i.customId.startsWith("book_time:")){
   if(!i.guildId){await i.reply({content:"Запись доступна на сервере.",ephemeral:true});return;}
   const c=cfg(i.guildId);if(!c?.applications_channel_id){await i.reply({content:"Система не настроена.",ephemeral:true});return;}
   const state=db.prepare("SELECT applications_open FROM settings WHERE guild_id=?").get(i.guildId) as {applications_open:number}|undefined;
   if(state?.applications_open===0){await i.reply({content:"Набор заявок сейчас закрыт.",ephemeral:true});return;}
   const old=db.prepare("SELECT id FROM applications WHERE guild_id=? AND user_id=? AND status IN ('pending','scheduled','interview')").get(i.guildId,i.user.id);
   if(old){await i.reply({content:"У вас уже есть активная заявка.",ephemeral:true});return;}
   const type=i.customId.split(":")[1],when=i.fields.getTextInputValue("when").trim();
   const candidateName=i.fields.getTextInputValue("candidate_name").trim(),candidateAge=i.fields.getTextInputValue("candidate_age").trim(),about=i.fields.getTextInputValue("about").trim(),nickname=i.fields.getTextInputValue("nickname").trim();
   if(!/^\d{1,2}$/.test(candidateAge)){await i.reply({content:"Укажите возраст цифрами.",ephemeral:true});return;}
   const ins=db.prepare("INSERT INTO applications(guild_id,user_id,type,status,interview_at,candidate_name,candidate_age,about,nickname) VALUES(?,?,?,'pending',?,?,?,?,?)").run(i.guildId,i.user.id,type,when,candidateName,candidateAge,about,nickname);
   const ch=await client.channels.fetch(c.applications_channel_id);
   if(ch?.isTextBased()&&"send" in ch)await ch.send({embeds:[themed("📩 НОВАЯ ЗАЯВКА #"+ins.lastInsertRowid,"Поступила новая заявка на собеседование.").addFields({name:"Кандидат",value:"<@"+i.user.id+">"},{name:"Должность",value:type==="leader"?"Лидер":"Администратор",inline:true},{name:"Время",value:when,inline:true},{name:"ИМЯ",value:candidateName,inline:true},{name:"ВОЗРАСТ",value:candidateAge,inline:true},{name:"NICKNAME",value:nickname,inline:true},{name:"О СЕБЕ",value:about.slice(0,1024)})],components:[row(new ButtonBuilder().setCustomId("approve:"+ins.lastInsertRowid).setLabel("✓ Подтвердить").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("decline:"+ins.lastInsertRowid).setLabel("✕ Отклонить").setStyle(ButtonStyle.Danger))]});
   await i.reply({embeds:[themed("✅ ЗАЯВКА ОТПРАВЛЕНА","Ваша заявка передана администрации. Ожидайте уведомления о подтверждении записи.")],ephemeral:true});return;
  }
  if(i.isButton()&&(i.customId.startsWith("approve:")||i.customId.startsWith("decline:"))){
   if(!i.guildId){return;}const c=cfg(i.guildId);if(!isStaff(i,c)){await i.reply({content:"Только для администрации.",ephemeral:true});return;}
   const [action,n]=i.customId.split(":"),id=Number(n),app=db.prepare("SELECT * FROM applications WHERE id=? AND guild_id=?").get(id,i.guildId) as any;
   if(!app||app.status!=="pending"){await i.reply({content:"Заявка уже обработана.",ephemeral:true});return;}
   if(action==="decline"){db.prepare("UPDATE applications SET status='rejected',reviewed_by=? WHERE id=?").run(i.user.id,id);await (await client.users.fetch(app.user_id)).send("Ваша заявка отклонена администрацией.").catch(()=>{});await i.update({content:"Заявка отклонена.",components:[],embeds:i.message.embeds});return;}
   db.prepare("UPDATE applications SET status='scheduled',reviewed_by=? WHERE id=?").run(i.user.id,id);
   await client.users.send(app.user_id,"Ваша запись подтверждена. Время: "+app.interview_at+". Ожидайте начала собеседования.").catch(()=>{});
   await i.update({content:"Запись подтверждена. Кандидату отправлено уведомление.",embeds:i.message.embeds,components:[row(new ButtonBuilder().setCustomId("start:"+id).setLabel("▶ Начать собеседование").setStyle(ButtonStyle.Primary))]});return;
  }
  if(i.isButton()&&i.customId.startsWith("start:")){
   if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Только для администрации.",ephemeral:true});return;}
   const id=Number(i.customId.split(":")[1]),app=db.prepare("SELECT * FROM applications WHERE id=? AND guild_id=?").get(id,i.guildId) as any;
   if(!app||app.status!=="scheduled"){await i.reply({content:"Заявка не ожидает собеседования.",ephemeral:true});return;}
   const qs=questions(i.guildId,app.type as InterviewType);
   if(qs.length!==20){await i.reply({content:`Для собеседования нужно ровно 20 вопросов. Сейчас: ${qs.length}. Исправьте набор вопросов.`,ephemeral:true});return;}
   const created=db.prepare("INSERT INTO interviews(application_id,user_id,type,interviewer_id,score,total,result) VALUES(?,?,?,?,0,20,'in_progress')").run(id,app.user_id,app.type,i.user.id);
   db.prepare("UPDATE applications SET status='interview' WHERE id=?").run(id);
   const interviewId=Number(created.lastInsertRowid);
   qs.forEach((q,n)=>db.prepare("INSERT INTO answers(interview_id,position,question,passed) VALUES(?,?,?,NULL)").run(interviewId,n+1,q));
   const embed=new EmbedBuilder().setTitle("Собеседование #"+interviewId).setDescription("Кандидат: <@"+app.user_id+">\nОтмечайте каждый вопрос через список ниже. Все 20 вопросов показаны сразу.");
   qs.forEach((q,n)=>embed.addFields({name:`Вопрос ${n+1}`,value:q.slice(0,1024)}));
   const menu=new StringSelectMenuBuilder().setCustomId("gradeq:"+interviewId).setPlaceholder("Выберите вопрос для оценки").addOptions(qs.map((q,n)=>({label:`Вопрос ${n+1}`,value:String(n+1),description:q.slice(0,90)})));
   await i.reply({embeds:[embed],components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),row(new ButtonBuilder().setCustomId("count:"+interviewId).setLabel("▣ Подсчитать результат").setStyle(ButtonStyle.Primary))]});return;
  }
  if(i.isStringSelectMenu()&&i.customId.startsWith("gradeq:")){
   if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Только для администрации.",ephemeral:true});return;}
   const interviewId=Number(i.customId.split(":")[1]),pos=Number(i.values[0]),ans=db.prepare("SELECT question FROM answers WHERE interview_id=? AND position=?").get(interviewId,pos) as any;
   const buttons=row(new ButtonBuilder().setCustomId(`grade:${interviewId}:${pos}:1`).setLabel("✓ Зачёт").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`grade:${interviewId}:${pos}:0`).setLabel("✕ Не зачёт").setStyle(ButtonStyle.Danger));
   await i.reply({content:`Вопрос ${pos}: ${ans.question}`,components:[buttons],ephemeral:true});return;
  }
  if(i.isButton()&&i.customId.startsWith("grade:")){
   if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Только для администрации.",ephemeral:true});return;}
   const [,iid,p,pass]=i.customId.split(":");db.prepare("UPDATE answers SET passed=? WHERE interview_id=? AND position=?").run(Number(pass),Number(iid),Number(p));
   await i.update({content:`Вопрос ${p}: ${pass==="1"?"Зачёт":"Не зачёт"} сохранён.`,components:[]});return;
  }
  if(i.isButton()&&i.customId.startsWith("count:")){
   if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Только для администрации.",ephemeral:true});return;}
   const id=Number(i.customId.split(":")[1]),a=db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN passed=1 THEN 1 ELSE 0 END) score,SUM(CASE WHEN passed IS NULL THEN 1 ELSE 0 END) pending FROM answers WHERE interview_id=?").get(id) as any;
   if(a.pending){await i.reply({content:`Сначала оцените все вопросы. Осталось: ${a.pending}.`,ephemeral:true});return;}
   const pct=Math.round(a.score/a.total*100),passed=pct>70;
   db.prepare("UPDATE interviews SET score=?,total=?,result=? WHERE id=?").run(a.score,a.total,passed?"passed":"failed",id);
   await i.update({content:`Результат: ${a.score}/${a.total} (${pct}%). ${passed?"Кандидат прошёл порог. Можно принять или отказать.":"Кандидат не прошёл порог. Можно отказать."}`,embeds:[],components:[row(new ButtonBuilder().setCustomId("accept:"+id).setLabel("✓ Принять кандидата").setStyle(ButtonStyle.Success).setDisabled(!passed),new ButtonBuilder().setCustomId("finalreject:"+id).setLabel("Отказать").setStyle(ButtonStyle.Danger))]});return;
  }
  if(i.isButton()&&(i.customId.startsWith("accept:")||i.customId.startsWith("finalreject:"))){
   if(!i.guildId||!isStaff(i,cfg(i.guildId))){await i.reply({content:"Только для администрации.",ephemeral:true});return;}
   const accept=i.customId.startsWith("accept:"),id=Number(i.customId.split(":")[1]),iv=db.prepare("SELECT * FROM interviews WHERE id=?").get(id) as any;
   if(!iv||iv.result!=="passed"&&accept){await i.reply({content:"Кандидат не набрал проходной результат.",ephemeral:true});return;}
   db.prepare("UPDATE interviews SET result=? WHERE id=?").run(accept?"accepted":"rejected",id);
   db.prepare("UPDATE applications SET status=? WHERE id=?").run(accept?"accepted":"rejected",iv.application_id);
   if(accept){
    const modal=new ModalBuilder().setCustomId("candidateform:"+id).setTitle("Анкета кандидата");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("vk").setLabel("Ссылка на страницу VK").setStyle(TextInputStyle.Short).setRequired(true)),new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("forum").setLabel("Ссылка на форум").setStyle(TextInputStyle.Short).setRequired(true)));
    await i.update({content:"Кандидат принят. Ему отправлено сообщение с просьбой заполнить анкету в личных сообщениях.",components:[],embeds:[]});
    const user=await client.users.fetch(iv.user_id);await user.send("Поздравляем! Вы приняты. Заполните анкету кнопкой ниже:").catch(()=>{});
    const dm=await user.createDM();await dm.send({content:"Анкета кандидата:",components:[row(new ButtonBuilder().setCustomId("formopen:"+id).setLabel("✦ Заполнить анкету").setStyle(ButtonStyle.Primary))]});return;
   }
   await (await client.users.fetch(iv.user_id)).send("По итогам собеседования вы не приняты.").catch(()=>{});
   await i.update({content:"Решение об отказе сохранено.",components:[],embeds:[]});return;
  }
  if(i.isButton()&&i.customId.startsWith("formopen:")){
   const id=i.customId.split(":")[1],m=new ModalBuilder().setCustomId("candidateform:"+id).setTitle("Анкета кандидата");
   m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("vk").setLabel("Ссылка на страницу VK").setStyle(TextInputStyle.Short).setRequired(true)),new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("forum").setLabel("Ссылка на форум").setStyle(TextInputStyle.Short).setRequired(true)));
   await i.showModal(m);return;
  }
  if(i.isModalSubmit()&&i.customId.startsWith("candidateform:")){
   const id=Number(i.customId.split(":")[1]),iv=db.prepare("SELECT user_id,application_id FROM interviews WHERE id=?").get(id) as any;
   if(!iv||iv.user_id!==i.user.id){await i.reply({content:"Эта анкета предназначена другому пользователю.",ephemeral:true});return;}
   const vk=i.fields.getTextInputValue("vk"),forum=i.fields.getTextInputValue("forum");
   db.prepare("INSERT INTO candidate_forms(application_id,user_id,vk,forum) VALUES(?,?,?,?)").run(iv.application_id,i.user.id,vk,forum);
   const app=db.prepare("SELECT guild_id FROM applications WHERE id=?").get(iv.application_id) as any,c=cfg(app.guild_id);
   const ch=c?.forms_channel_id?await client.channels.fetch(c.forms_channel_id):null;
   if(ch?.isTextBased()&&"send" in ch)await ch.send({embeds:[themed("📋 АНКЕТА КАНДИДАТА","Кандидат успешно прошёл собеседование и отправил данные.").addFields({name:"Кандидат",value:"<@"+i.user.id+">"},{name:"VK",value:vk},{name:"Форум",value:forum})]});
   await i.reply({content:"Анкета отправлена администрации. Спасибо!",ephemeral:true});return;
  }
 }catch(e){console.error(e);if(i.isRepliable()&&!i.replied&&!i.deferred)await i.reply({content:"Ошибка обработки. Проверьте настройки и права бота.",ephemeral:true}).catch(()=>{});}
});
client.on(Events.GuildMemberUpdate,async(b,a)=>{
 const c=cfg(a.guild.id);if(!c?.candidate_role_id)return;
 const had=b.roles.cache.has(c.candidate_role_id),has=a.roles.cache.has(c.candidate_role_id);
 if(!had&&has){
  const ch=await a.guild.channels.create({name:"candidate-"+a.user.username.toLowerCase().replace(/[^a-z0-9-]/g,"-").slice(0,80),type:ChannelType.GuildText,parent:c.category_id??undefined,permissionOverwrites:[{id:a.guild.roles.everyone.id,deny:[PermissionsBitField.Flags.ViewChannel]},{id:a.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]},...(c.staff_role_id?[{id:c.staff_role_id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]}]:[])]});
  db.prepare("INSERT INTO applications(guild_id,user_id,private_channel_id,status) VALUES(?,?,?,'channel')").run(a.guild.id,a.id,ch.id);
  await ch.send({content:"Добро пожаловать, <@"+a.id+">! Нажмите кнопку для записи.",components:[row(new ButtonBuilder().setCustomId("book").setLabel("Записаться на собеседование").setStyle(ButtonStyle.Primary))]});
 }
 if(had&&!has){const rows=db.prepare("SELECT private_channel_id FROM applications WHERE guild_id=? AND user_id=? AND private_channel_id IS NOT NULL").all(a.guild.id,a.id) as {private_channel_id:string}[];for(const x of rows){const ch=a.guild.channels.cache.get(x.private_channel_id);if(ch)await ch.delete("Роль кандидата снята");}db.prepare("UPDATE applications SET private_channel_id=NULL WHERE guild_id=? AND user_id=?").run(a.guild.id,a.id);}
});
client.login(process.env.DISCORD_TOKEN);
