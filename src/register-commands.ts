import "dotenv/config";
import {REST,Routes,SlashCommandBuilder,ChannelType} from "discord.js";
const token=process.env.DISCORD_TOKEN,clientId=process.env.CLIENT_ID,guildId=process.env.GUILD_ID;
if(!token||!clientId||!guildId)throw new Error("Заполните DISCORD_TOKEN, CLIENT_ID и GUILD_ID в .env");
const commands=[
 new SlashCommandBuilder().setName("setup").setDescription("Настроить систему собеседований")
 .addRoleOption(o=>o.setName("candidate_role").setDescription("Роль кандидата").setRequired(true))
 .addRoleOption(o=>o.setName("staff_role").setDescription("Роль администрации").setRequired(true))
 .addChannelOption(o=>o.setName("applications_channel").setDescription("Закрытый канал заявок").addChannelTypes(ChannelType.GuildText).setRequired(true))
 .addChannelOption(o=>o.setName("forms_channel").setDescription("Канал анкет").addChannelTypes(ChannelType.GuildText).setRequired(true))
 .addChannelOption(o=>o.setName("category").setDescription("Категория личных каналов").addChannelTypes(ChannelType.GuildCategory)),
 new SlashCommandBuilder().setName("admin").setDescription("Открыть административную панель заявок и кандидатов"),
 new SlashCommandBuilder().setName("panel").setDescription("Опубликовать панель записи"),
 new SlashCommandBuilder().setName("applications").setDescription("Открыть или закрыть набор").addStringOption(o=>o.setName("state").setDescription("Состояние набора").setRequired(true).addChoices({name:"Открыть",value:"open"},{name:"Закрыть",value:"close"})),
 new SlashCommandBuilder().setName("history").setDescription("История собеседований кандидата").addUserOption(o=>o.setName("candidate").setDescription("Кандидат").setRequired(true)),
 new SlashCommandBuilder().setName("questions").setDescription("Управление вопросами")
 .addSubcommand(s=>s.setName("list").setDescription("Показать вопросы").addStringOption(o=>o.setName("type").setDescription("Тип").setRequired(true).addChoices({name:"Администратор",value:"admin"},{name:"Лидер",value:"leader"})))
 .addSubcommand(s=>s.setName("add").setDescription("Добавить вопрос").addStringOption(o=>o.setName("type").setDescription("Тип").setRequired(true).addChoices({name:"Администратор",value:"admin"},{name:"Лидер",value:"leader"})).addStringOption(o=>o.setName("text").setDescription("Текст вопроса").setRequired(true)))
 .addSubcommand(s=>s.setName("delete").setDescription("Удалить вопрос по номеру").addStringOption(o=>o.setName("type").setDescription("Тип").setRequired(true).addChoices({name:"Администратор",value:"admin"},{name:"Лидер",value:"leader"})).addIntegerOption(o=>o.setName("number").setDescription("Номер вопроса").setRequired(true).setMinValue(1)))
].map(x=>x.toJSON());
const rest=new REST({version:"10"}).setToken(token);
await rest.put(Routes.applicationGuildCommands(clientId,guildId),{body:commands});
console.log("Slash-команды зарегистрированы.");
