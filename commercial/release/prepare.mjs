import {readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,'../..');
const local=path.join(directory,'config.local.json');
export function check(config,environment='Sandbox',archive=false){
  const errors=[];
  const needed=name=>{if(typeof config[name]!=='string'||!config[name].trim())errors.push(name+' não preenchido');};
  for(const key of ['teamID','bundleID','monthlyProductID','version','buildNumber','privacyURL','termsURL','supportURL'])needed(key);
  if(config.teamID&&!/^(?!XXXXXXXXXX$)[A-Z0-9]{10}$/.test(config.teamID))errors.push('teamID deve conter 10 caracteres Apple');
  if(config.bundleID&&!/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+){2,}$/.test(config.bundleID))errors.push('bundleID inválido');
  if(config.monthlyProductID&&!/^[A-Za-z0-9._-]+$/.test(config.monthlyProductID))errors.push('monthlyProductID inválido');
  if(!/^\d+\.\d+\.\d+$/.test(config.version||''))errors.push('version inválida');
  if(!/^[1-9]\d{0,8}$/.test(config.buildNumber||''))errors.push('buildNumber inválido');
  const https=(value,name)=>{
    try{const u=new URL(value);if(/[\r\n\0\s]/.test(value)||u.protocol!=='https:'||u.username||u.password||u.hash||u.search||
      /(^|\.)(example|localhost)$/.test(u.hostname)||u.hostname==='127.0.0.1'||u.hostname.includes('your-domain')||u.hostname.includes('example.com'))throw Error();}
    catch{errors.push(name+' deve ser um endereço HTTPS real');}
  };
  for(const key of ['privacyURL','termsURL','supportURL'])if(config[key])https(config[key],key);
  const selected=config.environments?.[environment];
  if(!selected||selected.appleEnvironment!==environment)errors.push('ambiente Apple deve corresponder a '+environment);
  if(!selected?.apiBaseURL)errors.push(environment+'.apiBaseURL não preenchido');
  else https(selected.apiBaseURL,environment+'.apiBaseURL');
  const other=environment==='Sandbox'?'Production':'Sandbox';
  if(selected?.apiBaseURL&&selected.apiBaseURL===config.environments?.[other]?.apiBaseURL)errors.push('Sandbox e Production precisam de endpoints separados');
  if(archive){
    if(!config.iconFile)errors.push('iconFile não preenchido');
    else{
      try{
        const bytes=readFileSync(path.resolve(root,config.iconFile));
        if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
          bytes.readUInt32BE(16)!==1024||bytes.readUInt32BE(20)!==1024||bytes[25]!==2)throw Error();
      }catch{errors.push('ícone deve ser PNG RGB de 1024×1024, sem canal alpha');}
    }
  }
  return errors;
}
export function xcconfig(config,environment){
  const escape=value=>String(value).replace(/\/\//g,'/$()/');
  return '// Gerado de config.local.json. Não contém chaves privadas.\n'+Object.entries({
    DEVELOPMENT_TEAM:config.teamID,HERCULES_BUNDLE_ID:config.bundleID,HERCULES_MONTHLY_PRODUCT_ID:config.monthlyProductID,
    HERCULES_API_BASE_URL:config.environments[environment].apiBaseURL,
    HERCULES_PRIVACY_URL:config.privacyURL,HERCULES_TERMS_URL:config.termsURL,
    HERCULES_MARKETING_VERSION:config.version,HERCULES_BUILD_NUMBER:config.buildNumber
  }).map(([key,value])=>key+' = '+escape(value)).join('\n')+'\n';
}
export function run(args){
  const command=args[0]||'check',flag=args.indexOf('--environment'),environment=flag<0?'Sandbox':args[flag+1];
  if(!['Sandbox','Production'].includes(environment))throw Error('Use --environment Sandbox ou Production');
  if(command==='init'){
    if(existsSync(local)){console.log('Configuração local já existe; preservada.');return;}
    copyFileSync(path.join(directory,'config.example.json'),local);
    console.log('Criado commercial/release/config.local.json. Preencha apenas quando tiver os dados.');return;
  }
  if(!['check','render'].includes(command))throw Error('Comandos: init, check, render');
  if(!existsSync(local))throw Error('Execute primeiro: node commercial/release/prepare.mjs init');
  const config=JSON.parse(readFileSync(local,'utf8')),archive=args.includes('--archive');
  const errors=check(config,environment,archive);
  if(errors.length)throw Error('Preparação pendente:\n- '+errors.join('\n- '));
  if(command==='render'){
    const configDir=path.join(root,'commercial/ios/Config');mkdirSync(configDir,{recursive:true});
    writeFileSync(path.join(configDir,'Local.'+environment+'.xcconfig'),xcconfig(config,environment));
    const exportDir=path.join(directory,'generated');mkdirSync(exportDir,{recursive:true});
    writeFileSync(path.join(exportDir,'ExportOptions.'+environment+'.plist'),`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>method</key><string>app-store-connect</string><key>signingStyle</key><string>automatic</string><key>teamID</key><string>${config.teamID}</string><key>uploadSymbols</key><true/></dict></plist>\n`);
    if(archive){
      const iconDir=path.join(root,'commercial/ios/App/Assets.xcassets/AppIcon.appiconset');mkdirSync(iconDir,{recursive:true});
      const source=path.resolve(root,config.iconFile),target=path.join(iconDir,'AppIcon.png');
      if(source!==target)copyFileSync(source,target);
      writeFileSync(path.join(iconDir,'Contents.json'),JSON.stringify({images:[{filename:'AppIcon.png',idiom:'universal',platform:'ios',size:'1024x1024'}],info:{author:'xcode',version:1}},null,2)+'\n');
    }
    console.log('Configuração '+environment+' e ExportOptions gerados localmente.');
  }else console.log('Campos de '+environment+' completos. Isto não valida conta, compras ou publicação Apple.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{run(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}
}

