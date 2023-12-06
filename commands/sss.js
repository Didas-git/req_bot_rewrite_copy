const { SlashCommandBuilder } = require('discord.js');
const redis = require('../modules/redis.js');

class KarmicDice {
    constructor(faces = 4, multiplier = 2) {
        this.marbles = Array(faces).fill(1);
        this.extra_marbles = multiplier - 1;
		this.previous_roll = -1
        this.last_roll = -1;
    }

	setFaces(faces) {
		if (this.marbles.length === faces) return;
	
		if (faces < this.marbles.length) {
			this.marbles = this.marbles.slice(0, faces);
		} else {
			const largest_marble = Math.max(...this.marbles);
			this.marbles = this.marbles.concat(Array(faces - this.marbles.length).fill(largest_marble));
		}
	}
	

    setMultiplier(multiplier) {
        this.extra_marbles = multiplier - 1;
    }

    roll() {
        this.marbles.forEach((_, i) => {
            if (i !== this.last_roll && this.last_roll > -1) this.marbles[i] += this.extra_marbles;
			if (i === this.previous_roll) this.marbles[i] -= Math.floor(this.extra_marbles / 2);
			if (this.marbles[i] < 1) this.marbles[i] = 1;
        });

        const bag = this.marbles.reduce((acc, cur, i) => acc.concat(Array(cur).fill(i)), []);
        const roll = bag[Math.floor(Math.random() * bag.length)];

        if (roll !== this.last_roll) {
            this.marbles = this.marbles.map(() => 1);
            this.marbles[roll] = 1;
        }

		this.previous_roll = this.last_roll;
        this.last_roll = roll;
        return roll;
    }
}

async function getServerShipChannels(category) {
	return category.children.cache.filter(channel => channel.name.startsWith(`${category.server_number}-`) && !channel.name.toLowerCase().endsWith('situation room') && !channel.name.toLowerCase().includes('fotd'));
}

async function getActiveShipChannels(category) {
	return await getServerShipChannels(category).then(ship_channels => ship_channels.filter(channel => channel.name.match(/-(\w{1,3})]/i)?.length > 1));
}

const dices = new Map();
module.exports = {
	data: new SlashCommandBuilder()
		.setName('sss')
		.setDescription('Rolls a karmic dice!'),

	async permission(interaction, client) {
		console.log(await redis.GET('state:alliance_locked'));
		console.log(await redis.EXISTS('state:alliance_locked'));
		return;
		interaction.server_locked = await redis.GET('state:alliance_locked').then(returnedState => Number(returnedState)) ?? true;
		console.log(interaction.server_locked);
		console.log(!interaction_server_locked);
		if (!interaction.server_locked) return true;

		const isOwner = client.config.OWNERS.includes(interaction.user.id);
		const isManager = interaction.member.roles.cache.some(role => client.config.MANAGER_ROLE_NAMES.includes(role.name));
		const isSupervisor = interaction.member.roles.cache.some(role => client.config.SUPERVISOR_ROLE_NAMES.includes(role.name));
		const isStaff = interaction.member.roles.cache.some(role => client.config.STAFF_ROLE_NAMES.includes(role.name));

		return isOwner || isManager || isSupervisor || isStaff;
	},

	async execute(interaction) {
		return;
		const category = interaction.channel.parent;
		const regex = /━━━\[ SoT Alliance \d+ \]━━━/i;
		if (!regex.test(category.name)) return await interaction.reply('You must be in an alliance channel to use this command!');
		const server_number = category.name.match(/\d+/)[0];
	
		const children = await getActiveShipChannels(category);
		const sorted_children = children.sort((a, b) => a.position - b.position);
	
		if (!sorted_children.size) return await interaction.reply('There are no eligible ships in this server!');
		if (sorted_children.size == 1) return await interaction.reply('There is only one eligible ship in this server!');
	
		if (!dices.has(server_number)) dices.set(server_number, new KarmicDice(sorted_children.size, 5));
		const dice = dices.get(server_number);
	
		dice.setFaces(sorted_children.size);
	
		const roll = dice.roll() + 1;
		const voice_channel = sorted_children.get(sorted_children.map(channel => channel.id)[roll - 1]);
	
		await interaction.reply(`**${voice_channel} won the Skull of Siren Song!**\nDo you wish to embark on the quest, or should we roll for another crew?`);
		if (!interaction.server_locked) return;
		const mention = voice_channel.members.map(member => `<@${member.id}>`).join(' ');
		if (mention) await interaction.followUp(mention).then(msg => setTimeout(() => msg.delete(), 1000));
	}
};