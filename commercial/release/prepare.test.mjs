import test from 'node:test';
import assert from 'node:assert/strict';
import {check,xcconfig} from './prepare.mjs';
import {readFileSync} from 'node:fs';
const complete=()=>({teamID:'A1B2C3D4E5',bundleID:'com.herculeshub.app',monthlyProductID:'com.herculeshub.monthly',version:'0.2.0',buildNumber:'1',
 privacyURL:'https://herculeshub.com/privacy',termsURL:'https://herculeshub.com/terms',supportURL:'https://herculeshub.com/support',
 environments:{Sandbox:{apiBaseURL:'https://staging.herculeshub.com',appleEnvironment:'Sandbox'},Production:{apiBaseURL:'https://api.herculeshub.com',appleEnvironment:'Production'}}});
test('unconfigured source stays buildable but cannot masquerade as release-ready',()=>{
 const example=JSON.parse(readFileSync(new URL('./config.example.json',import.meta.url)));
 assert.ok(check(example).some(x=>x.includes('teamID')));
 assert.ok(check(example).some(x=>x.includes('apiBaseURL')));
 assert.ok(check(example,'Production',true).some(x=>x.includes('iconFile')));
});
test('environment mixing and placeholders are rejected',()=>{
 const config=complete();assert.deepEqual(check(config),[]);
 config.environments.Production.apiBaseURL=config.environments.Sandbox.apiBaseURL;
 assert.ok(check(config,'Production').some(x=>x.includes('separados')));
 config.environments.Production.apiBaseURL='https://api.example.com';
 assert.ok(check(config,'Production').some(x=>x.includes('HTTPS real')));
 config.environments.Sandbox.appleEnvironment='Production';
 assert.ok(check(config).some(x=>x.includes('ambiente Apple')));
});
test('generated xcconfig preserves HTTPS URLs instead of treating them as comments',()=>{
 const output=xcconfig(complete(),'Sandbox');
 assert.ok(output.includes('https:/$()/staging.herculeshub.com'));
 assert.ok(!output.includes('https://'));
 assert.ok(output.includes('DEVELOPMENT_TEAM = A1B2C3D4E5'));
});

