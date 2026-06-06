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

const ADMIN_ROLE_ID  = '1453337422292193311';
const LOG_CHANNEL_ID = '1454791410627907747';

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
      .setLabel('🛒 Buat Order')
      .setStyle(ButtonStyle.Primary)
  );

  const embed = new EmbedBuilder()
    .setTitle('📦 Stree Bot — Sistem Order')
    .setDescription('Klik tombol di bawah untuk membuat order baru.\nTim kami akan segera memproses pesananmu!')
    .setColor(0x5865F2)
    .setFooter({ text: 'Stree Bot • Sistem Ticket Order' })
    .setTimestamp();

  await msg.channel.send({ embeds: [embed], components: [row] });
  await msg.delete().catch(() => {});
});

client.on('interactionCreate', async (interaction) => {

  if (interaction.isButton() && interaction.customId === 'buat_order') {
    const modal = new ModalBuilder()
      .setCustomId('form_order')
      .setTitle('📝 Form Order — Stree Bot');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nama_produk')
          .setLabel('Nama Produk / Layanan')
          .setPlaceholder('Contoh: Jasa desain logo')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('jumlah')
          .setLabel('Jumlah')
          .setPlaceholder('Contoh: 2')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('catatan')
          .setLabel('Catatan Tambahan')
          .setPlaceholder('Warna, ukuran, referensi, dll...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'form_order') {
    await interaction.deferReply({ ephemeral: true });

    ticketCount++;
    const ticketId   = String(ticketCount).padStart(4, '0');
    const namaProduk = interaction.fields.getTextInputValue('nama_produk');
    const jumlah     = interaction.fields.getTextInputValue('jumlah');
    const catatan    = interaction.fields.getTextInputValue('catatan') || '-';
    const user       = interaction.user;
    const guild      = interaction.guild;

    const channel = await guild.channels.create({
      name: `order-${ticketId}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id,              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: ADMIN_ROLE_ID,        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ]
    });

    tickets.set(channel.id, { ticketId, userId: user.id, namaProduk, jumlah, catatan, status: 'pending' });

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Order #${ticketId} — Stree Bot`)
      .setColor(0xFEE75C)
      .addFields(
        { name: '🛒 Produk',  value: namaProduk, inline: true },
        { name: '🔢 Jumlah',  value: jumlah,     inline: true },
        { name: '📝 Catatan', value: catatan },
        { name: '👤 User',    value: `<@${user.id}>` },
        { name: '📊 Status',  value: '⏳ Menunggu konfirmasi admin' }
      )
      .setFooter({ text: 'Stree Bot • Sistem Ticket Order' })
      .setTimestamp();

    const adminRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`terima_${channel.id}`).setLabel('✅ Terima').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`proses_${channel.id}`).setLabel('🔄 Proses').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tolak_${channel.id}`).setLabel('❌ Tolak').setStyle(ButtonStyle.Danger),
    );

    await channel.send({
      content: `<@&${ADMIN_ROLE_ID}> Ada order baru masuk!`,
      embeds: [embed],
      components: [adminRow]
    });

    await interaction.editReply({
      content: `✅ Order kamu berhasil dibuat di ${channel}!\nTim **Stree Bot** akan segera memproses pesananmu.`
    });
    return;
  }

  if (interaction.isButton()) {
    const parts     = interaction.customId.split('_');
    const aksi      = parts[0];
    const channelId = parts[1];

    if (!['terima', 'proses', 'tolak'].includes(aksi)) return;

    const ticket = tickets.get(channelId);
    if (!ticket) return interaction.reply({ content: 'Data ticket tidak ditemukan.', ephemeral: true });

    const statusMap = {
      terima: { label: '✅ Diterima', color: 0x57F287, emoji: '✅' },
      proses: { label: '🔄 Diproses', color: 0x5865F2, emoji: '🔄' },
      tolak:  { label: '❌ Ditolak',  color: 0xED4245, emoji: '❌' },
    };

    const info = statusMap[aksi];
    ticket.status = aksi;

    await interaction.reply({
      content: `${info.emoji} Status order **#${ticket.ticketId}** diubah ke **${info.label}** oleh <@${interaction.user.id}>`,
    });

    const userObj = await client.users.fetch(ticket.userId);
    await userObj.send(
      `📬 **Stree Bot** — Update order kamu!\n` +
      `Order **#${ticket.ticketId}** (${ticket.namaProduk}) sekarang: **${info.label}**`
    ).catch(() => {});

    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      await logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(info.color)
          .setTitle(`${info.emoji} Order #${ticket.ticketId} — ${info.label}`)
          .addFields(
            { name: 'Produk', value: ticket.namaProduk, inline: true },
            { name: 'Jumlah', value: ticket.jumlah,     inline: true },
            { name: 'Admin',  value: `<@${interaction.user.id}>` }
          )
          .setFooter({ text: 'Stree Bot • Sistem Ticket Order' })
          .setTimestamp()
        ]
      });
    }

    if (aksi === 'tolak') {
      await interaction.channel.send('⚠️ Channel ini akan dihapus dalam 10 detik...');
      setTimeout(() => interaction.channel.delete().catch(() => {}), 10_000);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
