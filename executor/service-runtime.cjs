const {createHash,randomBytes}=require('node:crypto');
async function serviceRuntime(config, request, core=require('./service-core.cjs')) {
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(config.serviceKey||''))throw new Error('CONFIGURATION');
  const call=(path,body)=>request({...config,key:config.serviceKey},path,body);
  const value=await call('/v1/service/bootstrap',{catalogVersion:core.CATALOG_VERSION});
  const fingerprint=createHash('sha256').update(config.user+'\0'+config.password).digest('hex');
  if(value?.catalogVersion!==core.CATALOG_VERSION||value.smtpFingerprint!==fingerprint
    || !value.settings || typeof value.settings!=='object')throw new Error('CONFIG_MISMATCH');
  // ACCESS_KEY is only used for in-process dispatch of authenticated relay
  // commands. The desktop's real credential is never retrieved or shared.
  return core.createRuntime({...value.settings,ACCESS_KEY:randomBytes(32).toString('base64url'),
    SERVICE_EXECUTOR_KEY:config.serviceKey,EXTERNAL_EXECUTOR_KEY:config.key,
    QQ_SMTP_USER:config.user,QQ_SMTP_AUTH_CODE:config.password},call);
}
module.exports={serviceRuntime};
