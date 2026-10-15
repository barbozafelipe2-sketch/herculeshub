import {existsSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {xcconfig} from './prepare.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const filename=path.join(root,'commercial/ios/Config/Local.Sandbox.xcconfig');
assert.equal(existsSync(filename),false,'Preserving existing local configuration; run this check only on a clean CI checkout.');
const fixture={teamID:'A1B2C3D4E5',bundleID:'com.herculeshub.fixture',monthlyProductID:'com.herculeshub.fixture_monthly',version:'1.2.3',buildNumber:'42',
 privacyURL:'https://herculeshub.com/privacy',termsURL:'https://herculeshub.com/terms',
 environments:{Sandbox:{apiBaseURL:'https://staging.herculeshub.com'}}};
function settings(configuration,scheme){
 const output=execFileSync('xcodebuild',['-project',path.join(root,'commercial/ios/HerculesHub.xcodeproj'),
 '-scheme',scheme,'-configuration',configuration,'-sdk','iphonesimulator','-showBuildSettings','-json','CODE_SIGNING_ALLOWED=NO'],{encoding:'utf8',maxBuffer:8_000_000});
 return JSON.parse(output).find(target=>target.target==='HerculesHub').buildSettings;
}
try{
 writeFileSync(filename,xcconfig(fixture,'Sandbox'));
 const sandbox=settings('Sandbox','HerculesHub-Sandbox');
 assert.equal(sandbox.HERCULES_API_BASE_URL,'https://staging.herculeshub.com');
 assert.equal(sandbox.PRODUCT_BUNDLE_IDENTIFIER,fixture.bundleID);
 assert.equal(sandbox.MARKETING_VERSION,'1.2.3');
 assert.equal(sandbox.CURRENT_PROJECT_VERSION,'42');
 const production=settings('Release','HerculesHub-Production');
 assert.equal(production.HERCULES_API_BASE_URL||'','');
 assert.equal(production.PRODUCT_BUNDLE_IDENTIFIER,'com.herculeshub.app');
 console.log('Xcode resolves HTTPS, IDs and versions correctly; Sandbox does not leak into Production.');
}finally{rmSync(filename,{force:true});}

