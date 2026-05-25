require('dotenv').config();
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

// Daten speichern
const dataFilePath = path.join(__dirname, 'applications.json');

// Daten laden oder neu erstellen
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

// Initial laden
loadData();

// Map für schnellen Zugriff
const pendingApplications = new Map();
applications.pending.forEach(app => {
    pendingApplications.set(app.id, app);
});

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
        console.log('✅ Slash Commands registriert');
    }
});

// Admin-Log Funktion (Discord Channel + Datei)
async function sendAdminLog(interaction, action, details, color = '#00FF00') {
    // Discord Channel Log
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
    
    // Datei-Log
    const logEntry = `[${new Date().toISOString()}] ${action} by ${interaction.user.tag}: ${details}\n`;
    const logFilePath = path.join(__dirname, 'admin_logs.txt');
    fs.appendFileSync(logFilePath, logEntry);
}

// Admin-Log Funktion für neue Bewerbungen
async function sendApplicationLog(interaction, role, userInfo) {
    const logEntry = `[${new Date().toISOString()}] Neue Bewerbung: ${role} von ${userInfo.tag} (${userInfo.id})\n`;
    const logFilePath = path.join(__dirname, 'application_logs.txt');
    fs.appendFileSync(logFilePath, logEntry);
}

function createEmbed() {
    return new EmbedBuilder()
        .setTitle('🎓 Bewerbungs System')
        .setDescription(`
Willkommen zum Bewerbungs-System.
🛡️ Supporter
🛡️ Moderator
👑 Admin
Klicke auf einen Button.
        `)
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
                .setCustomId('bewerbung_admin')
                .setLabel('👑 Admin')
                .setStyle(ButtonStyle.Danger)
        );
}

function createModal(role) {
    const modal = new ModalBuilder()
        .setCustomId(`modal_${role}`)
        .setTitle(`${role} Bewerbung`);
    
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

// Helper: Prüfe Admin
function isAdmin(member) {
    return member.permissions.has('Administrator') || 
           member.roles.cache.has(config.adminRoleId);
}

client.on(Events.InteractionCreate, async interaction => {
    // /bewerbung Panel erstellen
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'bewerbung') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({
                    content: '❌ Keine Rechte',
                    ephemeral: true
                });
            }
            await interaction.channel.send({
                embeds: [createEmbed()],
                components: [createButtons()]
            });
            return interaction.reply({
                content: '✅ Panel erstellt',
                ephemeral: true
            });
        }
        
        // /bewerbungen - Zeige offene Bewerbungen (Admin)
        if (interaction.commandName === 'bewerbungen') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({
                    content: '❌ Keine Rechte',
                    ephemeral: true
                });
            }
            
            if (pendingApplications.size === 0) {
                return interaction.reply({
                    content: '📭 Keine offenen Bewerbungen',
                    ephemeral: true
                });
            }
            
            let description = '';
            pendingApplications.forEach((app, id) => {
                description += `**${id}** - ${app.role} von ${app.userTag}\n`;
            });
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Offene Bewerbungen')
                .setDescription(description)
                .setColor(0x5865F2);
            
            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }
        
        // /bewerbungslog - Zeige alle Bewerbungen (Admin)
        if (interaction.commandName === 'bewerbungslog') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({
                    content: '❌ Keine Rechte',
                    ephemeral: true
                });
            }
            
            const allApps = [...applications.pending, ...applications.accepted, ...applications.rejected];
            
            if (allApps.length === 0) {
                return interaction.reply({
                    content: '📭 Keine Bewerbungen vorhanden',
                    ephemeral: true
                });
            }
            
            // Sortieren nach Datum (neueste zuerst)
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
            
            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }
    }
    
    // Button Klicks - Modal anzeigen
    if (interaction.isButton() && interaction.customId.startsWith('bewerbung_')) {
        const role = interaction.customId.replace('bewerbung_', '');
        await interaction.showModal(createModal(role));
    }
    
    // Modal einreichen
    if (interaction.isModalSubmit()) {
        const role = interaction.customId.replace('modal_', '');
        const age = interaction.fields.getTextInputValue('age');
        const exp = interaction.fields.getTextInputValue('exp');
        const why = interaction.fields.getTextInputValue('why');
        
        const applicationId = Date.now().toString();
        const applicationData = {
            id: applicationId,
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            role: role,
            age: age,
            exp: exp,
            why: why,
            timestamp: new Date().toISOString()
        };
        
        // Speichern
        pendingApplications.set(applicationId, applicationData);
        applications.pending.push(applicationData);
        saveData();
        
        // Application Log (Datei)
        await sendApplicationLog(interaction, role, {
            tag: interaction.user.tag,
            id: interaction.user.id
        });
        
        // Log Channel für neue Bewerbungen
        const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
        const embed = new EmbedBuilder()
            .setTitle(`📝 Neue ${role} Bewerbung`)
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
            );
            applicationData.messageId = msg.id;
        }
        
        await interaction.reply({
            content: '✅ Bewerbung gesendet!',
            ephemeral: true
        });
    }
    
    // Admin: Bewerbung annehmen oder ablehnen
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_')) {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({
                    content: '❌ Keine Rechte',
                    ephemeral: true
                });
            }
            
            const appId = interaction.customId.replace('approve_', '').replace('reject_', '');
            const isApproved = interaction.customId.startsWith('approve_');
            const application = pendingApplications.get(appId);
            
            if (!application) {
                return interaction.reply({
                    content: '❌ Bewerbung nicht gefunden',
                    ephemeral: true
                });
            }
            
            // User informieren
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
                await user.send({ embeds: [resultEmbed] });
            }
            
            // ADMIN LOG senden
            await sendAdminLog(
                interaction,
                isApproved ? 'Bewerbung angenommen' : 'Bewerbung abgelehnt',
                `Rolle: ${application.role}\nUser: ${application.userTag}\nBewerbung ID: ${appId}`,
                isApproved ? '#00FF00' : '#FF0000'
            );
            
            // In Datenbank verschieben
            pendingApplications.delete(appId);
            applications.pending = applications.pending.filter(a => a.id !== appId);
            
            if (isApproved) {
                applications.accepted.push({ ...application, processedAt: new Date().toISOString() });
            } else {
                applications.rejected.push({ ...application, processedAt: new Date().toISOString() });
            }
            saveData();
            
            // Nachricht deaktivieren
            await interaction.message.edit({
                components: []
            });
            
            await interaction.reply({
                content: isApproved ? '✅ Bewerbung angenommen' : '❌ Bewerbung abgelehnt',
                ephemeral: true
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
