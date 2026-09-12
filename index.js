require('dotenv').config();
const express = require('express');
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Events
} = require('discord.js');
const config = require('./config.json');
const fs = require('fs');
const path = require('path');

// ===== HTTP-SERVER FÜR RENDER =====
const app = express();
app.get('/', (req, res) => res.send('Bot läuft ✅'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 HTTP-Server läuft auf Port ${PORT}`);
});

// ===== GLOBALER ERROR-HANDLER =====
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// ===== KONFIG-WERTE =====
const OWNER_ID = '1358450873646321696'; // Kay Lehnet55
const LOG_CHANNEL_ID = config.adminLogChannelId || config.logChannelId;

// ===== DATEN SPEICHERN =====
const dataFilePath = path.join(__dirname, 'applications.json');

let applications = {
    pending: [],
    accepted: [],
    rejected: []
};

function loadData() {
    try {
        if (fs.existsSync(dataFilePath)) {
            const data = fs.readFileSync(dataFilePath, 'utf8');
            applications = JSON.parse(data);
        }
    } catch (err) {
        console.error('Fehler beim Laden der Daten:', err);
    }
}

function saveData() {
    try {
        fs.writeFileSync(dataFilePath, JSON.stringify(applications, null, 2));
    } catch (err) {
        console.error('Fehler beim Speichern:', err);
    }
}

loadData();

const pendingApplications = new Map();
applications.pending.forEach(app => {
    pendingApplications.set(app.id, app);
});

// ===== CLIENT =====
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot online als ${client.user.tag}`);
    const guild = client.guilds.cache.first();
    if (guild) {
        try {
            await guild.commands.create({
                name: 'bewerbung',
                description: 'Erstellt das Bewerbungs Panel'
            });
            await guild.commands.create({
                name: 'bewerbungen',
                description: 'Zeige offene Bewerbungen (Admin)'
            });
            await guild.commands.create({
                name: 'bewerbungslog',
                description: 'Zeige Bewerbungs-Log (Admin)'
            });
            await guild.commands.create({
                name: 'ping',
                description: 'Zeigt Latenz, RAM und System-Info in Echtzeit'
            });
            await guild.commands.create({
                name: 'bot',
                description: 'Bot-Verwaltung (Owner only)',
                options: [
                    {
                        name: 'disconnect',
                        description: 'Trennt den Bot vom Server (Test)',
                        type: 1 // SUB_COMMAND
                    }
                ]
            });
            console.log('✅ Slash Commands registriert');
        } catch (err) {
            console.error('❌ Fehler beim Registrieren der Commands:', err);
        }
    }
});

// ===================================================================
// ===== LOGGING-SYSTEM MIT AUDIT-LOG (Wer war's?) ===================
// ===================================================================

async function getExecutor(guild, actionType, targetId, maxAgeMs = 10000) {
    try {
        const logs = await guild.fetchAuditLogs({ type: actionType, limit: 5 });
        const entry = logs.entries.find(e =>
            e.target?.id === targetId &&
            Date.now() - e.createdTimestamp < maxAgeMs
        );
        if (entry) {
            return {
                executor: entry.executor,
                reason: entry.reason || 'Kein Grund angegeben'
            };
        }
    } catch (e) {
        console.error('Audit-Log Fehler:', e.message);
    }
    return { executor: null, reason: null };
}

async function sendLog(guild, embed, critical = false) {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const payload = { embeds: [embed] };
    if (critical) {
        payload.content = `<@${OWNER_ID}> ⚠️ **Kritische Aktion erkannt!**`;
    }
    logChannel.send(payload).catch(() => {});
}

// ---- 1. NACHRICHT GELÖSCHT ----
client.on(Events.MessageDelete, async message => {
    if (!message.guild || message.author?.bot) return;

    const { executor } = await getExecutor(message.guild, 72, message.author.id);

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Nachricht gelöscht')
        .addFields(
            { name: '👤 Autor', value: message.author?.tag || 'Unbekannt', inline: true },
            { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
            { name: '👮 Gelöscht von', value: executor ? executor.tag : '*unbekannt*', inline: true },
            { name: '📝 Inhalt', value: message.content?.substring(0, 1000) || '*leer*' }
        )
        .setColor(0xFF0000)
        .setTimestamp();
    sendLog(message.guild, embed);
});

// ---- 2. NACHRICHT BEARBEITET ----
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
        .setTitle('✏️ Nachricht bearbeitet')
        .addFields(
            { name: '👤 Autor', value: newMessage.author?.tag || 'Unbekannt', inline: true },
            { name: '📍 Channel', value: `<#${newMessage.channel.id}>`, inline: true },
            { name: '📄 Alt', value: oldMessage.content?.substring(0, 500) || '*leer*' },
            { name: '📝 Neu', value: newMessage.content?.substring(0, 500) || '*leer*' }
        )
        .setColor(0xFFA500)
        .setTimestamp();
    sendLog(newMessage.guild, embed);
});

// ---- 3. MITGLIED GEKICKT / VERLASSEN ----
client.on(Events.GuildMemberRemove, async member => {
    const { executor, reason } = await getExecutor(member.guild, 20, member.user.id);

    const isBot = member.user.bot;
    const embed = new EmbedBuilder()
        .setTitle(isBot ? '🚨 BOT ENTFERNT' : '🚪 Mitglied entfernt')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: '👤 Mitglied', value: `${member.user.tag} (${member.user.id})`, inline: true },
            { name: '👮 Ausgeführt von', value: executor ? executor.tag : '*selbst verlassen / unbekannt*', inline: true },
            { name: '📝 Grund', value: reason || '*kein Grund*' }
        )
        .setColor(0xFF0000)
        .setTimestamp();
    sendLog(member.guild, embed, isBot);
});

// ---- 4. MITGLIED GEJOINT ----
client.on(Events.GuildMemberAdd, async member => {
    if (member.user.bot) {
        const { executor } = await getExecutor(member.guild, 28, member.user.id);
        const embed = new EmbedBuilder()
            .setTitle('🚨 BOT HINZUGEFÜGT')
            .addFields(
                { name: '🤖 Bot', value: `${member.user.tag} (${member.user.id})`, inline: true },
                { name: '👤 Eingeladen von', value: executor ? executor.tag : '*unbekannt*', inline: true }
            )
            .setColor(0xFF00FF)
            .setTimestamp();
        sendLog(member.guild, embed, true);
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('📥 Mitglied beigetreten')
        .setDescription(`${member.user.tag} (${member.user.id})`)
        .setThumbnail(member.user.displayAvatarURL())
        .setColor(0x00FF00)
        .setTimestamp();
    sendLog(member.guild, embed);
});

// ---- 5. ROLLEN ÄNDERUNG ----
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

    if (added.size > 0) {
        const { executor } = await getExecutor(newMember.guild, 25, newMember.user.id);
        const embed = new EmbedBuilder()
            .setTitle('➕ Rolle vergeben')
            .addFields(
                { name: '👤 Mitglied', value: newMember.user.tag, inline: true },
                { name: '🎭 Rolle(n)', value: added.map(r => r.name).join(', '), inline: true },
                { name: '👮 Von', value: executor ? executor.tag : '*unbekannt*', inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp();
        sendLog(newMember.guild, embed);
    }

    if (removed.size > 0) {
        const { executor } = await getExecutor(newMember.guild, 25, newMember.user.id);
        const embed = new EmbedBuilder()
            .setTitle('➖ Rolle entfernt')
            .addFields(
                { name: '👤 Mitglied', value: newMember.user.tag, inline: true },
                { name: '🎭 Rolle(n)', value: removed.map(r => r.name).join(', '), inline: true },
                { name: '👮 Von', value: executor ? executor.tag : '*unbekannt*', inline: true }
            )
            .setColor(0xFF0000)
            .setTimestamp();
        sendLog(newMember.guild, embed);
    }
});

// ---- 6. CHANNEL ERSTELLT / GELÖSCHT ----
client.on(Events.ChannelCreate, async channel => {
    if (!channel.guild) return;
    const { executor } = await getExecutor(channel.guild, 10, channel.id);
    const embed = new EmbedBuilder()
        .setTitle('📢 Channel erstellt')
        .addFields(
            { name: '📛 Name', value: channel.name, inline: true },
            { name: '👮 Von', value: executor ? executor.tag : '*unbekannt*', inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();
    sendLog(channel.guild, embed);
});

client.on(Events.ChannelDelete, async channel => {
    if (!channel.guild) return;
    const { executor } = await getExecutor(channel.guild, 12, channel.id);
    const embed = new EmbedBuilder()
        .setTitle('🗑️ Channel gelöscht')
        .addFields(
            { name: '📛 Name', value: channel.name, inline: true },
            { name: '👮 Von', value: executor ? executor.tag : '*unbekannt*', inline: true }
        )
        .setColor(0xFF0000)
        .setTimestamp();
    sendLog(channel.guild, embed, true);
});

// ---- 7. ROLLE ERSTELLT / GELÖSCHT ----
client.on(Events.GuildRoleCreate, async role => {
    const { executor } = await getExecutor(role.guild, 30, role.id);
    const embed = new EmbedBuilder()
        .setTitle('🎭 Rolle erstellt')
        .addFields(
            { name: '📛 Name', value: role.name, inline: true },
            { name: '👮 Von', value: executor ? executor.tag : '*unbekannt*', inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();
    sendLog(role.guild, embed);
});

client.on(Events.GuildRoleDelete, async role => {
    const { executor } = await getExecutor(role.guild, 32, role.id);
    const embed = new EmbedBuilder()
        .setTitle('🗑️ Rolle gelöscht')
        .addFields(
            { name: '📛 Name', value: role.name, inline: true },
            { name: '👮 Von', value: executor ? executor.tag : '*unbekannt*', inline: true }
        )
        .setColor(0xFF0000)
        .setTimestamp();
    sendLog(role.guild, embed, true);
});

// ---- 8. BAN / UNBAN ----
client.on(Events.GuildBanAdd, async ban => {
    const { executor, reason } = await getExecutor(ban.guild, 22, ban.user.id);
    const embed = new EmbedBuilder()
        .setTitle('🔨 Mitglied gebannt')
        .setThumbnail(ban.user.displayAvatarURL())
        .addFields(
            { name: '👤 User', value: `${ban.user.tag} (${ban.user.id})`, inline: true },
            { name: '👮 Von', value: executor ? executor.tag : '*unbekannt*', inline: true },
            { name: '📝 Grund', value: reason || '*kein Grund*' }
        )
        .setColor(0xFF0000)
        .setTimestamp();
    sendLog(ban.guild, embed, true);
});

client.on(Events.GuildBanRemove, async ban => {
    const { executor } = await getExecutor(ban.guild, 23, ban.user.id);
    const embed = new EmbedBuilder()
        .setTitle('🔓 Ban aufgehoben')
        .addFields(
            { name: '👤 User', value: `${ban.user.tag}`, inline: true },
            { name: '👮 Von', value: executor ? executor.tag : '*unbekannt*', inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();
    sendLog(ban.guild, embed);
});

// ===== PREFIX COMMANDS (!ping) =====
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const prefix = config.prefix || '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === 'ping') {
        let wsLatency = Math.max(0, Math.round(client.ws.ping));
        const apiLatency = Math.max(0, Math.round(Date.now() - message.createdTimestamp));
        if (wsLatency === 0) wsLatency = apiLatency;

        const uptime = process.uptime();
        const d = Math.floor(uptime / 86400);
        const h = Math.floor((uptime % 86400) / 3600);
        const m = Math.floor((uptime % 3600) / 60);
        const s = Math.floor(uptime % 60);

        const mem = process.memoryUsage();
        const toMB = (b) => (b / 1024 / 1024).toFixed(2);

        const color = wsLatency < 60 ? 0x00FF00 : wsLatency < 120 ? 0xFFFF00 : 0xFF0000;
        const status = wsLatency < 60 ? '🟢 Exzellent' : wsLatency < 120 ? '🟡 Gut' : '🔴 Hoch';

        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setColor(color)
            .addFields(
                { name: '💓 WebSocket', value: `\`${wsLatency}ms\``, inline: true },
                { name: '🌐 API', value: `\`${apiLatency}ms\``, inline: true },
                { name: '📶 Status', value: status, inline: true },
                { name: '⏱️ Uptime', value: `\`${d}d ${h}h ${m}m ${s}s\``, inline: true },
                {
                    name: '💾 RAM',
                    value: `📦 Heap: \`${toMB(mem.heapUsed)} / ${toMB(mem.heapTotal)} MB\`\n🧠 RSS: \`${toMB(mem.rss)} MB\``,
                    inline: false
                }
            )
            .setFooter({ text: 'Echtzeit-Messung' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
});

// ===== HELPER (BEWERBUNG) =====
async function sendAdminLog(interaction, action, details, color = '#00FF00') {
    const logChannel = interaction.guild.channels.cache.get(config.adminLogChannelId);
    if (logChannel) {
        const embed = new EmbedBuilder()
            .setTitle(`📋 Admin Aktion: ${action}`)
            .addFields(
                { name: '👤 Admin', value: interaction.user.tag },
                { name: '📝 Details', value: details }
            )
            .setColor(color)
            .setTimestamp();
        await logChannel.send({ embeds: [embed] });
    }

    const logEntry = `[${new Date().toISOString()}] ${action} by ${interaction.user.tag}: ${details}\n`;
    const logFilePath = path.join(__dirname, 'admin_logs.txt');
    fs.appendFileSync(logFilePath, logEntry);
}

async function sendApplicationLog(interaction, role, userInfo) {
    const logEntry = `[${new Date().toISOString()}] Neue Bewerbung: ${role} von ${userInfo.tag} (${userInfo.id})\n`;
    const logFilePath = path.join(__dirname, 'application_logs.txt');
    fs.appendFileSync(logFilePath, logEntry);
}

function createEmbed() {
    return new EmbedBuilder()
        .setTitle('🎓 Bewerbungs System')
        .setDescription('Willkommen zum Bewerbungs-System.\n🛡️ Supporter\n🛡️ Moderator\n👨‍💻 Entwickler\n👑 Admin\nKlicke auf einen Button.')
        .setColor(0x5865F2)
        .setTimestamp();
}

function createButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('bewerbung_supporter')
                .setLabel('🛡️ Supporter')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('bewerbung_moderator')
                .setLabel('🛡️ Moderator')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('bewerbung_entwickler')
                .setLabel('👨‍💻 Entwickler')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('bewerbung_admin')
                .setLabel('👑 Admin')
                .setStyle(ButtonStyle.Danger)
        );
}

function formatRole(role) {
    const map = {
        'supporter': 'Supporter',
        'moderator': 'Moderator',
        'entwickler': 'Entwickler',
        'admin': 'Admin'
    };
    return map[role] || role.charAt(0).toUpperCase() + role.slice(1);
}

function createModal(role) {
    const roleName = formatRole(role);
    const modal = new ModalBuilder()
        .setCustomId(`modal_${role}`)
        .setTitle(`${roleName} Bewerbung`);

    const age = new TextInputBuilder()
        .setCustomId('age')
        .setLabel('Wie alt bist du?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const exp = new TextInputBuilder()
        .setCustomId('exp')
        .setLabel('Erfahrung')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    const why = new TextInputBuilder()
        .setCustomId('why')
        .setLabel('Warum möchtest du Teammitglied werden?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(age),
        new ActionRowBuilder().addComponents(exp),
        new ActionRowBuilder().addComponents(why)
    );

    return modal;
}

function isAdmin(member) {
    if (!member) return false;
    if (member.permissions?.has('Administrator')) return true;
    if (config.adminRoleId && member.roles?.cache?.has(config.adminRoleId)) return true;
    return false;
}

// ===== INTERACTIONS =====
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            // ===== /bewerbung =====
            if (interaction.commandName === 'bewerbung') {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({ content: '❌ Keine Rechte', ephemeral: true });
                }
                await interaction.channel.send({
                    embeds: [createEmbed()],
                    components: [createButtons()]
                });
                return interaction.reply({ content: '✅ Panel erstellt', ephemeral: true });
            }

            // ===== /bewerbungen =====
            if (interaction.commandName === 'bewerbungen') {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({ content: '❌ Keine Rechte', ephemeral: true });
                }

                if (pendingApplications.size === 0) {
                    return interaction.reply({ content: '📭 Keine offenen Bewerbungen', ephemeral: true });
                }

                let description = '';
                pendingApplications.forEach((app, id) => {
                    description += `**${id}** - ${app.role} von ${app.userTag}\n`;
                });

                const embed = new EmbedBuilder()
                    .setTitle('📋 Offene Bewerbungen')
                    .setDescription(description)
                    .setColor(0x5865F2);

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // ===== /bewerbungslog =====
            if (interaction.commandName === 'bewerbungslog') {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({ content: '❌ Keine Rechte', ephemeral: true });
                }

                const allApps = [...applications.pending, ...applications.accepted, ...applications.rejected];

                if (allApps.length === 0) {
                    return interaction.reply({ content: '📭 Keine Bewerbungen vorhanden', ephemeral: true });
                }

                allApps.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                let pendingList = applications.pending.map(a => `⏳ **${a.id}** - ${a.role} von ${a.userTag}`).join('\n') || 'Keine';
                let acceptedList = applications.accepted.map(a => `✅ **${a.id}** - ${a.role} von ${a.userTag}`).join('\n') || 'Keine';
                let rejectedList = applications.rejected.map(a => `❌ **${a.id}** - ${a.role} von ${a.userTag}`).join('\n') || 'Keine';

                const embed = new EmbedBuilder()
                    .setTitle('📊 Bewerbungs-Log')
                    .addFields(
                        { name: '⏳ Offen', value: pendingList },
                        { name: '✅ Angenommen', value: acceptedList },
                        { name: '❌ Abgelehnt', value: rejectedList }
                    )
                    .setColor(0x5865F2)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // ===== /ping =====
            if (interaction.commandName === 'ping') {
                let wsLatency = Math.max(0, Math.round(client.ws.ping));
                const apiLatency = Math.max(0, Math.round(Date.now() - interaction.createdTimestamp));
                if (wsLatency === 0) wsLatency = apiLatency;

                let shardLatency = wsLatency;
                try {
                    const shard = client.ws.shards.first();
                    if (shard && shard.ping > 0) shardLatency = Math.max(0, Math.round(shard.ping));
                } catch (e) { /* ignoriere */ }

                const uptime = process.uptime();
                const d = Math.floor(uptime / 86400);
                const h = Math.floor((uptime % 86400) / 3600);
                const m = Math.floor((uptime % 3600) / 60);
                const s = Math.floor(uptime % 60);

                const mem = process.memoryUsage();
                const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
                const heapUsed = toMB(mem.heapUsed);
                const heapTotal = toMB(mem.heapTotal);
                const rss = toMB(mem.rss);
                const external = toMB(mem.external);
                const heapPercent = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1);

                const nodeVersion = process.version;
                const platform = process.platform;
                const arch = process.arch;

                const region =
                    process.env.RENDER_REGION ||
                    process.env.RENDER_SERVICE_REGION ||
                    'Frankfurt (EU)';

                const serviceName =
                    process.env.RENDER_SERVICE_NAME ||
                    process.env.RENDER_EXTERNAL_HOSTNAME?.split('.')[0] ||
                    'unbekannt';

                const instanceType =
                    process.env.RENDER_INSTANCE_TYPE ||
                    (process.env.RENDER ? 'Render' : 'lokal');

                const color = wsLatency < 60 ? 0x00FF00 : wsLatency < 120 ? 0xFFFF00 : 0xFF0000;
                const status = wsLatency < 60 ? '🟢 Exzellent' : wsLatency < 120 ? '🟡 Gut' : '🔴 Hoch';

                const embed = new EmbedBuilder()
                    .setTitle('🏓 Pong!')
                    .setColor(color)
                    .addFields(
                        {
                            name: '📡 Latenz',
                            value:
                                `💓 WebSocket: \`${wsLatency}ms\`\n` +
                                `🌐 API: \`${apiLatency}ms\`\n` +
                                `🔗 Shard: \`${shardLatency}ms\``,
                            inline: true
                        },
                        {
                            name: '📶 Status',
                            value: `${status}\n⏱️ Uptime:\n\`${d}d ${h}h ${m}m ${s}s\``,
                            inline: true
                        },
                        {
                            name: '💾 RAM-Nutzung',
                            value:
                                `📦 Heap: \`${heapUsed} / ${heapTotal} MB\` (${heapPercent}%)\n` +
                                `🧠 RSS: \`${rss} MB\`\n` +
                                `🔌 External: \`${external} MB\``,
                            inline: false
                        },
                        {
                            name: '⚙️ System',
                            value:
                                `🟢 Node: \`${nodeVersion}\`\n` +
                                `🖥️ Platform: \`${platform} ${arch}\`\n` +
                                `📍 Region: \`${region}\`\n` +
                                `🏷️ Service: \`${serviceName}\`\n` +
                                `💠 Instance: \`${instanceType}\``,
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Echtzeit-Messung • KochSalzChemiker Bot' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // ===== /bot disconnect (OWNER ONLY) =====
            if (interaction.commandName === 'bot') {
                const subcommand = interaction.options.getSubcommand();

                if (subcommand === 'disconnect') {
                    // NUR DU darfst das
                    if (interaction.user.id !== OWNER_ID) {
                        return interaction.reply({
                            content: '❌ Nur der Bot-Owner darf diesen Befehl nutzen.',
                            ephemeral: true
                        });
                    }

                    // Bestätigen
                    await interaction.reply({
                        content: '⚠️ **Bot trennt sich in 3 Sekunden vom Server...**\nDer Log-Eintrag wird vorher gesendet.',
                        ephemeral: true
                    });

                    // Log-Eintrag VOR dem Disconnect
                    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle('⚠️ Bot-Disconnect (Test)')
                            .addFields(
                                { name: '👤 Ausgelöst von', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                { name: '📍 Server', value: interaction.guild.name, inline: true },
                                { name: '🕒 Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                            )
                            .setColor(0xFF0000)
                            .setTimestamp();
                        await logChannel.send({ embeds: [embed] }).catch(() => {});
                    }

                    // 3 Sekunden warten, dann trennen
                    setTimeout(async () => {
                        try {
                            console.log(`⚠️ Bot verlässt Guild "${interaction.guild.name}" auf Wunsch von ${interaction.user.tag}`);
                            await interaction.guild.leave();
                            console.log('✅ Bot hat Guild verlassen.');
                        } catch (err) {
                            console.error('❌ Fehler beim Verlassen:', err.message);
                        }
                    }, 3000);
                    return;
                }
            }
        }

        // ===== BEWERBUNGS-BUTTONS =====
        if (interaction.isButton() && interaction.customId.startsWith('bewerbung_')) {
            const role = interaction.customId.replace('bewerbung_', '');
            await interaction.showModal(createModal(role));
            return;
        }

        // ===== MODAL SUBMITS =====
        if (interaction.isModalSubmit()) {
            const role = interaction.customId.replace('modal_', '');
            const roleName = formatRole(role);
            const age = interaction.fields.getTextInputValue('age');
            const exp = interaction.fields.getTextInputValue('exp');
            const why = interaction.fields.getTextInputValue('why');

            const applicationId = Date.now().toString();
            const applicationData = {
                id: applicationId,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                role: roleName,
                age: age,
                exp: exp,
                why: why,
                timestamp: new Date().toISOString()
            };

            pendingApplications.set(applicationId, applicationData);
            applications.pending.push(applicationData);
            saveData();

            await sendApplicationLog(interaction, roleName, {
                tag: interaction.user.tag,
                id: interaction.user.id
            });

            const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
            const embed = new EmbedBuilder()
                .setTitle(`📝 Neue ${roleName} Bewerbung`)
                .addFields(
                    { name: '👤 User', value: interaction.user.tag },
                    { name: '🎫 ID', value: applicationId },
                    { name: '📅 Alter', value: age },
                    { name: '💼 Erfahrung', value: exp },
                    { name: '🎯 Motivation', value: why }
                )
                .setColor(0x5865F2)
                .setTimestamp();

            if (logChannel) {
                const msg = await logChannel.send({
                    embeds: [embed],
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`approve_${applicationId}`)
                                    .setLabel('✅ Annehmen')
                                    .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                    .setCustomId(`reject_${applicationId}`)
                                    .setLabel('❌ Ablehnen')
                                    .setStyle(ButtonStyle.Danger)
                            )
                    ]
                });
                applicationData.messageId = msg.id;
            }

            await interaction.reply({ content: '✅ Bewerbung gesendet!', ephemeral: true });
            return;
        }

        // ===== APPROVE / REJECT BUTTONS =====
        if (interaction.isButton() && (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_'))) {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Keine Rechte', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const appId = interaction.customId.replace('approve_', '').replace('reject_', '');
            const isApproved = interaction.customId.startsWith('approve_');
            const application = pendingApplications.get(appId);

            if (!application) {
                return interaction.editReply({ content: '❌ Bewerbung nicht gefunden' });
            }

            let roleAssigned = false;
            let roleError = null;

            if (isApproved) {
                try {
                    const member = await interaction.guild.members.fetch(application.userId);
                    const roleId = config.roleIds?.[application.role];

                    if (!roleId) {
                        roleError = `Keine Rollen-ID für "${application.role}" in config.json hinterlegt`;
                        console.error(`❌ ${roleError}`);
                    } else {
                        const role = interaction.guild.roles.cache.get(roleId);
                        if (!role) {
                            roleError = `Rolle mit ID ${roleId} nicht gefunden`;
                            console.error(`❌ ${roleError}`);
                        } else {
                            await member.roles.add(role);
                            roleAssigned = true;
                            console.log(`✅ Rolle "${role.name}" an ${application.userTag} vergeben`);
                        }
                    }
                } catch (err) {
                    roleError = err.message;
                    console.error(`❌ Rollenvergabe fehlgeschlagen:`, err);
                }
            }

            try {
                const user = await client.users.fetch(application.userId);
                if (user) {
                    const resultEmbed = new EmbedBuilder()
                        .setTitle(isApproved ? '✅ Bewerbung angenommen' : '❌ Bewerbung abgelehnt')
                        .addFields(
                            { name: 'Rolle', value: application.role },
                            { name: 'Status', value: isApproved ? 'Angenommen' : 'Abgelehnt' }
                        )
                        .setColor(isApproved ? 0x00FF00 : 0xFF0000)
                        .setTimestamp();

                    if (isApproved && roleAssigned) {
                        resultEmbed.addFields({ name: '🎉 Rolle vergeben', value: `Du hast die Rolle **${application.role}** erhalten!` });
                    } else if (isApproved && roleError) {
                        resultEmbed.addFields({ name: '⚠️ Rollenvergabe', value: 'Rolle konnte nicht automatisch vergeben werden. Ein Admin wird sich kümmern.' });
                    }

                    await user.send({ embeds: [resultEmbed] }).catch(() => {
                        console.log(`⚠️ Konnte User ${application.userTag} nicht per DM erreichen.`);
                    });
                }
            } catch (err) {
                console.log(`⚠️ User-Fetch fehlgeschlagen: ${err.message}`);
            }

            const logDetails =
                `Rolle: ${application.role}\n` +
                `User: ${application.userTag}\n` +
                `Bewerbung ID: ${appId}\n` +
                `Rollenvergabe: ${roleAssigned ? '✅ Erfolgreich' : (roleError ? `❌ ${roleError}` : '➖ Nicht zutreffend')}`;

            await sendAdminLog(
                interaction,
                isApproved ? 'Bewerbung angenommen' : 'Bewerbung abgelehnt',
                logDetails,
                isApproved ? '#00FF00' : '#FF0000'
            );

            pendingApplications.delete(appId);
            applications.pending = applications.pending.filter(a => a.id !== appId);

            if (isApproved) {
                applications.accepted.push({
                    ...application,
                    processedAt: new Date().toISOString(),
                    roleAssigned: roleAssigned,
                    roleError: roleError
                });
            } else {
                applications.rejected.push({ ...application, processedAt: new Date().toISOString() });
            }
            saveData();

            if (interaction.message) {
                await interaction.message.edit({ components: [] }).catch(() => {});
            }

            let replyText = isApproved ? '✅ Bewerbung angenommen' : '❌ Bewerbung abgelehnt';
            if (isApproved && roleAssigned) replyText += ` • Rolle **${application.role}** vergeben`;
            if (isApproved && roleError) replyText += ` • ⚠️ Rollenvergabe fehlgeschlagen: ${roleError}`;

            await interaction.editReply({ content: replyText });
            return;
        }

    } catch (error) {
        console.error('❌ Fehler in Interaction:', error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: '⚠️ Ein Fehler ist aufgetreten. Bitte versuche es später erneut.'
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content: '⚠️ Ein Fehler ist aufgetreten. Bitte versuche es später erneut.',
                    ephemeral: true
                }).catch(() => {});
            }
        } catch (replyError) {
            console.error('Konnte keine Fehlerantwort senden:', replyError);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
