import core from "@actions/core"
import github from "@actions/github"
import { startDeployment } from "./deploy.js"

async function run() {
	try {
		const baseUrl = core.getInput("base-url", { required: true })
		const apiId = core.getInput("api-id", { required: true })
		const auth = core.getInput("auth", { required: true })
		const branch = core.getInput("branch", { required: true })

		startDeployment({
			production: true,
			directory: process.env.GITHUB_WORKSPACE,
			githubUser: github.context.repo.owner,
			githubRepo: github.context.repo.repo,
			baseUrl,
			apiId,
			auth,
			branch
		})
	} catch (error) {
		core.setFailed(error.message)
	}
}

run()
