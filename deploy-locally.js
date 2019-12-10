const deploy = require('./deploy');
require('dotenv').config();

deploy.startDeployment(process.argv[2], {
	baseUrl: process.env.API_BASE_URL,
	apiId: process.env.API_ID,
	auth: process.env.AUTH
});