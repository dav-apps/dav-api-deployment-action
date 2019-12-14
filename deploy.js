const path = require('path');
const fs = require('fs');
const axios = require('axios');
var clone = require('git-clone');

var production = false;

async function startDeployment(options){
	// Clone the repository
	var directoryName = "repository";
	var requestedDir;
	var deleteRepo = false;
	production = options.production == true;

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

	for(let file of files){
		if(file.split('.').pop() != "json") continue;

		// Read the content of the json file
		var json = JSON.parse(fs.readFileSync(path.resolve(parent, file)));

		if(json.type == "endpoint"){
			if(!json.path || !json.method || !json.source) continue;
			let commands = fs.readFileSync(path.resolve(parent, json.source), {encoding: 'utf8'});

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
			if(!json.name || !json.params || !json.source) continue;
			let commands = fs.readFileSync(path.resolve(parent, json.source), {encoding: 'utf8'});

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
		}else if(json.type == "functions"){
			// Create or update the functions on the server
			var functions = json.functions;

			if(functions){
				for(let func of functions){
					let name = func.name;
					let params = func.params;
					let source = func.source;

					// Find the source file
					let commands = fs.readFileSync(path.resolve(parent, source), {encoding: 'utf8'});

					if(commands){
						try{
							await axios.default({
								url: `${options.baseUrl}/api/${options.apiId}/function`,
								method: 'put',
								headers: {
									Authorization: options.auth,
									'Content-Type': 'application/json'
								},
								data: {
									name,
									params: params.join(','),
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
		}else if(json.type == "errors"){
			// Create or update the errors on the server
			try{
				await axios.default({
					url: `${options.baseUrl}/api/${options.apiId}/errors`,
					method: 'put',
					headers: {
						Authorization: options.auth,
						'Content-Type': 'application/json'
					},
					data: {
						errors: json.errors
					}
				});
			}catch(error){
				if(error.response){
					console.log(error.response.data.errors);
				}else{
					console.log(error);
				}
			}
		}else if(json.type == "env"){
			// Create or update the env vars on the server
			try{
				await axios.default({
					url: `${options.baseUrl}/api/${options.apiId}/env_vars`,
					method: 'put',
					headers: {
						Authorization: options.auth,
						'Content-Type': 'application/json'
					},
					data: production ? json.production : json.development
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