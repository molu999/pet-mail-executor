// Only public executor code is published. Credentials and schedules stay private.
const { createHash } = require('node:crypto');
const SMTPConnection = require('nodemailer/lib/smtp-connection');
const MailComposer = require('nodemailer/lib/mail-composer');
const address = value => typeof value === 'string' && value.length <= 254
  && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(value);
function configuration(env) {
  const url = new URL(env.PET_CLOUD_URL || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !/^[A-Za-z0-9_-]{32,128}$/.test(env.PET_EXECUTOR_KEY || '')
    || !address(env.QQ_SMTP_USER) || !/@qq\.com$/i.test(env.QQ_SMTP_USER)
    || !env.QQ_SMTP_AUTH_CODE || /[\r\n\0]/.test(env.QQ_SMTP_AUTH_CODE)) throw new Error('CONFIGURATION');
  return { url: url.origin, key: env.PET_EXECUTOR_KEY, user: env.QQ_SMTP_USER, password: env.QQ_SMTP_AUTH_CODE };
}
function validateLease(value, now) {
  if (!value || !/^feishu:[^\r\n]{1,400}:[^:\r\n]{1,200}$/.test(value.taskId)
    || !Number.isSafeInteger(value.version) || value.version < 1 || !/^[0-9a-f-]{36}$/i.test(value.claim)
    || typeof value.attemptId !== 'string' || !/^[^\r\n]{1,200}$/.test(value.attemptId)
    || !address(value.recipient) || typeof value.subject !== 'string' || /[\r\n\0]/.test(value.subject)
    || value.subject.length > 2000 || typeof value.text !== 'string' || value.text.length > 40000
    || !Number.isSafeInteger(value.sendBefore) || value.sendBefore <= now || value.sendBefore > now + 180000) throw new Error('LEASE');
  return value;
}
async function cloud(config, path, body, fetchFn = fetch) {
  const response = await fetchFn(config.url + path, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { authorization: 'Bearer ' + config.key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel(); throw new Error('CLOUD_HTTP');
  }
  const reader = response.body.getReader(); let size = 0; const parts = [];
  for (;;) { const { value, done } = await reader.read(); if (done) break;
    size += value.length; if (size > 100000) { await reader.cancel(); throw new Error('CLOUD_SIZE'); } parts.push(Buffer.from(value)); }
  const value = JSON.parse(Buffer.concat(parts).toString('utf8'));
  if (!response.ok) throw new Error(['CONFIG_MISMATCH','FEISHU_AUTH','FEISHU_PERMISSION','FEISHU_VERIFY'].includes(value.code)
    ? value.code : 'CLOUD_HTTP_'+response.status);
  return value;
}
function smtpFactory(config) {
  const connection = new SMTPConnection({host:'smtp.qq.com', port:465, secure:true,
    connectionTimeout:10000, greetingTimeout:10000, socketTimeout:15000, logger:false, debug:false,
    tls:{servername:'smtp.qq.com', minVersion:'TLSv1.2', rejectUnauthorized:true}});
  let failure;
  connection.on('error', error => { failure = error; });
  const connected = () => new Promise((resolve, reject) => {
    const onError = e => { connection.removeListener('error', onError); reject(e); };
    connection.once('error', onError);
    connection.connect(() => connection.login({user:config.user, pass:config.password}, error => {
      connection.removeListener('error', onError); if (error || failure) reject(error || failure); else resolve();
    }));
  });
  return { connected, close: () => connection.close(),
    send: (recipient, mime) => new Promise((resolve, reject) => connection.send({from:config.user,to:[recipient]}, mime,
      (error, info) => error ? reject(error) : resolve(info))) };
}
async function smtp(config, lease, dependencies = {}) {
  const session = (dependencies.smtpFactory || smtpFactory)(config); let submitted = false;
  try {
    await session.connected();
    if (!lease) return {status:'verified'};
    const mime = await new MailComposer({from:config.user, to:lease.recipient, subject:lease.subject, text:lease.text,
      disableFileAccess:true, disableUrlAccess:true}).compile().build();
    // Check after TLS and authentication, immediately before any SMTP envelope/DATA.
    if ((dependencies.now || Date.now)() >= lease.sendBefore) return {status:'failed',error:'租约已过期，未提交邮件。'};
    submitted = true;
    const info = await session.send(lease.recipient, mime);
    if (info.accepted?.some(a => a.toLowerCase() === lease.recipient.toLowerCase())) return {status:'sent'};
    if (info.rejected?.some(a => a.toLowerCase() === lease.recipient.toLowerCase())) return {status:'failed',error:'邮件服务器明确拒绝了本次提交。'};
    return {status:'uncertain',error:'SMTP 提交中断，发送结果待核实。'};
  } catch (error) {
    const definite = !submitted || (Number.isInteger(error?.responseCode) && error.responseCode >= 400 && error.responseCode < 600);
    if (!lease) throw new Error(error?.code === 'EAUTH' ? 'SMTP_AUTH' : 'SMTP_CONNECT');
    return definite ? {status:'failed',error:submitted?'邮件服务器明确拒绝了本次提交。':'SMTP 连接或认证失败，未提交邮件。'}
      : {status:'uncertain',error:'SMTP 提交中断，发送结果待核实。'};
  } finally { try {session.close();} catch {} }
}
async function execute(env = process.env, dependencies = {}) {
  const config = configuration(env), now = dependencies.now || Date.now;
  const api = dependencies.cloud || ((path, body) => cloud(config, path, body));
  const submit = dependencies.smtp || ((lease) => smtp(config, lease, dependencies));
  const log = dependencies.log || (message => console.log(message));
  if (env.PET_EXECUTOR_TEST_SMTP === 'true') {
    await submit();
    log('QQ SMTP TLS 连接和认证通过，未发送邮件；继续核实 Worker 和飞书。');
    await api('/v1/executor/prepare',{verify:true});
    const result = await api('/v1/executor/verify', {smtpFingerprint:createHash('sha256').update(config.user+'\0'+config.password).digest('hex')});
    if (!result.smtp || !result.feishu) throw new Error('VERIFICATION');
    log('QQ SMTP、Worker 连接及飞书读取验证通过；未领取任务、未发送邮件。'); return;
  }
  const until = now() + 180000;
  for (let i = 0; i < 50 && now() < until; i++) {
    const prepared=await api('/v1/executor/prepare',{});
    if(prepared.empty){log('本轮无可发送的到期邮件。');return;}
    const lease = await api('/v1/executor/claim', {});
    if (lease.empty) { log('本轮无可发送的到期邮件。'); return; }
    validateLease(lease, now());
    const result = await submit(lease);
    const report = {taskId:lease.taskId,version:lease.version,claim:lease.claim,attemptId:lease.attemptId,...result};
    let saved = false;
    for (let j = 0; j < 3 && !saved; j++) {
      try { const response = await api('/v1/executor/finish', report); if (!response.ok) throw new Error('REPORT'); saved = true; }
      catch { if (j === 2) throw new Error('REPORT'); }
    }
    log(result.status === 'sent' ? '邮件已提交 QQ 邮件服务器。' : result.status === 'failed' ? '邮件未提交成功，已保存失败记录。' : '发送结果待核实，不自动重发。');
    if (result.status === 'uncertain') return;
  }
}
module.exports = {configuration,validateLease,cloud,smtp,execute};
if (require.main === module) execute().catch(error => {
  const safe = /^(CONFIGURATION|LEASE|SMTP_AUTH|SMTP_CONNECT|CONFIG_MISMATCH|FEISHU_AUTH|FEISHU_PERMISSION|FEISHU_VERIFY|VERIFICATION|REPORT|CLOUD_HTTP(?:_\d{3})?|CLOUD_SIZE)$/.test(error?.message) ? error.message : 'CONNECTION';
  console.error('执行器检查失败：'+safe+'。未自动重发邮件。'); process.exitCode=1;
});
