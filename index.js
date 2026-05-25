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

        console.log('✅ Slash Command registriert');
    }
});

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

client.on(Events.InteractionCreate, async interaction => {

    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === 'bewerbung') {

            if (!interaction.member.permissions.has('Administrator')) {

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
    }

    if (interaction.isButton()) {

        const role = interaction.customId.replace('bewerbung_', '');

        await interaction.showModal(
            createModal(role)
        );
    }

    if (interaction.isModalSubmit()) {

        const role = interaction.customId.replace('modal_', '');

        const age = interaction.fields.getTextInputValue('age');
        const exp = interaction.fields.getTextInputValue('exp');
        const why = interaction.fields.getTextInputValue('why');

        const logChannel = interaction.guild.channels.cache.get(
            config.logChannelId
        );

        const embed = new EmbedBuilder()
            .setTitle(`📝 Neue ${role} Bewerbung`)
            .addFields(
                {
                    name: '👤 User',
                    value: interaction.user.tag
                },
                {
                    name: '📅 Alter',
                    value: age
                },
                {
                    name: '💼 Erfahrung',
                    value: exp
                },
                {
                    name: '🎯 Motivation',
                    value: why
                }
            )
            .setColor(0x5865F2)
            .setTimestamp();

        if (logChannel) {

            await logChannel.send({
                embeds: [embed]
            });
        }

        await interaction.reply({
            content: '✅ Bewerbung gesendet!',
            ephemeral: true
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
