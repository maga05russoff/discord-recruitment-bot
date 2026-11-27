import "dotenv/config";
import { Client, GatewayIntentBits, Events, ChannelType, PermissionsBitField } from "discord.js";
import { db } from "./db.js";

if (!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is not set");
const client = new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.DirectMessages]});

client.once(Events.ClientReady, c => console.log("Bot online: " + c.user.tag));

client.on(Events.GuildMemberUpdate, async (before, after) => {
 const config = db.prepare("SELECT candidate_role_id,category_id FROM settings WHERE guild_id=?").get(after.guild.id) as {candidate_role_id:string|null,category_id:string|null}|undefined;
 if (!config?.candidate_role_id) return;
 const had = before.roles.cache.has(config.candidate_role_id);
 const has = after.roles.cache.has(config.candidate_role_id);
 if (!had && has) {
  const prior = db.prepare("SELECT private_channel_id FROM applications WHERE guild_id=? AND user_id=? AND private_channel_id IS NOT NULL ORDER BY id DESC LIMIT 1").get(after.guild.id,after.id) as {private_channel_id:string}|undefined;
  if (prior && after.guild.channels.cache.has(prior.private_channel_id)) return;
  const channel = await after.guild.channels.create({
   name:("candidate-" + after.user.username).toLowerCase().replace(/[^a-z0-9-]/g,"-").slice(0,90),
   type:ChannelType.GuildText,
   parent:config.category_id ?? undefined,
   permissionOverwrites:[
    {id:after.guild.roles.everyone.id,deny:[PermissionsBitField.Flags.ViewChannel]},
    {id:after.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]}
   ]
  });
  db.prepare("INSERT INTO applications(guild_id,user_id,private_channel_id) VALUES(?,?,?)").run(after.guild.id,after.id,channel.id);
  await channel.send("Добро пожаловать! Здесь будет доступна запись на собеседование после завершения настройки бота.");
 }
 if (had && !has) {
  const rows = db.prepare("SELECT private_channel_id FROM applications WHERE guild_id=? AND user_id=? AND private_channel_id IS NOT NULL").all(after.guild.id,after.id) as {private_channel_id:string}[];
  for (const row of rows) {
   const channel = after.guild.channels.cache.get(row.private_channel_id);
   if (channel) await channel.delete("Роль кандидата снята");
  }
  db.prepare("UPDATE applications SET private_channel_id=NULL WHERE guild_id=? AND user_id=?").run(after.guild.id,after.id);
 }
});

client.login(process.env.DISCORD_TOKEN);
