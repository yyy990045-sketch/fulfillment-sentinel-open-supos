import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

// Run from the source root. Scan only candidate source-release files; report paths, never matching secret values.
function sourceFiles(dir = '.') {
  return readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    if(['.git','node_modules','dist','.preview','artifacts'].includes(entry.name)) return [];
    const file=join(dir,entry.name);
    return entry.isDirectory()?sourceFiles(file):[file.replaceAll('\\','/')];
  });
}
const files = existsSync('.git') ? execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {encoding:'utf8'}).trim().split('\n').filter(Boolean) : sourceFiles();
const findings = [];
const tools = new Set(['scripts/public-release-audit.mjs']);
const signatures = [
  ['credential-token', /(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g],
  ['credential-assignment', /(?:AI_API_KEY|J2_MQTT_PASSWORD|password|apiKey|accessToken)\s*[:=]\s*["'][^"'\r\n]{16,}["']/gi],
  ['developer-home', /(?:[A-Z]:[\\/]Users[\\/]|[A-Z]:[\\/]open-supos[\\/]|\/Users\/[^/\s]+\/)/gi],
  ['private-ip', /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g],
  ['unrelated-project', /\b(?:PowerBI|Superset|JEV)\b/gi],
  ['cloud-credential', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bAIza[A-Za-z0-9_-]{30,}/g],
  ['jwt-session', /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g],
  ['database-credential-url', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:]+:[^\s/@]+@/gi],
  ['unix-developer-path', /\/(?:home|Users|srv)\/[^\s"'`<>]+|\/mnt\/[a-z]\/(?:Users|open-supos)\//g],
];
for (const file of files) {
  if(!existsSync(file)) {findings.push({file,kind:'missing-candidate'});continue;}
  const bytes=readFileSync(file);const text=bytes.toString('utf8');
  if(bytes.length > 5_000_000)findings.push({file,kind:'large-source-file'});
  if(/\.(?:sqlite3|db|sql|dump|bak|p12|pfx|pem|key|tgz|tar|gz)$/i.test(file))findings.push({file,kind:'backup-or-private-material'});
  if(/(?:^|\/)(?:\.gitmodules|\.npmrc|\.netrc|id_rsa|id_ed25519)$/.test(file))findings.push({file,kind:'hidden-config-review-required'});
  if(/(?:^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.example'))findings.push({file,kind:'populated-environment-file'});
  if(!file.startsWith('third_party/')&&!tools.has(file)) {
    if(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(text))findings.push({file,kind:'email-contact-review'});
    if(/(?<![A-Za-z0-9])(?:\+86[- ]?)?1[3-9][0-9]{9}(?![A-Za-z0-9])/.test(text))findings.push({file,kind:'phone-contact-review'});
  }
  if (/\.(?:env|sqlite|log|jpg|png|zip)$/i.test(file) || /(?:^|\/)(?:node_modules|artifacts|\.preview|\.git)\//.test(file)) findings.push({file,kind:'non-source-release-file'});
  if(!tools.has(file))for(const [kind,pattern] of signatures) {pattern.lastIndex=0;if(pattern.test(text))findings.push({file,kind});}
  // Relative Markdown links: ignore URLs, anchors and links inside preserved upstream license text.
  if(file.endsWith('.md')&&!file.startsWith('third_party/'))for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
    const link=match[1].replace(/^<|>$/g,'').split('#')[0];
    if(!link||/^(?:https?:|mailto:|\/)/.test(link))continue;
    if(!existsSync(resolve(dirname(resolve(file)),link)))findings.push({file,kind:'broken-document-link',target:link});
  }
}
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const inventory=JSON.parse(readFileSync('docs/dependency-licenses.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(inventory.lockSha256!==hash(readFileSync('package-lock.json')))findings.push({file:'docs/dependency-licenses.json',kind:'stale-lock-inventory'});
if(inventory.packages.length!==Object.keys(lock.packages).length-1)findings.push({file:'docs/dependency-licenses.json',kind:'incomplete-dependency-inventory'});
for(const p of inventory.packages)for(const f of p.licenseFiles)if(!existsSync(f.file)||hash(readFileSync(f.file))!==f.sha256)findings.push({file:f.file,kind:'license-copy-hash'});
if(hash(readFileSync('LICENSE'))!=='cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30')findings.push({file:'LICENSE',kind:'nonstandard-license'});
if(JSON.parse(readFileSync('package.json')).license!=='Apache-2.0'||lock.packages[''].license!=='Apache-2.0')findings.push({file:'package.json',kind:'license-metadata'});
console.log(JSON.stringify({scope:'Git source-release candidates incl. untracked nonignored; .git, generated outputs and dependencies excluded from publication',files:files.length,findings,pass:!findings.length},null,2));
process.exitCode=findings.length?1:0;
