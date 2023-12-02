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
	
		const largest_marble = Math.max(...this.marbles);
		
		if (faces < this.marbles.length) {
			this.marbles = this.marbles.slice(0, faces);
		} else {
			this.marbles = Array.from({ length: faces }, (_, index) => index < this.marbles.length ? this.marbles[index] : largest_marble);
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

    // Create a flat array with marble indices based on their count
    const bag = [];
    this.marbles.forEach((count, i) => {
        for (let j = 0; j < count; j++) {
            bag.push(i);
        }
    });

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
		const category = interaction.channel.parent.name;
		const regex = /━━━\[ SoT Alliance \d+ \]━━━/i;
		if (!regex.test(category)) return await interaction.reply('You must be in an alliance channel to use this command!');
		const server_number = category.match(/\d+/)[0];
	
		if (!dices.has(server_number)) dices.set(server_number, new KarmicDice(4, 5));
		const dice = dices.get(server_number);
	
		const multiplier = interaction.options.getInteger('multiplier');
		const active_ships = await getActiveShipChannels(interaction.channel.parent);
	
		if (!active_ships) return await interaction.reply('Failed to retrieve active ships.');
	
		const faces = active_ships.size - 1;
	
		if (faces < 1) return await interaction.reply('There are not enough active ships to roll!');
	
		dice.setFaces(faces);
		if (multiplier) dice.setMultiplier(multiplier);
	
		const roll = dice.roll() + 1;
	
		const children = interaction.channel.parent.children.cache.filter(channel => channel.type == 2);
		const sorted_children = Array.from(children).sort((a, b) => a.position - b.position);
		const voice_channel = sorted_children[roll - 1];

		if (!voice_channel || voice_channel.type !== 'GUILD_VOICE') {
			console.error(`Error: Voice channel is not a valid voice channel.`);
			console.log(`Sorted Children:`, sorted_children);
			console.log(`Roll:`, roll);
			console.log(`Voice Channel:`, voice_channel);
			return await interaction.reply('Failed to retrieve a valid voice channel.');
		}
		
		console.log(`Server ${server_number} rolled a ${roll} - ${voice_channel.name} (${voice_channel.id}), ${faces} faces, ${multiplier || 4}x multiplier, ${dice.marbles}, ${dice.last_roll}, ${dice.previous_roll}`);
		
		await interaction.reply(`**${voice_channel.name} won the Skull of Siren Song!**\nDo you wish to embark on the quest, or would you like to roll for another crew?`);
		
		const members = voice_channel.members.map(member => member.user);
		const mention = members.map(user => user.toString()).join(' ');
		
		if (mention.length > 2000) return interaction.followUp('Too many members in the channel to mention!');
		
		interaction.followUp(mention).then(ping => setTimeout(() => ping.delete(), 1000));
		
	}	
};