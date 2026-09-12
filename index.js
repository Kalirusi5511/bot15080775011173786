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
            console.log('✅ Slash Commands registriert');
        } catch (err) {
            console.error('❌ Fehler beim Registrieren der Commands:', err);
        }
    }
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

// ===== HELPER =====
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

            // ===== /ping (ERWEITERT + OPTIMIERT v2) =====
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

        // ===== APPROVE / REJECT BUTTONS (MIT ROLLENVERGABE + DEFER) =====
        if (interaction.isButton() && (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_'))) {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Keine Rechte', ephemeral: true });
            }

            // ⚡ SOFORT BESTÄTIGEN – gibt uns 15 Minuten Zeit
            await interaction.deferReply({ ephemeral: true });

            const appId = interaction.customId.replace('approve_', '').replace('reject_', '');
            const isApproved = interaction.customId.startsWith('approve_');
            const application = pendingApplications.get(appId);

            if (!application) {
                return interaction.editReply({ content: '❌ Bewerbung nicht gefunden' });
            }

            // ===== ROLLENVERGABE =====
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

            // ===== DM AN BEWERBER =====
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

            // ===== ADMIN-LOG =====
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

            // ===== DATEN AKTUALISIEREN =====
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

            // ===== ANTWORT AN ADMIN =====
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
