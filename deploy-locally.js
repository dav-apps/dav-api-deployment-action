const deploy = require('./deploy');
require('dotenv').config();

deploy.startDeployment({
	githubUser: process.argv[2],
	githubRepo: process.argv[3],
	baseUrl: process.env.API_BASE_URL,
	apiId: process.env.API_ID,
	auth: process.env.AUTH
});