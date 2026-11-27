import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const file=process.env.DATABASE_PATH??"./data/bot.sqlite";
mkdirSync(dirname(file),{recursive:true});
export const db=new Database(file);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS settings(guild_id TEXT PRIMARY KEY,candidate_role_id TEXT,applications_channel_id TEXT,forms_channel_id TEXT,category_id TEXT,staff_role_id TEXT,applications_open INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,type TEXT,status TEXT DEFAULT 'pending',interview_at TEXT,private_channel_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS interviews(id INTEGER PRIMARY KEY AUTOINCREMENT,application_id INTEGER,user_id TEXT,type TEXT,interviewer_id TEXT,score INTEGER,total INTEGER,result TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS answers(id INTEGER PRIMARY KEY AUTOINCREMENT,interview_id INTEGER,position INTEGER,question TEXT,passed INTEGER);
CREATE TABLE IF NOT EXISTS questions(guild_id TEXT,type TEXT,position INTEGER,text TEXT,PRIMARY KEY(guild_id,type,position));
CREATE TABLE IF NOT EXISTS candidate_forms(id INTEGER PRIMARY KEY AUTOINCREMENT,application_id INTEGER,user_id TEXT,vk TEXT,forum TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
const cols=db.prepare("PRAGMA table_info(settings)").all() as {name:string}[];
if(!cols.some(x=>x.name==="applications_open"))db.exec("ALTER TABLE settings ADD COLUMN applications_open INTEGER DEFAULT 1");
