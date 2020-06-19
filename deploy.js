const path = require('path');
const fs = require('fs');
const axios = require('axios');
var clone = require('git-clone');
const { exec } = require('child_process');
var mysql = require('mysql');

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
		let fullPath = path.resolve(requestedDir, dir);

		if(fs.statSync(fullPath).isDirectory()){
			await scanPath(fullPath, options);
		}
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
		}else if(json.type == "tests" && !production){
			if (json.data) {
				// Get the test data by running the data file
				let data = require(path.resolve(parent, json.data));

				// Connect to the database
				var connection = mysql.createConnection({
					host: process.env.DATABASE_HOST,
					user: process.env.DATABASE_USER,
					database: process.env.DATABASE_NAME
				});
				connection.connect();

				// Inject the test data into the database
				if (data.tableObjects) {
					for (let tableObject of data.tableObjects) {
						await createOrUpdateTableObjectWithPropertiesInDatabase(connection, tableObject.uuid, tableObject.userId, tableObject.tableId, tableObject.file, tableObject.properties);
					}
				}

				if (data.collections) {
					for (let collection of data.collections) {
						await createOrUpdateCollectionWithTableObjectsInDatabase(connection, collection.tableId, collection.name, collection.tableObjects);
					}
				}

				if (data.purchases) {
					for (let purchase of data.purchases) {
						await createOrUpdatePurchaseInDatabase(connection, purchase.id, purchase.userId, purchase.tableObjectUuid, purchase.price, purchase.currency, purchase.completed);
					}
				}

				connection.end();
			}

			// Run all tests
			exec(`mocha ${path.resolve(parent, json.source)}/**/*.spec.js --timeout 20000 --recursive`, (err, stdout, stderr) => {
				console.log(stdout)
				console.log(stderr)
			});
		}
	}
}

//#region TableObject database functions
async function createOrUpdateTableObjectWithPropertiesInDatabase(connection, uuid, userId, tableId, file, properties){
	// Try to get the table object
	let dbTableObject = await getTableObjectFromDatabase(connection, uuid);

	if(dbTableObject){
		// Update each property
		for(let key in properties){
			let value = properties[key];

			// Check if the property exists in the database
			let dbProperty = await getPropertyFromDatabase(connection, dbTableObject.id, key);

			if(dbProperty){
				if(value.length == 0){
					// Delete the property
					await deletePropertyInDatabase(connection, dbProperty.id);
				}else{
					// Update the property
					await updatePropertyInDatabase(connection, dbProperty.id, value);
				}
			}else{
				if(value.length == 0) continue;

				// Create the property
				await createPropertyInDatabase(connection, dbTableObject.id, key, value);
			}
		}
	}else{
		// Create the table object
		await createTableObjectInDatabase(connection, uuid, userId, tableId, file);
		dbTableObject = await getTableObjectFromDatabase(connection, uuid);

		// Create the properties
		for(let key in properties){
			let value = properties[key];
			if(value.length == 0) continue;

			await createPropertyInDatabase(connection, dbTableObject.id, key, value);
		}
	}
}

async function createTableObjectInDatabase(connection, uuid, userId, tableId, file){
	return new Promise(resolve => {
		let currentDate = new Date();
		connection.query("INSERT INTO table_objects (uuid, user_id, table_id, file, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [uuid, userId, tableId, file, currentDate, currentDate], () => {
			resolve();
		});
	});
}

async function getTableObjectFromDatabase(connection, uuid){
	return new Promise(resolve => {
		connection.query("SELECT * FROM table_objects WHERE uuid = ?", [uuid], (tableObjectQueryError, tableObjectQueryResults, tableObjectQueryFields) => {
			if(tableObjectQueryResults.length == 0){
				resolve(null);
			}else{
				let dbTableObject = tableObjectQueryResults[0];
				resolve({
					id: dbTableObject.id,
					tableId: dbTableObject.table_id,
					userId: dbTableObject.user_id,
					uuid: dbTableObject.uuid,
					file: dbTableObject.file == 1
				});
			}
		});
	});
}
//#endregion

//#region Property database functions
async function createPropertyInDatabase(connection, tableObjectId, name, value){
	return new Promise(resolve => {
		connection.query("INSERT INTO properties (table_object_id, name, value) VALUES (?, ?, ?)", [tableObjectId, name, value], () => {
			resolve();
		});
	});
}

async function getPropertyFromDatabase(connection, tableObjectId, name){
	return new Promise(resolve => {
		connection.query("SELECT * FROM properties WHERE table_object_id = ? AND name = ?", [tableObjectId, name], (propertyQueryError, propertyQueryResults, propertyQueryFields) => {
			if(propertyQueryResults.length == 0){
				resolve(null);
			}else{
				let dbProperty = propertyQueryResults[0];
				resolve({
					id: dbProperty.id,
					tableObjectId: dbProperty.table_object_id,
					name: dbProperty.name,
					value: dbProperty.value
				});
			}
		});
	});
}

async function updatePropertyInDatabase(connection, id, value){
	return new Promise(resolve => {
		connection.query("UPDATE properties SET value = ? WHERE id = ?", [value, id], () => {
			resolve();
		});
	});
}

async function deletePropertyInDatabase(connection, id){
	return new Promise(resolve => {
		connection.query("DELETE FROM properties WHERE id = ?", [id], () => {
			resolve();
		});
	});
}
//#endregion

//#region Collection database functions
async function createOrUpdateCollectionWithTableObjectsInDatabase(connection, tableId, name, tableObjects){
	let dbCollection = await getCollectionFromDatabase(connection, tableId, name);

	if(dbCollection){
		// Delete all TableObjectCollections of the collection
		await deleteTableObjectCollectionsInDatabase(connection, dbCollection.id);
	}else{
		// Create the collection
		await createCollectionInDatabase(connection, tableId, name);
		dbCollection = await getCollectionFromDatabase(connection, tableId, name);
	}

	// Create all TableObjectCollections of the collection
	for(let objUuid of tableObjects){
		// Get the table object
		let tableObject = await getTableObjectFromDatabase(connection, objUuid);

		// Create the TableObjectCollection
		await createTableObjectCollectionInDatabase(connection, tableObject.id, dbCollection.id);
	}
}

async function createCollectionInDatabase(connection, tableId, name){
	return new Promise(resolve => {
		let currentDate = new Date();
		connection.query("INSERT INTO collections (table_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", [tableId, name, currentDate, currentDate], () => {
			resolve();
		});
	});
}

async function getCollectionFromDatabase(connection, tableId, name){
	return new Promise(resolve => {
		connection.query("SELECT * FROM collections WHERE table_id = ? AND name = ?", [tableId, name], (collectionQueryError, collectionQueryResults, connectionQueryFields) => {
			if(collectionQueryResults.length == 0){
				resolve(null);
			}else{
				let dbCollection = collectionQueryResults[0];
				resolve({
					id: dbCollection.id,
					tableId: dbCollection.table_id,
					name: dbCollection.name
				});
			}
		});
	});
}
//#endregion

//#region TableObjectCollection database functions
async function createTableObjectCollectionInDatabase(connection, tableObjectId, collectionId){
	return new Promise(resolve => {
		let currentDate = new Date();
		connection.query("INSERT INTO table_object_collections (table_object_id, collection_id, created_at, updated_at) VALUES (?, ?, ?, ?)", [tableObjectId, collectionId, currentDate, currentDate], () => {
			resolve();
		});
	});
}

async function deleteTableObjectCollectionsInDatabase(connection, collectionId){
	return new Promise(resolve => {
		connection.query("DELETE FROM table_object_collections WHERE collection_id = ?", [collectionId], () => {
			resolve();
		});
	});
}
//#endregion

//#region Purchase database functions
async function createOrUpdatePurchaseInDatabase(connection, id, userId, tableObjectUuid, price, currency, completed){
	// Get the purchase from the database
	let dbPurchase = await getPurchaseFromDatabase(connection, id);

	// Get the table object from the database
	let dbTableObject = await getTableObjectFromDatabase(connection, tableObjectUuid);
	if(!dbTableObject) return;

	if(dbPurchase){
		// Update the purchase
		await updatePurchaseInDatabase(connection, id, userId, dbTableObject.id, price, currency, completed);
	}else{
		// Create the purchase
		await createPurchaseInDatabase(connection, id, userId, dbTableObject.id, price, currency, completed);
	}
}

async function createPurchaseInDatabase(connection, id, userId, tableObjectId, price, currency, completed){
	return new Promise(resolve => {
		connection.query("INSERT INTO purchases (id, user_id, table_object_id, price, currency, completed) VALUES (?, ?, ?, ?, ?, ?)", [id, userId, tableObjectId, price, currency, completed], () => {
			resolve();
		});
	});
}

async function updatePurchaseInDatabase(connection, id, userId, tableObjectId, price, currency, completed){
	return new Promise(resolve => {
		connection.query("UPDATE purchases SET user_id = ?, table_object_id = ?, price = ?, currency = ?, completed = ? WHERE id = ?", [userId, tableObjectId, price, currency, completed, id], () => {
			resolve();
		});
	});
}

async function getPurchaseFromDatabase(connection, id){
	return new Promise(resolve => {
		connection.query("SELECT * FROM purchases WHERE id = ?", [id], (error, results, fields) => {
			if(results.length == 0){
				resolve(null);
			}else{
				let dbPurchase = results[0];
				resolve({
					id: dbPurchase.id,
					userId: dbPurchase.user_id,
					tableObjectId: dbPurchase.table_object_id,
					paymentIntentId: dbPurchase.payment_intent_id,
					productImage: dbPurchase.product_image,
					productName: dbPurchase.product_name,
					providerImage: dbPurchase.provider_image,
					providerName: dbPurchase.provider_name,
					price: dbPurchase.price,
					currency: dbPurchase.currency,
					completed: dbPurchase.completed,
					createdAt: dbPurchase.created_at,
					updatedAt: dbPurchase.updated_at
				});
			}
		});
	});
}
//#endregion

module.exports = {
	startDeployment
}