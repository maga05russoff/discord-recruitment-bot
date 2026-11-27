import "dotenv/config";
import {Client,GatewayIntentBits,Events,ChannelType,PermissionsBitField,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,EmbedBuilder} from "discord.js";
import {db} from "./db.js";
if(!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is not set");
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.DirectMessages]});
type Cfg={candidate_role_id:string|null;staff_role_id:string|null;applications_channel_id:string|null;forms_channel_id:string|null;category_id:string|null};
const cfg=(g:string)=>db.prepare("SELECT candidate_role_id,staff_role_id,applications_channel_id,forms_channel_id,category_id FROM settings WHERE guild_id=?").get(g) as Cfg|undefined;
client.once(Events.ClientReady,c=>console.log("Бот запущен: "+c.user.tag));
client.on(Events.InteractionCreate,async i=>{
 try{
  if(i.isChatInputCommand()&&i.commandName==="setup"){
   if(!i.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)){await i.reply({content:"Нужно право «Управление сервером».",ephemeral:true});return;}
   const r=i.options.getRole("candidate_role",true),s=i.options.getRole("staff_role",true),a=i.options.getChannel("applications_channel",true),f=i.options.getChannel("forms_channel",true),cat=i.options.getChannel("category");
   db.prepare(`INSERT INTO settings(guild_id,candidate_role_id,staff_role_id,applications_channel_id,forms_channel_id,category_id) VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET candidate_role_id=excluded.candidate_role_id,staff_role_id=excluded.staff_role_id,applications_channel_id=excluded.applications_channel_id,forms_channel_id=excluded.forms_channel_id,category_id=excluded.category_id`).run(i.guildId,r.id,s.id,a.id,f.id,cat?.id??null);
   await i.reply({content:"Настройки сохранены. Теперь используйте /panel.",ephemeral:true});return;
  }
  if(i.isChatInputCommand()&&i.commandName==="panel"){
   if(!i.guildId||!i.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)){await i.reply({content:"Команда доступна администрации.",ephemeral:true});return;}
   if(!cfg(i.guildId)?.applications_channel_id){await i.reply({content:"Сначала выполните /setup.",ephemeral:true});return;}
   const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("book").setLabel("Записаться на собеседование").setStyle(ButtonStyle.Primary));
   await i.channel?.send({embeds:[new EmbedBuilder().setTitle("Запись на собеседование").setDescription("Нажмите кнопку, выберите должность и укажите желаемые дату и время.")],components:[row]});
   await i.reply({content:"Панель опубликована.",ephemeral:true});return;
  }
  if(i.isButton()&&i.customId==="book"){
   const row=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId("book_type").setPlaceholder("Выберите должность").addOptions({label:"Администратор",value:"admin"},{label:"Лидер",value:"leader"}));
   await i.reply({content:"Выберите должность:",components:[row],ephemeral:true});return;
  }
  if(i.isStringSelectMenu()&&i.customId==="book_type"){
   const m=new ModalBuilder().setCustomId("book_time:"+i.values[0]).setTitle("Время собеседования");
   const t=new TextInputBuilder().setCustomId("when").setLabel("Дата и время (например 30.11.2026 18:30)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40);
   m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(t));await i.showModal(m);return;
  }
  if(i.isModalSubmit()&&i.customId.startsWith("book_time:")){
   if(!i.guildId){await i.reply({content:"Используйте запись на сервере.",ephemeral:true});return;}
   const c=cfg(i.guildId);if(!c?.applications_channel_id){await i.reply({content:"Бот не настроен. Обратитесь к администрации.",ephemeral:true});return;}
   const type=i.customId.split(":")[1],when=i.fields.getTextInputValue("when").trim();
   const old=db.prepare("SELECT id FROM applications WHERE guild_id=? AND user_id=? AND status IN ('pending','scheduled')").get(i.guildId,i.user.id);
   if(old){await i.reply({content:"У вас уже есть активная заявка. Обратитесь к администрации для переноса времени.",ephemeral:true});return;}
   const q=db.prepare("INSERT INTO applications(guild_id,user_id,type,status,interview_at) VALUES(?,?,?,'pending',?)").run(i.guildId,i.user.id,type,when);
   const ch=await client.channels.fetch(c.applications_channel_id);
   if(ch?.isTextBased()&&"send" in ch){
    const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("approve:"+q.lastInsertRowid).setLabel("Подтвердить").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("decline:"+q.lastInsertRowid).setLabel("Отклонить").setStyle(ButtonStyle.Danger));
    await ch.send({embeds:[new EmbedBuilder().setTitle("Новая заявка").addFields({name:"Кандидат",value:"<@"+i.user.id+">"},{name:"Должность",value:type==="leader"?"Лидер":"Администратор",inline:true},{name:"Время",value:when,inline:true})],components:[row]});
   }
   await i.reply({content:"Заявка отправлена администрации. Ожидайте подтверждения в ЛС.",ephemeral:true});return;
  }
  if(i.isButton()&&(i.customId.startsWith("approve:")||i.customId.startsWith("decline:"))){
   if(!i.guildId){return;}const c=cfg(i.guildId);
   const staff=Boolean(c?.staff_role_id&&i.member&&"roles" in i.member&&(i.member as any).roles.cache.has(c.staff_role_id))||Boolean(i.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild));
   if(!staff){await i.reply({content:"Только для администрации.",ephemeral:true});return;}
   const [act,num]=i.customId.split(":"),id=Number(num);
   const app=db.prepare("SELECT user_id,type,interview_at,status FROM applications WHERE id=? AND guild_id=?").get(id,i.guildId) as {user_id:string;type:string;interview_at:string;status:string}|undefined;
   if(!app||app.status!=="pending"){await i.reply({content:"Заявка уже обработана.",ephemeral:true});return;}
   const ok=act==="approve";db.prepare("UPDATE applications SET status=? WHERE id=?").run(ok?"scheduled":"rejected",id);
   try{const u=await client.users.fetch(app.user_id);await u.send(ok?"Ваша запись подтверждена. Собеседование: "+app.interview_at+".":"Ваша заявка отклонена. Обратитесь к администрации сервера.");}catch{}
   await i.update({content:ok?"Подтверждено, кандидату отправлено ЛС.":"Заявка отклонена.",embeds:i.message.embeds,components:[]});return;
  }
 }catch(e){console.error(e);if(i.isRepliable()&&!i.replied&&!i.deferred)await i.reply({content:"Ошибка обработки. Проверьте настройки и права бота.",ephemeral:true}).catch(()=>{});}
});
client.on(Events.GuildMemberUpdate,async(b,a)=>{
 const c=cfg(a.guild.id);if(!c?.candidate_role_id)return;
 const had=b.roles.cache.has(c.candidate_role_id),has=a.roles.cache.has(c.candidate_role_id);
 if(!had&&has){
  const ch=await a.guild.channels.create({name:"candidate-"+a.user.username.toLowerCase().replace(/[^a-z0-9-]/g,"-").slice(0,80),type:ChannelType.GuildText,parent:c.category_id??undefined,permissionOverwrites:[{id:a.guild.roles.everyone.id,deny:[PermissionsBitField.Flags.ViewChannel]},{id:a.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]},...(c.staff_role_id?[{id:c.staff_role_id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]}]:[])]});
  db.prepare("INSERT INTO applications(guild_id,user_id,private_channel_id) VALUES(?,?,?)").run(a.guild.id,a.id,ch.id);
  const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("book").setLabel("Записаться на собеседование").setStyle(ButtonStyle.Primary));
  await ch.send({content:"Добро пожаловать, <@"+a.id+">! Нажмите кнопку для записи.",components:[row]});
 }
 if(had&&!has){const rows=db.prepare("SELECT private_channel_id FROM applications WHERE guild_id=? AND user_id=? AND private_channel_id IS NOT NULL").all(a.guild.id,a.id) as {private_channel_id:string}[];for(const x of rows){const ch=a.guild.channels.cache.get(x.private_channel_id);if(ch)await ch.delete("Роль кандидата снята");}db.prepare("UPDATE applications SET private_channel_id=NULL WHERE guild_id=? AND user_id=?").run(a.guild.id,a.id);}
});
client.login(process.env.DISCORD_TOKEN);
