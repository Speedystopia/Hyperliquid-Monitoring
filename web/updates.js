'use strict';
(function(root){
 function createHistoryClient(fetcher,validate=()=>true){
  let version=null,etag=null,data=null;
  return {
   async load(nextVersion,signal){
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(data&&nextVersion===version)return {changed:false,data};
    const headers={};if(etag)headers['If-None-Match']=etag;
    const response=await fetcher('/api/history',{cache:'no-store',headers,signal});
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(response.status===304){if(!data)throw Error('History cache unavailable');version=nextVersion;return {changed:false,data};}
    if(!response.ok)throw Error('HTTP '+response.status);
    const candidate=await response.json();
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(!validate(candidate))throw Error('Invalid history snapshot');
    // Commit the cache only after a complete response, so aborts can be retried.
    etag=response.headers.get('ETag');version=etag?etag.replace(/^"|"$/g,''):nextVersion;data=candidate;
    return {changed:true,data};
   }
  };
 }
 function createPoller({check,hidden,timeout=setTimeout,cancel=clearTimeout}){
  let timer=null,controller=null,running=false,active=false,again=false;
  function clear(){if(timer!==null){cancel(timer);timer=null;}}
  function schedule(delay){clear();if(active&&!hidden())timer=timeout(run,delay);}
  async function run(){
   clear();if(!active||hidden())return;
   if(running){again=true;return;}
   running=true;controller=new AbortController();let delay=15000;
   try{delay=await check(controller.signal)||15000;}catch(error){if(error.name!=='AbortError')delay=15000;}
   finally{controller=null;running=false;const soon=again;again=false;if(active&&!hidden())schedule(soon?0:delay);}
  }
  return {
   resume(){active=true;run();},
   pause(){active=false;again=false;clear();controller?.abort();},
   request(){if(active&&!hidden())run();}
  };
 }
 const api={createHistoryClient,createPoller};if(typeof module!=='undefined')module.exports=api;else root.OilUpdates=api;
})(globalThis);
