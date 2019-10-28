var {Pool} = require('pg');
var {config} = require('./database_config.js');

const pool = new Pool(config)

const getDevicesByDeviceType = async(deviceTypeId) => {
    //  const client = pool.connect();
      var results = [];
      try {
      const { rows } = await pool.query('SELECT * FROM device WHERE deviceTypeId = $1 ORDER BY device_id ASC',[deviceTypeId]);
      // Stream results back one row at a time
      console.log(JSON.stringify(rows));
      return rows;
      }catch(err){
          console.log('Database ' + err)
      }
  
      // After all data is returned, close connection and return results
    //  await pool.release();
      return results;
  }

  
const getDevicesInfoByDeviceType = async(deviceTypeId) => {
    //  const client = pool.connect();
      var results = [];
      var sql = 'SELECT d.device_id, d.tele_period, d.identifier, l.identifier as location_identifier,l.username as location_username,l.password as location_password, '+
      'e2.time as energy_time ,COALESCE(e2.total,\'0\') as energy_total ,COALESCE(e2.yesterday,\'0\') as energy_yesterday ,COALESCE(e2.today,\'0\') as energy_today '+
      'FROM public.device d '+
      'inner join public.location l on l.location_id = d.location_id '+
      'left join (  select e1.device_id,e1.time,e1.total,e1.yesterday,e1.today from energy e1 inner join  '+
        ' (select max(time) as time ,ei.device_id from energy ei group by ei.device_id) e on e.time = e1.time and e.device_id = e1.device_id)  e2 on e2.device_id = d.device_id '+
      'WHERE d.devicetype_id = $1 '+
      'ORDER BY d.device_id ASC';

      try {
        const { rows } = await pool.query(sql,[deviceTypeId]);
        console.log(JSON.stringify(rows));
        return rows;
      }catch(err){
          console.log('Database ' + err)
      }
  
      return results;
  }


  
const getDevice = async(deviceId) => {
      try {
        const { rows } = await pool.query('SELECT * FROM device WHERE device_id =$1 ORDER BY device_id ASC',[deviceId]);
        console.log(JSON.stringify(rows[0]));
        return rows[0];
      }catch(err){
          console.log('Database ' + err)
      }
      return null;
  }

  
const getDeviceByIdentifier = async(identifier) => {
    try {
      const { rows } = await pool.query('SELECT * FROM device WHERE identifier =$1 ORDER BY device_id ASC',[identifier]);
      console.log(JSON.stringify(rows[0]));
      return rows[0];
    }catch(err){
        console.log('Database ' + err)
    }
    return null;
}

const getEnergy = async(deviceId) => {
    try {
    const { rows } = await pool.query('SELECT * FROM energy where device_id = $1 ORDER BY time DESC LIMIT 1', [deviceId]);
    console.log(JSON.stringify(rows));
    return rows;
}catch(err){
    console.log('Database ' + err)
}
    return [];
}

const insertSmappeeEnergy = (total, yesterday,today, device_id, time) => {
    console.log("inserting....");
    pool.query('INSERT INTO energy (time, device_id, total, yesterday,today, power,factor, voltage, current) values ($1, $2, $3, $4,$5,$6,$7,$8,$9) ON CONFLICT (time,device_id) DO UPDATE SET total = EXCLUDED.total, yesterday = EXCLUDED.yesterday, today = EXCLUDED.today',
      [time, device_id, total, yesterday,today, 0,0, 0, 0],(err,res)=> {
      if(err){
          console.log('Database ' + err) 
      }
  });
  console.log("insertSmappeeEnergy done");
}


const insertEnergy = (energy, device, time) => {
      pool.query('INSERT INTO energy (time, device_id, total, yesterday,today, power,factor, voltage, current) values($1, $2, $3, $4,$5,$6,$7,$8,$9)',
        [time, device.device_id, energy.Total, energy.Yesterday,energy.Today, energy.Power,energy.Factor, energy.Voltage, energy.Current],(err,res)=> {
        if(err){
            console.log('Database ' + err) 
        }
    });
}

const upsertTimer = ( device, number, timer) => {
    pool.query("SELECT count(*) FROM timer WHERE device_id = $1 and number = $2", [device.device_id, number],(err,res)=> {
        if(err){
            console.log('Database ' + err) 
        }else{
            console.log(res);
            if(res > 0){
                pool.query('UPDATE timer SET (arm = $1, "time" = $2, "window" = 3$, days = 4$ , "repeat" = 5$, "output" = 6$, action = 7$) WHERE device_id = $8 and number = $9',
                [ timer.arm,timer.Time, timer.window, timer.days, timer.repeat, timer.output, timer.action, device.device_id, number],(err,res)=> {
                 if(err){
                    console.log('Database ' + err) 
                  }
                });
            }else{
                pool.query('INSERT INTO timer (device_id, numbered, arm, "time", "window", days, "repeat", "output", action) values($1, $2, $3, $4,$5,$6,$7,$8,$9)',
                [ device.device_id, number, timer.arm,timer.time, timer.window, timer.days, timer.repeat, timer.output, timer.action],(err,res)=> {
                 if(err){
                    console.log('Database ' + err) 
                  }
                });
            }
        }
    });

   
}

exports.getDevicesInfoByDeviceType = getDevicesInfoByDeviceType;

exports.getDevicesByDeviceType = getDevicesByDeviceType;

exports.getDevice = getDevice;

exports.insertSmappeeEnergy = insertSmappeeEnergy;

exports.getEnergy = getEnergy;

exports.getDeviceByIdentifier = getDeviceByIdentifier;

exports.insertEnergy = insertEnergy;

exports.upsertTimer = upsertTimer;
