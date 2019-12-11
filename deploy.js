const path = require('path');
const fs = require('fs');
const axios = require('axios');
var clone = require('git-clone');

async function startDeployment(options){
	// Clone the repository
	var directoryName = "repository";
	var requestedDir;
	var deleteRepo = false;

	if(options.githubUser && options.githubRepo){
		var clonePromise = new Promise((resolve) => {
			clone(`https://github.com/${options.githubUser}/${options.githubRepo}`, directoryName, {}, (error) => {
				resolve(error);
			});
		});

		let error = await clonePromise;
		if(error) throw error;

		requestedDir = options.directory ? path.resolve(options.directory, directoryName) : path.resolve(__dirname, directoryName);
		deleteRepo = true;
	}else{
		requestedDir = path.resolve(__dirname, options.project);
	}

	var dirs = fs.readdirSync(requestedDir);

	for(let dir of dirs){
		if(dir[0] == '.') continue;
		await scanPath(path.resolve(requestedDir, dir), options);
	}

	if(deleteRepo){
		// Delete the cloned repository
		fs.rmdirSync(requestedDir, {recursive: true});
	}
}

async function scanPath(parent, options) {
	var dirs = fs.readdirSync(parent);
	var files = [];

	for(let dir of dirs){
		if(dir[0] == '.') continue;

		var fullPath = path.resolve(parent, dir);
		if(fs.statSync(fullPath).isDirectory()){
			await scanPath(fullPath, options);
		}else{
			// Add the file to the files array
			files.push(dir);
		}
	}

	// Find a file with json
	jsonFile = files.find((filename) => filename.split('.').pop() == "json");

	if(jsonFile){
		// Get the dx file
		dxFile = files.find((filename) => filename.split('.').pop() == "dx");

		// Read the json and the dx file
		var json = JSON.parse(fs.readFileSync(path.resolve(parent, jsonFile)));
		var commands = fs.readFileSync(path.resolve(parent, dxFile), {encoding: 'utf8'});
		
		if(json.type == "endpoint"){
			// Create or update the endpoint on the server
			try{
				await axios.default({
					url: `${options.baseUrl}/api/${options.apiId}/endpoint`,
					method: 'put',
					headers: {
						Authorization: options.auth,
						'Content-Type': 'application/json'
					},
					data: {
						path: json.path,
						method: json.method,
						commands
					}
				});
			}catch(error){
				if(error.response){
					console.log(error.response.data.errors);
				}else{
					console.log(error);
				}
			}
		}else if(json.type == "function"){
			// Create or update the function on the server
			try{
				await axios.default({
					url: `${options.baseUrl}/api/${options.apiId}/function`,
					method: 'put',
					headers: {
						Authorization: options.auth,
						'Content-Type': 'application/json'
					},
					data: {
						name: json.name,
						params: json.params.join(','),
						commands
					}
				});
			}catch(error){
				if(error.response){
					console.log(error.response.data.errors);
				}else{
					console.log(error);
				}
			}
		}
	}
}

module.exports = {
	startDeployment
}