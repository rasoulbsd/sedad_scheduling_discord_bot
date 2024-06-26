const { connectToDB, saveRoutine, saveRoutineSlot, getRoutinesByChannel, deleteRoutine, updateRoutine } = require('../scripts/database');
const { ephemeralWarning } = require('../utils/renderMessage');
const { createDaySlots } = require('../utils/routineHelper');
const { getFriendlyRoutineName, buildThreadContent } = require('../utils/format');

async function initialCheck(interaction, responseUrl) {
	if (!responseUrl) {
		return;
	}

	const { guild, member } = interaction;
	if (!guild || !member) {
		await ephemeralWarning(interaction, 'This command can\'t be used in DMs.');
		throw new Error('This command can\'t be used in DMs.');
	}

	return guild;
}

const listHandler = async (client, interaction, responseUrl) => {
	await initialCheck(interaction, responseUrl);
	const { guild } = interaction;

	const dbo = await connectToDB();

	let messageContent = '';
	try {
		const routines = await getRoutinesByChannel(dbo, guild.name.replaceAll(' ', '-'), interaction.channelId);
		if (routines.length > 0) {
			messageContent = routines;
		}
		else {
			messageContent = 'No routine found in this channel.';
		}
	}
	catch (err) {
		console.error('Error processing routine:', err);
		messageContent = `An error occurred: ${err.message}`;
	}
	finally {
		await dbo.close();
	}

	await interaction.reply({ content: messageContent, ephemeral: true });
};

const deleteHandler = async (client, interaction, responseUrl) => {
	await initialCheck(interaction, responseUrl);
	const { guild } = interaction;

	const routine_id = interaction.options.getString('routine_id');

	const dbo = await connectToDB();

	let messageContent = '';
	try {
		const result = await deleteRoutine(dbo, guild.name.replaceAll(' ', '-'), interaction.channelId, parseInt(routine_id));
		if (result) {
			messageContent = `The routine with ID ${routine_id} has been deleted.`;
		}
		else {
			messageContent = 'No routines found in this channel for this ID';
		}
	}
	catch (err) {
		console.error('Error processing routine:', err);
		messageContent = `An error occurred: ${err.message}`;
	}
	finally {
		await dbo.close();
	}

	await interaction.reply({ content: messageContent, ephemeral: true });
};

const updateHandler = async (client, interaction) => {
	const { guild, member } = interaction;

	// Initial check and database connection
	await initialCheck(interaction);
	const dbo = await connectToDB();

	const routine_id = interaction.options.getString('routine_id');
	const routineOptions = interaction.options.getString('routine');
	const timeOptions = interaction.options.getString('time');
	const timezoneOptions = interaction.options.getString('timezone');
	const roleOptions = interaction.options.getString('role');
	const contextOptions = interaction.options.getString('context');
	const scheduler = member.id;

	try {
		// Update routine in the database
		const result = await updateRoutine(dbo, guild.name.replaceAll(' ', '-').toLowerCase(), interaction.channelId, parseInt(routine_id), {
			routine: routineOptions,
			time: timeOptions,
			timezone: timezoneOptions,
			role: roleOptions,
			context: contextOptions,
			scheduler,
		});

		if (result.modifiedCount > 0) {
			await interaction.reply({ content: 'Routine updated successfully.', ephemeral: true });
		}
		else {
			await interaction.reply({ content: `No routines found with ID ${routine_id} or no update needed.`, ephemeral: true });
		}
	}
	catch (error) {
		console.error(`Error updating routine: ${error}`);
		await interaction.reply({ content: `Error updating routine: ${error.message}`, ephemeral: true });
	}
	finally {
		dbo.close();
	}
};


const createHandler = async (client, interaction, responseUrl) => {
	if (!responseUrl) {
		return;
	}

	const { guild, member } = interaction;
	if (!guild || !member) {
		await ephemeralWarning(interaction, 'This command can\'t be used in DMs.');
		return;
	}

	const routineOptions = interaction.options.getString('routine');
	const timeOptions = interaction.options.getString('time');
	const timezoneOptions = interaction.options.getString('timezone') || 'UTC';
	const roleOptions = interaction.options.getString('role');
	const contextOptions = interaction.options.getString('context');

	if (!routineOptions || !timeOptions) {
		await ephemeralWarning(interaction, 'Please ensure all required fields are selected.');
		return;
	}

	const threadContent = buildThreadContent(contextOptions, roleOptions);

	const dbo = await connectToDB();

	try {
		const slots = await createDaySlots(routineOptions, timeOptions, timezoneOptions);

		const server = guild.name.replaceAll(' ', '-');
		const channel = interaction.channelId;
		const scheduler = member.id;

		const routine_id = await saveRoutine(dbo, server, channel, scheduler, routineOptions, timeOptions, timezoneOptions, roleOptions, threadContent);

		for (const slot of slots) {
			await saveRoutineSlot(dbo, server, channel, {
				routine_id,
				name: `${slot[1]} Async Daily`,
				date: {
					day: slot[0],
					year: slot[1],
					hour: slot[2],
					minute: slot[3],
				},
				role: roleOptions,
				scheduler,
				threadContent,
				discord: {
					guild: guild,
					server_id: guild.id,
					channelId: interaction.channelId,
					message: responseUrl,
				},
			});
		}

		await interaction.followUp({
			content: `Routine scheduled successfully: \nID: ${routine_id}\n${getFriendlyRoutineName(routineOptions)} - ${timeOptions}:00 ${timezoneOptions}`,
			ephemeral: true,
		});
	}
	catch (error) {
		console.error(`Error scheduling routine: ${error.message}`);
		await ephemeralWarning(interaction, `There was an issue scheduling your routine. ${error.message}`);
	}

	await dbo.close();
};


module.exports = { createHandler, listHandler, deleteHandler, updateHandler };
