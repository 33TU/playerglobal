// Integration regression: real AVM bindings and the animation helper from AQW's
// Awakenedbluecosmicaura asset. Uses a disposable tab; no login or game server.
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
    const result = await evaluate(`(async()=>{
        const p=pixiLiveControls.player,g=p.root._children.find(n=>n.name==='scene').adapter,s=g.sec;
        p.isPaused=true;
        const read=o=>o.axGetPublicProperty('focalLength');
        const projection=new s.flash.geom.PerspectiveProjection();
        const defaults={fov:projection.$BgfieldOfView,focal:read(projection),center:[projection.$BgprojectionCenter.$Bgx,projection.$BgprojectionCenter.$Bgy]};
        projection.$BgfieldOfView=90;const focal90=read(projection);
        projection.$BgfocalLength=500;const focal500=read(projection);
        const point=new s.flash.geom.Point(12,34);projection.$BgprojectionCenter=point;point.$Bgx=100;
        const center=projection.$BgprojectionCenter;center.$Bgy=200;
        const copiedCenter=[projection.$BgprojectionCenter.$Bgx,projection.$BgprojectionCenter.$Bgy];
        const matrix=projection.$BgtoMatrix3D(),raw=[...matrix.adaptee._rawData];
        let invalidFov=false,invalidFocal=false;
        try{projection.$BgfieldOfView=180;}catch(e){invalidFov=true;}
        try{projection.$BgfocalLength=0;}catch(e){invalidFocal=true;}
        const child=s.flash.display.MovieClip.axClass.axConstruct([]);g.$BgaddChild(child);
        const rootProjection=g.$Bgtransform.$BgperspectiveProjection;
        const rootFocal=read(rootProjection),rootExpected=g.$Bgstage.$BgstageWidth/(2*Math.tan(55*Math.PI/360));
        const childDefault=child.$Bgtransform.$BgperspectiveProjection;
        child.$Bgtransform.$BgperspectiveProjection=projection;
        projection.$BgfieldOfView=30;
        const assigned=child.$Bgtransform.$BgperspectiveProjection.$BgfieldOfView;
        const otherTransform=new s.flash.geom.Transform(child);
        const shared=otherTransform.$BgperspectiveProjection===child.$Bgtransform.$BgperspectiveProjection;
        child.$Bgtransform.$BgperspectiveProjection=null;
        const cleared=child.$Bgtransform.$BgperspectiveProjection;
        p.isPaused=false;
        const loader=new s.flash.display.Loader();
        await new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>reject(Error('asset load timeout')),60000);
            loader.$BgcontentLoaderInfo.$BgaddEventListener('complete',()=>{clearTimeout(timeout);resolve();});
            loader.$BgcontentLoaderInfo.$BgaddEventListener('ioError',()=>{clearTimeout(timeout);reject(Error('asset load failed'));});
            loader.$Bgload(new s.flash.net.URLRequest('/game/gamefiles/items/grounds/Awakenedbluecosmicaura.swf'));
        });
        p.isPaused=true;
        const helper=loader.$BgcontentLoaderInfo.$BgapplicationDomain.$BggetDefinition('privatePkg.___LayerProp___');
        // Previously throws at exactly applyZDepthAndColorEffectsHelper$1.js:235.
        for(let i=0;i<10;i++)helper.$BMapplyZDepthAndColorEffectsHelper(child);
        g.$BgremoveChild(child);g.$BgaddChild(child);
        helper.$BMapplyZDepthAndColorEffectsHelper(child);
        g.$BgremoveChild(child);
        return {defaults,focal90,focal500,copiedCenter,raw,invalidFov,invalidFocal,rootFocal,rootExpected,childDefault,assigned,shared,cleared,helper:'passed'};
    })()`);
    const near=(a,b)=>assert.ok(Math.abs(a-b)<0.001, `${a} != ${b}`);
    assert.equal(result.defaults.fov,55);
    near(result.defaults.focal,250/Math.tan(55*Math.PI/360));
    assert.deepEqual(result.defaults.center,[250,250]);
    near(result.focal90,250);near(result.focal500,500);
    assert.deepEqual(result.copiedCenter,[12,34]);
    assert.deepEqual(result.raw,[500,0,0,0,0,500,0,0,0,0,1,1,0,0,0,0]);
    assert.equal(result.invalidFov,true);assert.equal(result.invalidFocal,true);
    near(result.rootFocal,result.rootExpected);
    assert.equal(result.childDefault,null);assert.equal(result.cleared,null);
    near(result.assigned,Math.atan(0.5)*360/Math.PI);
    assert.equal(result.shared,true);
    assert.equal(result.helper,'passed');
    console.log(JSON.stringify(result,null,2));
} finally {
    await send('Page.close').catch(()=>{});ws.close();
}
