# Discord Recruitment Bot

Discord-бот для собеседований кандидатов на должности администратора и лидера.

## Запуск
1. Node.js 20+.
2. npm install
3. Скопируйте .env.example в .env и заполните DISCORD_TOKEN, CLIENT_ID и GUILD_ID.
4. В Discord Developer Portal включите Server Members Intent.
5. npm run register
6. npm run dev

Для постоянной работы используйте VPS или Railway Worker. Vercel Functions не подходят для постоянного Discord Gateway-подключения.

Никогда не добавляйте .env и токен бота в GitHub.
