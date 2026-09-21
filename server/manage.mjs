import readline from 'node:readline';
import { Writable } from 'node:stream';
import { openStore, addUser, passwordHash } from './store.mjs';
const [command,username,role='driver']=process.argv.slice(2);const db=openStore(process.env.AMT_DATABASE||'./data/taxi.sqlite');
async function secret(){let muted=false;const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk);done();}});const rl=readline.createInterface({input:process.stdin,output,terminal:true});return new Promise(resolve=>{rl.question('Password (12–128 characters): ',value=>{rl.close();process.stdout.write('\n');resolve(value);});muted=true;});}
try{
 if(command==='add-user'){await addUser(db,username,await secret(),role);console.log('Account created.');}
 else if(command==='reset-password'){const password=await secret();if(password.length<12||password.length>128)throw Error('Password must be 12–128 characters');const user=db.prepare('SELECT id FROM users WHERE username=?').get(username?.toLowerCase());if(!user)throw Error('Account not found');db.prepare('UPDATE users SET password=? WHERE id=?').run(await passwordHash(password),user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);console.log('Password changed; all account sessions revoked.');}
 else if(command==='disable-user'){const user=db.prepare('SELECT id FROM users WHERE username=?').get(username?.toLowerCase());if(!user)throw Error('Account not found');db.prepare('UPDATE users SET active=0 WHERE id=?').run(user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);db.prepare('DELETE FROM shares WHERE user_id=?').run(user.id);console.log('Account disabled; sessions and shares revoked.');}
 else console.log('Commands: add-user USERNAME [admin|driver], reset-password USERNAME, disable-user USERNAME');
}catch(e){console.error(e.message);process.exitCode=1;}finally{db.close();}
