const { SlashCommandBuilder } = require('discord.js');

class KarmicDice {
    constructor(faces = 4, multiplier = 2) {
        this.marbles = Array(faces).fill(1);
        this.extra_marbles = multiplier - 1;
        this.last_roll = -1;
    }

    setFaces(faces) {
        const largest_marble = Math.max(...this.marbles);
        this.marbles = this.marbles.slice(0, faces).concat(Array(faces - this.marbles.length).fill(largest_marble));
    }

    setMultiplier(multiplier) {
        this.extra_marbles = multiplier - 1;
    }

    roll() {
        this.marbles.forEach((_, i) => {
            if (i !== this.last_roll && this.last_roll > -1) this.marbles[i] += this.extra_marbles;
        });

        const bag = this.marbles.reduce((acc, cur, i) => acc.concat(Array(cur).fill(i)), []);
        const roll = bag[Math.floor(Math.random() * bag.length)];

        if (roll !== this.last_roll) {
            this.marbles = this.marbles.map(() => 1);
            this.marbles[roll] = 1;
        }

        this.last_roll = roll;
        return roll;
    }
}

let dice;
module.exports = {
	data: new SlashCommandBuilder()
		.setName('karmic')
		.setDescription('Rolls a karmic dice!')
		.addIntegerOption(option => option
			.setName('faces')
			.setDescription('How many faces the dice has')
			.setRequired(true),
		)
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
		if (!dice) dice = new KarmicDice(4, 5);
		const faces = interaction.options.getInteger('faces');
		const multiplier = interaction.options.getInteger('multiplier') || 2;

		dice.setFaces(faces);
		dice.setMultiplier(multiplier);

		await interaction.reply(`You rolled a ${dice.roll() + 1}!`);
	},
};