import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
if (!token || !clientId || !guildId) throw new Error("Заполните DISCORD_TOKEN, CLIENT_ID и GUILD_ID в .env");

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Настроить систему собеседований")
    .addRoleOption(o => o.setName("candidate_role").setDescription("Роль кандидата").setRequired(true))
    .addRoleOption(o => o.setName("staff_role").setDescription("Роль администрации").setRequired(true))
    .addChannelOption(o => o.setName("applications_channel").setDescription("Канал заявок для администрации").setRequired(true))
    .addChannelOption(o => o.setName("forms_channel").setDescription("Канал анкет кандидатов").setRequired(true))
    .addChannelOption(o => o.setName("category").setDescription("Категория личных каналов кандидатов").setRequired(false))
    .toJSON()
];

const rest = new REST({ version: "10" }).setToken(token);
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
console.log("Команда /setup зарегистрирована на указанном сервере.");
