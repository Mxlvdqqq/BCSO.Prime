const { Client, GatewayIntentBits } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SERVICE_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const LOGS_CHANNEL_ID = process.env.DISCORD_LOGS_CHANNEL_ID;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN non défini. Le bot Discord ne pourra pas se connecter.');
}
if (!SERVICE_CHANNEL_ID) {
  console.error('❌ DISCORD_CHANNEL_ID non défini. Le bot ne pourra pas envoyer les logs de service.');
}
if (!LOGS_CHANNEL_ID) {
  console.error('❌ DISCORD_LOGS_CHANNEL_ID non défini. Le bot ne pourra pas envoyer les logs administratifs.');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let clientReady = false;

const loginPromise = new Promise((resolve, reject) => {
  if (!DISCORD_TOKEN) {
    return reject(new Error('DISCORD_TOKEN non configuré.'));
  }

  client.once('clientReady', () => {
    clientReady = true;
    console.log(`✅ Bot Discord connecté : ${client.user.tag}`);
    resolve();
  });

  client.login(DISCORD_TOKEN).catch(err => {
    console.error('❌ Échec de la connexion Discord :', err);
    reject(err);
  });
});

loginPromise.catch(() => {});

client.on('error', error => {
  console.error('Discord client error:', error);
});

async function getChannel(channelId) {
  await loginPromise;

  if (!clientReady) {
    throw new Error('Discord n’est pas encore connecté.');
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel || typeof channel.send !== 'function') {
    throw new Error('Impossible de récupérer le salon Discord configuré.');
  }

  return channel;
}

async function sendServiceLog(message) {
  if (!SERVICE_CHANNEL_ID) {
    throw new Error('DISCORD_CHANNEL_ID non configuré.');
  }

  const channel = await getChannel(SERVICE_CHANNEL_ID);
  return channel.send({ content: message });
}

module.exports = {
  sendServiceLog,
  sendAdminLog
};

async function sendAdminLog(message) {
  if (!LOGS_CHANNEL_ID) {
    throw new Error('DISCORD_LOGS_CHANNEL_ID non configuré.');
  }

  const channel = await getChannel(LOGS_CHANNEL_ID);
  if (!channel || typeof channel.send !== 'function') {
    throw new Error('Impossible de récupérer le canal des logs Discord.');
  }

  return channel.send({ content: message });
}