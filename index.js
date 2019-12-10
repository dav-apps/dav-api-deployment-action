const core = require('@actions/core');
const github = require('@actions/github');
const deploy = require('./deploy');

async function run(){
	try{
		const baseUrl = core.getInput('base-url', {required: true});
		const apiId = core.getInput('api-id', {required: true});
		const auth = core.getInput('auth', {required: true});

		deploy.startDeployment({
			directory: process.env.GITHUB_WORKSPACE,
			githubUser: github.context.repo.owner,
			githubRepo: github.context.repo.repo,
			baseUrl,
			apiId,
			auth
		});
	}catch(error){
		core.setFailed(error.message);
	}
}

run();