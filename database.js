var {Pool} = require('pg');
var {database_config} = require('./config.js');

const pool = new Pool(database_config)
let DefaultParentLocationId = 574

const getDevicesByDeviceType = async(deviceTypeId) => {
    //  const client = pool.connect();
      var results = [];
      try {
        const { rows } = await pool.query('SELECT * FROM device WHERE deviceTypeId = $1 ORDER BY device_id ASC',[deviceTypeId]);
        // Stream results back one row at a time
        //console.log(JSON.stringify(rows));
        return rows;
      }catch(err){
          console.error('Database ' + err)
      }
  
      // After all data is returned, close connection and return results
    //  await pool.release();
      return results;
}
exports.getDevicesByDeviceType = getDevicesByDeviceType;
 
const getDevicesInfoByDeviceType = async(deviceTypeId) => {
    //  const client = pool.connect();
      var results = [];
      var sql = 'SELECT d.device_id, d.tele_period, d.identifier, l.identifier as location_identifier,l.username as location_username,l.password as location_password, '+
      'e2.time as energy_time ,COALESCE(e2.total,\'0\') as energy_total ,COALESCE(e2.yesterday,\'0\') as energy_yesterday ,COALESCE(e2.today,\'0\') as energy_today '+
      'FROM public.device d '+
      'inner join public.location l on l.location_id = d.location_id '+
      'left join (  select e1.device_id,e1.time,e1.total,e1.yesterday,e1.today from energy e1 inner join  '+
        ' (select max(time) as time ,ei.device_id from energy ei group by ei.device_id) e on e.time = e1.time and e.device_id = e1.device_id)  e2 on e2.device_id = d.device_id '+
      'WHERE d.devicetype_id = $1 and d.device_id = 720 '+
      'ORDER BY d.device_id ASC';
      try {
        const { rows } = await pool.query(sql,[deviceTypeId]);
        return rows;
      }catch(err){
          console.error('Database ' + err)
      }
  
  return results;
}
exports.getDevicesInfoByDeviceType = getDevicesInfoByDeviceType; 

const getDevice = async(deviceId) => {
      try {
        const { rows } = await pool.query('SELECT * FROM device WHERE device_id =$1 ORDER BY device_id ASC',[deviceId]);
        //console.log(JSON.stringify(rows[0]));
        return rows[0];
      }catch(err){
          console.error('Database ' + err)
      }
      return null;
}
exports.getDevice = getDevice;
  
const getDeviceByIdentifier = async(identifier) => {
    try {
      const { rows } = await pool.query('SELECT * FROM device WHERE identifier =$1 ORDER BY device_id ASC',[identifier]);
      //console.log(JSON.stringify(rows[0]));
      return rows[0];
    }catch(err){
        console.error('Database ' + err)
    }
    return null;
}
exports.getDeviceByIdentifier = getDeviceByIdentifier;
const getEnergy = async(deviceId) => {
    try {
        const { rows } = await pool.query('SELECT * FROM energy where device_id = $1 ORDER BY time DESC LIMIT 1', [deviceId]);
        //console.log(JSON.stringify(rows));
        return rows;
    }catch(err){
        console.error('Database ' + err)
    }
    return [];
}
exports.getEnergy = getEnergy;
  const insertSmappeeEnergy = async (total, yesterday,today, power, device_id, time,utcdate,hourlyfactor) => {
    //ON CONFLICT (time,device_id,utcdate) DO UPDATE SET total = EXCLUDED.total, yesterday = EXCLUDED.yesterday, today = EXCLUDED.today
    await pool.query('INSERT INTO energy (time, device_id, total, yesterday,today, power,factor, voltage, current,utcdate,hourlyfactor) values ($1, $2, $3, $4,$5,$6,$7,$8,$9,$10,$11)  ',
      [time, device_id, total, yesterday,today, power,0, 0, 0,utcdate,hourlyfactor],(err,res)=> {
      if(err){
          console.error(device_id+ ": Database " + err + " "+  time) 
      }
  });
}
exports.insertSmappeeEnergy = insertSmappeeEnergy;

const insertEnergy = (energy, device, time) => {
      pool.query('INSERT INTO energy (time, device_id, total, yesterday,today, power,factor, voltage, current) values($1, $2, $3, $4,$5,$6,$7,$8,$9)',
        [time, device.device_id, energy.Total, energy.Yesterday,energy.Today, energy.Power,energy.Factor, energy.Voltage, energy.Current],(err,res)=> {
        if(err){
            console.error('Database ' + err) 
        }
    });
}
exports.insertEnergy = insertEnergy;

const upsertTimer = ( device, number, timer) => {
    pool.query("SELECT count(*) FROM timer WHERE device_id = $1 and number = $2", [device.device_id, number],(err,res)=> {
        if(err){
            console.error('Database ' + err) 
        }else{
            //console.log(res);
            if(res > 0){
                pool.query('UPDATE timer SET (arm = $1, "time" = $2, "window" = 3$, days = 4$ , "repeat" = 5$, "output" = 6$, action = 7$) WHERE device_id = $8 and number = $9',
                [ timer.arm,timer.Time, timer.window, timer.days, timer.repeat, timer.output, timer.action, device.device_id, number],(err,res)=> {
                 if(err){
                    console.error('Database ' + err) 
                  }
                });
            }else{
                pool.query('INSERT INTO timer (device_id, numbered, arm, "time", "window", days, "repeat", "output", action) values($1, $2, $3, $4,$5,$6,$7,$8,$9)',
                [ device.device_id, number, timer.arm,timer.time, timer.window, timer.days, timer.repeat, timer.output, timer.action],(err,res)=> {
                 if(err){
                    console.error('Database ' + err) 
                  }
                });
            }
        }
    });

   
}
exports.upsertTimer = upsertTimer;

const getLocationByIdentifier = async(identifier) => {
  try {
    const { rows } = await pool.query('SELECT * FROM location WHERE identifier = $1',[identifier]);
    //console.log(identifier,rows);
    if(rows.length > 0){
      //console.log("found");
      return rows[0];
    }
  }catch(err){
      console.error('Database ' + err)
  }
  return null;
}
exports.getLocationByIdentifier = getLocationByIdentifier;

const insertSmappeeLocationAndDevice = async (identifier, name,username,password)=>{
  var timezone_id = 1;
  var customer_id = 2;
  var devicetype_id = 2;
  var tele_period =  600;
  
  var location_id = await insertLocation({"Name":name,"TimezoneId":timezone_id,"CustomerId":customer_id,"Identifier":identifier, "ParentLocationId":DefaultParentLocationId,"IsActive": false});
  var device = { 
    "Identifier": "Default", "Name": name, "Description": "Entire Store", "CustomerId":customer_id,"DeviceTypeId": devicetype_id, 
  "LocationId":location_id, "TelePeriod": tele_period,"Username":username,"Password":password}
  await insertDevice(device);
  return location_id;
};
exports.insertSmappeeLocationAndDevice = insertSmappeeLocationAndDevice;

const insertLocation = async(data)=>{
  console.log('insertLocaton '); 
  let result = await pool.query(`INSERT INTO location (name, timezone_id, customer_id,identifier,parent_location_id,is_active) 
  values ($1,$2,$3,$4,$5,$6) RETURNING location_id`,
  [ data.Name, data.TimezoneId,data.CustomerId,data.Identifier,data.ParentLocationId, data.IsActive]);
  var location_id =  result.rows[0].location_id;
  console.log('result ' + location_id);
  return location_id;
}
exports.insertLocation = insertLocation;

const insertDevice = async(device)=>{
  console.error(JSON.stringify(device)); 
  await pool.query(`INSERT INTO device 
    (identifier, name, description, customer_id, devicetype_id, location_id,tele_period, username, password, parent_device_id )
    values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) `,
    [ device.Identifier, device.Name, device.Description, device.CustomerId, device.DeviceTypeId, 
      device.LocationId, device.TelePeriod, device.Username,device.Password, null],(err,res)=> {
    if(err){
        console.error('Database insertDevice: ' + err) 
    }
  });
}
exports.insertDevice = insertDevice;

