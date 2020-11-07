import { startDeployment } from './deploy.js'
import dotenv from 'dotenv'
dotenv.config()

startDeployment({
	project: process.argv[2],
	baseUrl: process.env.API_BASE_URL,
	apiId: process.env.API_ID,
	auth: process.env.AUTH
})