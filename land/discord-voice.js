// Real Discord speaking events only. No browser microphone capture or recording.
export const isActivity=()=>new URLSearchParams(location.search).has('frame_id');
export async function connectDiscordVoice({api,room,transport,onStatus}){
  if(!isActivity())throw Error('Discord 발화 표시는 Discord 안에서 마을을 실행할 때 연결할 수 있어요.');
  const config=await api('/land/voice/config',{room});
  if(!config.available)throw Error(config.reason==='setup'?'Discord 발화 표시의 앱 인증 설정이 아직 준비되지 않았어요.':'Discord 계정을 연결하고 음성방 광장에 먼저 들어와주세요.');
  const {DiscordSDK}=await import('./vendor/discord-sdk.js');
  const sdk=new DiscordSDK(config.applicationId);await sdk.ready();
  const grant=await sdk.commands.authorize({client_id:config.applicationId,response_type:'code',state:config.state,prompt:'consent',scope:['identify','rpc.voice.read']});
  const authorization=await api('/land/voice/auth',{code:grant.code,state:grant.state||config.state});
  await sdk.commands.authenticate({access_token:authorization.accessToken});
  let speaking=false,closed=false;
  const send=()=>{const ws=transport();if(!closed&&ws?.readyState===1)ws.send(JSON.stringify({type:'voice',speaking,proof:authorization.proof}));};
  const start=event=>{if(event.user_id===config.userId&&event.channel_id===config.channel){speaking=true;send();}};
  const stop=event=>{if(event.user_id===config.userId&&event.channel_id===config.channel){speaking=false;send();}};
  await sdk.subscribe('SPEAKING_START',start,{channel_id:config.channel});await sdk.subscribe('SPEAKING_STOP',stop,{channel_id:config.channel});
  const keepalive=setInterval(()=>{if(speaking)send();},2000);onStatus('Discord에서 말할 때 머리 위에 표시돼요.');
  return async()=>{speaking=false;send();closed=true;clearInterval(keepalive);try{await sdk.unsubscribe('SPEAKING_START',start,{channel_id:config.channel});await sdk.unsubscribe('SPEAKING_STOP',stop,{channel_id:config.channel});}catch{}};
}
