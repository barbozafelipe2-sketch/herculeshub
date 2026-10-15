import {readFileSync} from 'node:fs';
import {requireValue} from './errors.mjs';
export function configuration(env=process.env){
  const required=name=>{const value=env[name]?.trim();requireValue(value,500,'configuration_missing_'+name);return value;};
  const environment=required('APPLE_ENVIRONMENT');
  requireValue(['Production','Sandbox'].includes(environment),500,'apple_environment_invalid');
  const appAppleID=Number(env.APPLE_APP_ID||0)||undefined;
  requireValue(environment!=='Production'||appAppleID,500,'apple_app_id_required');
  const config={
    bundleID:required('APPLE_BUNDLE_ID'),environment,appAppleID,
    productIDs:required('APPLE_PRODUCT_IDS').split(',').map(x=>x.trim()).filter(Boolean),
    teamID:required('APPLE_TEAM_ID'),signInKeyID:required('APPLE_SIGNIN_KEY_ID'),
    signInPrivateKey:readFileSync(required('APPLE_SIGNIN_KEY_PATH'),'utf8'),
    storeKeyID:required('APPLE_STORE_KEY_ID'),issuerID:required('APPLE_STORE_ISSUER_ID'),
    storePrivateKey:readFileSync(required('APPLE_STORE_KEY_PATH'),'utf8'),
    rootCertificatePaths:required('APPLE_ROOT_CERTIFICATE_PATHS').split(',').map(x=>x.trim()),
    encryptionKey:required('DATA_ENCRYPTION_KEY'),database:required('DATABASE_PATH'),
    host:env.HOST||'127.0.0.1',port:Number(env.PORT||8080),
    publicOrigin:required('PUBLIC_ORIGIN')
    ,reviewerAccountIDs:(env.REVIEWER_ACCOUNT_IDS||'').split(',').map(x=>x.trim()).filter(Boolean)
  };
  const origin=new URL(config.publicOrigin);requireValue(origin.protocol==='https:'&&origin.origin===config.publicOrigin,500,'https_origin_required');
  return config;
}

