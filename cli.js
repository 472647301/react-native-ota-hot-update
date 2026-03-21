#!/usr/bin/env node

'use strict';

const { run } = require('./cli/run');

run(process.argv).catch((mainError) => {
	const message = mainError && mainError.message ? mainError.message : String(mainError);
	console.error(message);
	process.exit(1);
});

