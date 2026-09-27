// Unknown-label navigation regression using the real AQW login timeline.
// Uses a disposable tab; no credentials, login request or game server.
import assert from 'node:assert/strict';
const endpoint = process.env.CDP_URL || 'http://localhost:9234';
const target = await (await fetch(endpoint + '/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => { ws.onopen = resolve; });
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (!m.id) return;
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
}
try {
    await send('Security.setIgnoreCertificateErrors', { ignore: true });
    await send('Page.navigate', { url: 'https://localhost:4433/game/gamefiles/pixi-benchmark/play.html?autostart=0&backend=display-list' });
    let ready = false;
    for (let i = 0; i < 150; i++) {
        ready = await evaluate('!!window.pixiLiveControls?.player?.root?._children.find(n=>n.name==="scene")?.adapter?.$BgmcLogin');
        if (ready) break;
        await new Promise(r => setTimeout(r, 500));
    }
    assert.ok(ready, 'login runtime loaded');
    const result = await evaluate(`(()=>{
        const p=pixiLiveControls.player,g=p.root._children.find(n=>n.name==='scene').adapter;
        p.isPaused=true;
        const clip=g.$BgmcLogin,version=clip.loaderInfo.swfVersion,results=[];
        try {
            for(const swfVersion of [9,10]) {
                clip.loaderInfo._setSWFVersion(swfVersion);
                for(const stop of [false,true]) {
                    clip.$BggotoAndStop('Blank');
                    const before=clip.$BgcurrentFrame;
                    if(stop)clip.$BggotoAndStop('__missing_frame_label__');
                    else clip.$BggotoAndPlay('__missing_frame_label__');
                    results.push({swfVersion,stop,before,after:clip.$BgcurrentFrame,
                        playing:clip.adaptee.isPlaying});
                }
            }
            clip.$BggotoAndStop('Password');
            const named=clip.$BgcurrentFrame;
            clip.$BggotoAndStop('Blank');
            clip.$BggotoAndStop(String(named));
            return {version,results,named,numeric:clip.$BgcurrentFrame};
        } finally {clip.loaderInfo._setSWFVersion(version);}
    })()`);
    assert.equal(result.version,9,'AQW uses the legacy navigation rules');
    for(const r of result.results) {
        assert.ok(r.before>1,'moved away from the first frame');
        assert.equal(r.after,1,JSON.stringify(r));
        // AQW's Init frame script stops the clip, including after gotoAndPlay.
        assert.equal(r.playing,false,JSON.stringify(r));
    }
    assert.ok(result.named>1);
    assert.equal(result.numeric,result.named,'numeric frame strings still work');
    console.log(JSON.stringify(result,null,2));
} finally {
    await send('Page.close').catch(()=>{});ws.close();
}
