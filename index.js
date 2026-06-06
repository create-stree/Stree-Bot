require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, EmbedBuilder, ChannelType
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel]
});

const ADMIN_ROLE_ID   = '1452998957281316945';
const LOG_CHANNEL_ID  = '1454791410627907747';
const STAFF_ROLE_ID   = '1452998957281316945';
const TICKET_CATEGORY = '╭─𒌋𒀖 TICKETS';

const tickets = new Map();
let ticketCount = 0;

client.once('ready', () => {
  console.log(`✅ Stree Bot online: ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: '🛒 Kelola Order' }],
    status: 'online',
  });
});

client.on('messageCreate', async (msg) => {
  if (msg.content !== '!setup-ticket') return;
  if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('buat_order')
      .setLabel('Purchase Premium')
      .setStyle(ButtonStyle.Success)
  );

  const embed = new EmbedBuilder()
    .setTitle('📦 Stree Bot - Premium')
    .setDescription(
      '**Welcome! Please be patient while our admin reviews your order.**\n\n' +
      '**Our team will get back to you as soon as possible. Thank you for your patience and support! 🙏**'
    )
    .setColor(0x39FF14)
    .setFooter({ text: 'Stree Bot • Premium Order System' })
    .setTimestamp();

  await msg.channel.send({ embeds: [embed], components: [row] });
  await msg.delete().catch(() => {});
});

client.on('interactionCreate', async (interaction) => {

  if (interaction.isButton() && interaction.customId === 'buat_order') {
    const modal = new ModalBuilder()
      .setCustomId('form_order')
      .setTitle('Purchase Premium — Stree Bot');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('catatan')
          .setLabel('Additional Notes')
          .setPlaceholder('Any notes for your order...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'form_order') {
    await interaction.deferReply({ ephemeral: true });

    ticketCount++;
    const ticketId = String(ticketCount).padStart(4, '0');
    const catatan  = interaction.fields.getTextInputValue('catatan') || '-';
    const user     = interaction.user;
    const guild    = interaction.guild;

    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory &&
           c.name.toLowerCase() === TICKET_CATEGORY.toLowerCase()
    );

    const channel = await guild.channels.create({
      name: `order-${ticketId}`,
      type: ChannelType.GuildText,
      parent: category ? category.id : null,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id,              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: STAFF_ROLE_ID,        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ]
    });

    tickets.set(channel.id, {
      ticketId,
      userId: user.id,
      catatan,
      status: 'pending',
      accepted: false
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Premium Order #${ticketId}`)
      .setColor(0x39FF14)
      .setDescription(
        '**Thank you for your purchase! Please be patient while our team processes your order.** \n\n' +
        '***Our admin will respond as soon as possible. We appreciate your patience!* 🙏**'
      )
      .addFields(
        { name: '👤 User',  value: `<@${user.id}>` },
        { name: '📝 Notes', value: catatan },
      )
      .setFooter({ text: 'Stree Bot • Order Premium' })
      .setTimestamp();

    const staffRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`terima_${channel.id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`proses_${channel.id}`).setLabel('⏳ Processing').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tolak_${channel.id}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
    );

    await channel.send({
      content: `<@&${STAFF_ROLE_ID}> New premium order incoming!`,
      embeds: [embed],
      components: [staffRow]
    });

    await interaction.editReply({
      content: `✅ Your order has been created at ${channel}!\nPlease wait while our team processes your request.`
    });
    return;
  }

  if (interaction.isButton()) {
    const parts     = interaction.customId.split('_');
    const aksi      = parts[0];
    const channelId = parts[1];

    if (!['terima', 'proses', 'tolak'].includes(aksi)) return;

    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
      return interaction.reply({
        content: '❌ Only **Team Staff** can manage orders!',
        ephemeral: true
      });
    }

    const ticket = tickets.get(channelId);
    if (!ticket) return interaction.reply({ content: 'Ticket data not found.', ephemeral: true });

    if (aksi === 'terima' && ticket.accepted) {
      return interaction.reply({
        content: '❌ This order has already been accepted!',
        ephemeral: true
      });
    }

    if (aksi === 'terima') ticket.accepted = true;
    ticket.status = aksi;

    const statusMap = {
      terima: { label: '✅ Accepted',   color: 0x39FF14, emoji: '✅' },
      proses: { label: '⏳ Processing', color: 0x5865F2, emoji: '⏳' },
      tolak:  { label: '❌ Declined',   color: 0xED4245, emoji: '❌' },
    };

    const info = statusMap[aksi];

    await interaction.reply({
      content: `${info.emoji} Order **#${ticket.ticketId}** has been marked as **${info.label}** by <@${interaction.user.id}>`,
    });

    const userObj = await client.users.fetch(ticket.userId);
    await userObj.send(
      `📬 **Stree Bot** — Your order update!\n` +
      `Order **#${ticket.ticketId}** status: **${info.label}**`
    ).catch(() => {});

    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      await logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(info.color)
          .setTitle(`${info.emoji} Order #${ticket.ticketId} — ${info.label}`)
          .addFields(
            { name: 'User',  value: `<@${ticket.userId}>` },
            { name: 'Notes', value: ticket.catatan },
            { name: 'Staff', value: `<@${interaction.user.id}>` }
          )
          .setFooter({ text: 'Stree Bot • Premium Order System' })
          .setTimestamp()
        ]
      });
    }

    if (aksi === 'tolak') {
      await interaction.channel.send('⚠️ This channel will be deleted in 10 seconds...');
      setTimeout(() => interaction.channel.delete().catch(() => {}), 10_000);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
