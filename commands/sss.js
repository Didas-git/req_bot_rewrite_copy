const { SlashCommandBuilder } = require('discord.js');

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
	return category.children.cache.filter(channel => channel.name.startsWith(`${category.server_number}-`) && !channel.name.toLowerCase().endsWith('situation room'));
}

async function getActiveShipChannels(category) {
	return await getServerShipChannels(category).then(ship_channels => ship_channels.filter(channel => channel.name.match(/-(\w{1,3})]/i)?.length > 1));
}

const dices = new Map();
module.exports = {
	data: new SlashCommandBuilder()
		.setName('sss')
		.setDescription('Rolls a karmic dice!')
		.addIntegerOption(option => option
			.setName('multiplier')
			.setDescription('How many extra marbles to add')
			.setRequired(false),
		),

	permission(interaction, client) {
		const isOwner = client.config.OWNERS.includes(interaction.user.id);
		const isManager = interaction.member.roles.cache.some(role => client.config.MANAGER_ROLE_NAMES.includes(role.name));
		const isSupervisor = interaction.member.roles.cache.some(role => client.config.SUPERVISOR_ROLE_NAMES.includes(role.name));
		const isStaff = interaction.member.roles.cache.some(role => client.config.STAFF_ROLE_NAMES.includes(role.name));

		return isOwner || isManager || isSupervisor || isStaff;
	},

	async execute(interaction) {
		const category = interaction.channel.parent;
		const regex = /━━━\[ SoT Alliance \d+ \]━━━/i;
		if (!regex.test(category.name)) return await interaction.reply('You must be in an alliance channel to use this command!');
		const server_number = category.name.match(/\d+/)[0];

		if (!dices.has(server_number)) dices.set(server_number, new KarmicDice(4, 5));
		const dice = dices.get(server_number);

		const faces = 4;
		const multiplier = interaction.options.getInteger('multiplier');

		dice.setFaces(faces);
		if (multiplier) dice.setMultiplier(multiplier);

		const roll = dice.roll() + 1;
		const children = getActiveShipChannels(category);
		const sorted_children = children.sort((a, b) => a.position - b.position);
		const voice_channel = sorted_children.get(Array.from(sorted_children.keys())[roll]);
		console.log(sorted_children.map(channel => channel.name));

		console.log(`Server ${server_number} rolled a ${roll} - ${voice_channel}, ${faces} faces, ${multiplier || 4}x multiplier, ${dice.marbles}, ${dice.last_roll}, ${dice.previous_roll}`)

		await interaction.reply(`**${voice_channel} won the Skull of Siren Song!**\nDo you wish to embark on the quest, or would you like to pass it on to another crew?`);
	},
};