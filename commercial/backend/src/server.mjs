import {createServer} from 'node:http';
import {Store} from './store.mjs';
import {configuration} from './config.mjs';
import {AppleIdentity,ApplePurchases} from './apple.mjs';
import {createHandler} from './app.mjs';
const config=configuration();
const store=new Store(config.database,config.encryptionKey);
const identity=new AppleIdentity(config),purchases=await ApplePurchases.create(config);
const server=createServer({requestTimeout:30000,headersTimeout:10000},createHandler({store,identity,purchases,config}));
server.listen(config.port,config.host,()=>console.log('Hercules commercial API listening'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));

