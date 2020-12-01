var database = require('./database.js');
const request = require('request');
var log = require('./log.js');
var { app_config } = require('./config.js');

var AUTH_TOKEN = 'Bearer ';
var API_URL = app_config.apiUrl;
let dailyDays = 128;
let hourlyDays = 10;

async function addEnergy(datetime, deviceIdentifier, currentValue, yesterdayValue, totalValue, power, hourlyfactor) {
	await database.insertSmappeeEnergy(totalValue, yesterdayValue, currentValue, power, deviceIdentifier, datetime, 2, hourlyfactor);
}

// 5 minute values	10 days -1
// Hourly values	90 days -2
// Day values	365 days -3
// Monthly values	5 years -4

async function getData(device) {
	var lastDateTime = device.energy_time;

	if (lastDateTime != null) {
		var getCurrentDateTimeUTC = new Date().getTime();
		var measureDayCurrentDateTime = new Date();
		var measureHourlyCurrentDateTime = new Date();
		measureHourlyCurrentDateTime.setHours(0);
		measureDayCurrentDateTime.setDate(measureDayCurrentDateTime.getDate() - dailyDays);
		measureHourlyCurrentDateTime.setDate(measureHourlyCurrentDateTime.getDate() - hourlyDays);
		log.info('getDataReading ' + device)
		log.info('lastDateTime ' + lastDateTime.getTime())
		if (futureDateTime(lastDateTime, 1, 0, 0) < measureDayCurrentDateTime.getTime()) {
			getDataReading(3, device.device_id, device.identifier, futureDateTime(lastDateTime, 1, 0, 0).getTime(), measureDayCurrentDateTime.getTime(), device.energy_total, device.energy_yesterday, device.energy_today, true);
		} else if (futureDateTime(lastDateTime, 0, 1, 0) < measureHourlyCurrentDateTime.getTime()) {
			getDataReading(2, device.device_id, device.identifier, futureDateTime(lastDateTime, 0, 1, 0).getTime(), measureHourlyCurrentDateTime.getTime(), device.energy_total, device.energy_yesterday, device.energy_today, true);
		} else {
			getDataReading(1, device.device_id, device.identifier, lastDateTime.getTime(), getCurrentDateTimeUTC, device.energy_total, device.energy_yesterday, device.energy_today, false);
		}
	} else {
		var lastDateTime = new Date();
		lastDateTime.setDate(device.created);
		var measureMonthCurrentDateTime = new Date();
		measureMonthCurrentDateTime.setDate(measureMonthCurrentDateTime.getDate() - 365)
		getDataReading(4, device.device_id, device.identifier, lastDateTime.getTime(),
			measureMonthCurrentDateTime.getTime(), device.energy_total, device.energy_yesterday, device.energy_today, true);
	}
}

//https://app1pub.smappee.net/dev/v2/servicelocation/39918/consumption?aggregation=3&from=1514768400000&to=1548624766770

function getDataReading(aggregation, deviceId, identifier, fromTime, toTime, total, yesterday, today, forceSave) {

	if (identifier == null) {
		return;
	}

	var url = API_URL + "servicelocation/" + identifier + "/consumption?aggregation=" + aggregation + "&from=" + fromTime + "&to=" + toTime + "";
	var currentValue = today;
	var yesterdayValue = yesterday;
	var totalValue = total;
	var lastdate = fromTime;
	var lastdateTo = toTime;
	var aggregation_closure = aggregation;

	log.info(deviceId + ': url ' + url)
	const options = {
		url: url,
		headers: {
			'Authorization': AUTH_TOKEN
		}
	};

	async function callback(error, response, body) {
		//log.info(deviceId +": callback");
		var hourlyfactor = 1;
		if (aggregation_closure == 1) {
			hourlyfactor = 0.16666667;
		} else if (aggregation_closure == 3) {
			hourlyfactor = 24;
		} else if (aggregation_closure == 4) {
			hourlyfactor = 24 * 30;
		}

		if (!error && response.statusCode == 200) {
			const info = JSON.parse(body);
			var len = info.consumptions.length;
			var i = 0;
			if (len == 0) {
				if(aggregation_closure == 4){
					lastdate = 	lastdateTo.setDate(lastdateTo.getDate() - dailyDays);
				}
				await addEnergy(new Date(lastdate), deviceId, 0, 0, 0, 0);
				return;
			}
			var previousDatetimeStamp = lastdate;
			for (var data of info.consumptions) {
				i++;
				if (i == len && !forceSave) {
					log.info(deviceId + ": dont add the last one...");
					break;
				} else {
					log.info(deviceId + ": " + i + "-" + len);
				}

				currentDateTime = new Date(data.timestamp);
				if (currentDateTime <= new Date(lastdate)) {
					log.info(deviceId + ":currentDateTime" + currentDateTime + "lastdate" + new Date(lastdate));
					log.info(deviceId + ":already added.....................................");
					continue;
				}

				if (nextday(previousDatetimeStamp, data.timestamp)) {
					log.info(deviceId + ":new day" + previousDatetimeStamp + "-" + data.timestamp);
					yesterdayValue = currentValue;
					currentValue = 0;
				}

				currentValue = (parseFloat(parseFloat(currentValue) + parseFloat(data.consumption / 1000)).toFixed(4));
				totalValue = (parseFloat(parseFloat(totalValue) + parseFloat(data.consumption / 1000)).toFixed(4));
				let power = (parseFloat(parseFloat(data.consumption) * (5 / 60)).toFixed(4));
				if (aggregation_closure == 4) {
					hourlyfactor = 24 * daysInMonth(currentDateTime.getFullYear(), currentDateTime.getMonth());
				}
				log.info(deviceId + ":hourlyfactor: " + hourlyfactor);
				await addEnergy(currentDateTime, deviceId, currentValue, yesterdayValue, totalValue, power, hourlyfactor);
				previousDatetimeStamp = data.timestamp;
			}
			log.info(deviceId + " and we out...");

		} else {
			log.error('Error: ' + error + JSON.stringify(response));
		}
		log.info("getDataReading callback done");
	}

	request(options, callback);
}

function nextday(dateFrom, dateTo) {
	var dateBefore = new Date(dateFrom);
	//	dateBefore.setHours(dateBefore.getHours() + 2);
	var dayBefore = dateBefore.getDay();

	var dateNow = new Date(dateTo);
	//	dateNow.setHours(dateNow.getHours() + 2);
	var dayNow = dateNow.getDay();


	if (dayBefore !== dayNow) {
		return true;
	} else {
		return false;
	}
}


function daysInMonth(year, month) {
	var x = new Date(year, month + 1, 0).getDate();
	//log.info("daysInMonth" + x);
	return x;
}

function addNewServiceLocation() {
	log.info("addNewServiceLocation");
	var url = API_URL + "servicelocation/";
	const options = {
		url: url,
		headers: {
			'Authorization': AUTH_TOKEN
		}
	};

	async function callbackInsertSmappeeLocationAndDevice(error, response, body) {
		if (!error && response.statusCode == 200) {
			const info = JSON.parse(body);
			log.info('----------', info);
			for (var data of info.serviceLocations) {
				var location = await database.getLocationByIdentifier(data.serviceLocationId);
				if (location == null) {
					log.info("insertSmappeeLocationAndDevice");
					await database.insertSmappeeLocationAndDevice(data.serviceLocationId, data.name, null, null);
				}
			}
			log.info("and we out...");
		} else {
			log.error('Error' + error + response);
		}
		log.info("insertSmappeeLocationAndDevice callback done");
		return;
	}

	request(options, callbackInsertSmappeeLocationAndDevice);
}

function futureDateTime(inputTime, day, hour, minute) {
	var returnDate = new Date(inputTime.getTime());
	returnDate.setDate(returnDate.getDate() + day);
	returnDate.setHours(returnDate.getHours() + hour);
	returnDate.setMinutes(returnDate.getMinutes() + minute);
	return returnDate;
}

function sleep(milliseconds) {
	const date = Date.now();
	let currentDate = null;
	do {
		currentDate = Date.now();
	} while (currentDate - date < milliseconds);
}
function setAuth() {

	const options = {
		url: 'https://app1pub.smappee.net/dev/v2/oauth2/token',
		method: 'POST',
		headers: {},
		form: {
			'grant_type': 'password',
			'client_id': 'CodeworxAPI',
			'client_secret': 'FUuQqn52Yi',
			'username': 'Energyrite_API',
			'password': 'smappee'
		}
	};

	request(options, setAuthVariables);

}

function setAuthVariables(error, response, body) {
	
	const info = JSON.parse(body);

	if (!error && response.statusCode == 200) {
		const info = JSON.parse(body);
		log.info('----------', info);
		AUTH_TOKEN = 'Bearer ' + info.access_token

		let x = (Math.random() * 10).toFixed(0)
		if (x == 9) {
			addNewServiceLocation();
		}
		log.info('getDevicesInfoByDeviceType');
		database.getDevicesInfoByDeviceType(2).then(devices => {
			for (var device of devices) {
				log.info(device)
				getData(device);
			}
		});
	}else{
		log.error('----------', error);
	}
}

	log.info('setAuth');
	setAuth();
	setTimeout(() => { log.info("end of sleep!"); }, 180000);


log.info('finished at  ' + new Date());
