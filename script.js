(()=>{
const $=s=>document.querySelector(s);
// Cosmic Octave tones (octave-transposed orbital/rotation periods). Verify values against Cousto's table.
const P=[['Earth Year',136.10,'#7cf2c6'],['Earth Day',194.18,'#ff8a4c'],['Moon',210.42,'#ffe08a'],['Sun',126.22,'#ff5a36'],['Mercury',141.27,'#4fe3e8'],['Venus',221.23,'#ff7ec8'],['Mars',144.72,'#ff4d5e'],['Jupiter',183.58,'#ffa94d'],['Saturn',147.85,'#e6b8ff'],['Uranus',207.36,'#5cf0d8'],['Neptune',211.44,'#6c8cff'],['Pluto',140.25,'#b79cff']];
const BIN=[0,2,6,10],BN=['Binaural off','Binaural δ 2Hz','Binaural θ 6Hz','Binaural α 10Hz'];
const S={i:1,oct:1,hz:194.18*2,play:false,bin:0,shape:0,v3:0,vol:.6,amp:.3,mod:0,jr:false};
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);

/* ================= WebGL2 GPU sand ================= */
const cv=$('#gl'),bc=$('#bloom'),bx=bc.getContext('2d');
const gl=cv.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
if(!gl||!gl.getExtension('EXT_color_buffer_float')){$('#msg').style.display='grid';return}
const HEAD='#version 300 es\nprecision highp float;precision highp int;precision highp sampler2D;\n';
const mk=(vs,fs)=>{const p=gl.createProgram();[[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]].forEach(([t,s])=>{const h=gl.createShader(t);gl.shaderSource(h,HEAD+s);gl.compileShader(h);if(!gl.getShaderParameter(h,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(h));gl.attachShader(p,h)});gl.linkProgram(p);return p};
const L=(p,k)=>((p.l||(p.l={}))[k]??=gl.getUniformLocation(p,k));
const f1=(p,k,v)=>gl.uniform1f(L(p,k),v),f2=(p,k,a)=>gl.uniform2f(L(p,k),a[0],a[1]);

const FLD=`uniform vec2 uA,uB;uniform float uBl,uShape;
float fld(vec2 p,vec2 q){
 if(uShape<.5){vec2 t=p*.5+.5;float n=q.x*3.14159,m=q.y*3.14159;return cos(n*t.x)*cos(m*t.y)-cos(m*t.x)*cos(n*t.y);}
 float a=q.y-q.x+1.;return cos(a*atan(p.y,p.x))*cos(q.x*2.8*length(p)-a*1.5708-.7854);}
float F(vec2 p){return abs(mix(fld(p,uA),fld(p,uB),uBl));}`;
const upd=mk('void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0,1);}',FLD+`
uniform sampler2D uPos;uniform float uAmp,uT;out vec4 o;
float h(vec2 s){return fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);}
void main(){ivec2 c=ivec2(gl_FragCoord.xy);vec2 p=texelFetch(uPos,c,0).xy,fc=vec2(c);float e=.004,f=F(p);
 vec2 g=vec2(F(p+vec2(e,0))-F(p-vec2(e,0)),F(p+vec2(0,e))-F(p-vec2(0,e)))/(2.*e);
 vec2 r=vec2(h(fc+uT),h(fc.yx*1.7-uT))-.5;
 p-=g*.0008*uAmp*min(1.,f*6.);           // slide down toward nodal lines
 p+=r*.016*uAmp*smoothstep(0.,.5,f);      // plate shakes sand where it moves most
 if(uShape<.5)p=clamp(p,-1.,1.);else{float l=length(p);if(l>1.)p/=l;}
 o=vec4(p,0,1);}`);
const drw=mk(`uniform sampler2D uPos;uniform int uN;uniform vec2 uSc;uniform float uOff,uSize,uRX,uRY,uPersp,uAmp,uT;
void main(){ivec2 c=ivec2(gl_VertexID%uN,gl_VertexID/uN);vec3 p=vec3(texelFetch(uPos,c,0).xy,0.);
 p.z=sin(p.x*9.+uT*30.)*sin(p.y*7.-uT*25.)*.014*uAmp;
 float cy=cos(uRY),sy=sin(uRY),cx=cos(uRX),sx=sin(uRX);
 p=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);p=vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);
 float w=max(.35,1.-p.z*.4*uPersp);
 gl_Position=vec4(p.x*uSc.x,p.y*uSc.y+uOff,0.,w);gl_PointSize=uSize/w;}`,
`uniform vec3 uCol;out vec4 o;
void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=(1.-d)*(1.-d)*.3;o=vec4(uCol*a,a);}`);

const N=innerWidth<700?256:512;
const tx=[],fb=[];
for(let k=0;k<2;k++){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,N,N,0,gl.RGBA,gl.FLOAT,null);
 [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]].forEach(([a,b])=>gl.texParameteri(gl.TEXTURE_2D,a,b));
 const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);tx.push(t);fb.push(f)}
let cur=0;
function scatter(){const d=new Float32Array(N*N*4);for(let i=0;i<N*N;i++){d[i*4]=Math.random()*2-1;d[i*4+1]=Math.random()*2-1}
 tx.forEach(t=>{gl.bindTexture(gl.TEXTURE_2D,t);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,N,N,gl.RGBA,gl.FLOAT,d)})}
scatter();

/* mode morphing: field blends smoothly between old and new Chladni modes */
let A=[3,5],B=[3,5],bl=1;
const modes=f=>{const k=Math.sqrt(f)*.55,n=Math.floor(k);return[n,n+1+Math.floor((k*7.31%1)*3)]};
function retarget(f){const t=modes(f);if(t[0]!==B[0]||t[1]!==B[1]){A=bl>.5?B:A;B=t;bl=0}}

let W,H,dpr,sc=[1,1],off=0,psz=2;
function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cv.width=W*dpr|0;cv.height=H*dpr|0;bc.width=W>>2;bc.height=H>>2;
 const ph=$('#panel').offsetHeight+30,top=100,ah=Math.max(H-ph-top,170),half=Math.min(W*.96,ah)*.5;
 sc=[half/(W/2),half/(H/2)];off=1-2*(top+ah/2)/H;psz=1+half*dpr/240}
addEventListener('resize',resize);

let col=hex(P[1][2]),tc=col,last=performance.now(),vt=0,dx=0,dy=0,auto=0,shotReq=false;
function frame(now){
 requestAnimationFrame(frame);const dt=Math.min((now-last)/1e3,.05);last=now;
 const tgt=(S.play?.55+.45*S.vol:.3)*(1+S.mod*.8)*(S.play?1+.1*Math.sin(now/900):1);
 S.amp+=(tgt-S.amp)*Math.min(1,dt*2.5);bl=Math.min(1,bl+dt/1.8);vt+=(S.v3-vt)*Math.min(1,dt*3);auto+=dt*.12*vt;
 col=col.map((c,i)=>c+(tc[i]-c)*Math.min(1,dt*3));
 const b=bl*bl*(3-2*bl),t=now/1e3%100;
 // --- simulate (2 sub-steps) ---
 gl.useProgram(upd);gl.disable(gl.BLEND);gl.viewport(0,0,N,N);
 f2(upd,'uA',A);f2(upd,'uB',B);f1(upd,'uBl',b);f1(upd,'uShape',S.shape);f1(upd,'uAmp',S.amp);gl.uniform1i(L(upd,'uPos'),0);gl.activeTexture(gl.TEXTURE0);
 for(let s=0;s<2;s++){f1(upd,'uT',t+s*.013);gl.bindTexture(gl.TEXTURE_2D,tx[cur]);gl.bindFramebuffer(gl.FRAMEBUFFER,fb[1-cur]);gl.drawArrays(gl.TRIANGLES,0,3);cur=1-cur}
 // --- draw ---
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,cv.width,cv.height);gl.clearColor(.012,.016,.045,1);gl.clear(gl.COLOR_BUFFER_BIT);
 gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.useProgram(drw);gl.bindTexture(gl.TEXTURE_2D,tx[cur]);gl.uniform1i(L(drw,'uPos'),0);gl.uniform1i(L(drw,'uN'),N);
 f2(drw,'uSc',sc);f1(drw,'uOff',off);f1(drw,'uSize',psz);f1(drw,'uRX',vt*(.95+dy));f1(drw,'uRY',vt*(auto+dx));f1(drw,'uPersp',vt);f1(drw,'uAmp',S.amp);f1(drw,'uT',t);
 gl.uniform3f(L(drw,'uCol'),col[0],col[1],col[2]);gl.drawArrays(gl.POINTS,0,N*N);
 bx.drawImage(cv,0,0,bc.width,bc.height);
 if(shotReq){shotReq=false;cv.toBlob(bl_=>{const a=document.createElement('a');a.href=URL.createObjectURL(bl_);a.download='cymatics-'+Math.round(S.hz)+'hz.png';a.click()})}
}

/* ================= Web Audio ================= */
let AC,master,env=[],osc=[],midiTried=false;
function initAudio(){
 AC=new(window.AudioContext||window.webkitAudioContext)();
 master=AC.createGain();master.gain.value=S.vol*S.vol;
 const comp=AC.createDynamicsCompressor(),rv=AC.createConvolver(),wet=AC.createGain();wet.gain.value=.38;
 const len=AC.sampleRate*3,ir=AC.createBuffer(2,len,AC.sampleRate);
 for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3)}
 rv.buffer=ir;master.connect(comp);master.connect(rv);rv.connect(wet);wet.connect(comp);comp.connect(AC.destination);
 const wave=AC.createPeriodicWave(new Float32Array(6),new Float32Array([0,1,.32,.14,.06,.03]));
 const lfo=AC.createOscillator(),lg=AC.createGain();lfo.frequency.value=.17;lg.gain.value=.2;lfo.connect(lg);lfo.start();
 [-1,1].forEach((pan,k)=>{const o=AC.createOscillator(),e=AC.createGain(),br=AC.createGain(),p=AC.createStereoPanner();
  o.setPeriodicWave(wave);o.frequency.value=S.hz;e.gain.value=0;br.gain.value=1;p.pan.value=pan;lg.connect(br.gain);
  o.connect(e);e.connect(br);br.connect(p);p.connect(master);o.start();osc.push(o);env.push(e)});
 audioHz(true)}
function audioHz(now){if(!AC)return;const t=AC.currentTime,tc=now?.01:.28;
 osc[0].frequency.setTargetAtTime(S.hz,t,tc);osc[1].frequency.setTargetAtTime(S.hz+BIN[S.bin],t,tc)}
function audioGate(){if(!AC)return;const t=AC.currentTime;env.forEach(e=>e.gain.setTargetAtTime(S.play?.5:0,t,S.play?.6:.9))}
function unlock(){if(!AC)initAudio();if(AC.state==='suspended')AC.resume();if(!midiTried){midiTried=true;midi()}}

/* ================= MIDI ================= */
const held=[];let bend=0;
const mHz=()=>440*Math.pow(2,(held[held.length-1]-69)/12+bend);
function onMidi(e){const[s,a,v]=e.data,c=s&240;
 if(c===144&&v>0){held.push(a);S.i=-1;S.hz=mHz();retarget(S.hz);audioHz();if(!S.play)setPlay(true);ui()}
 else if(c===128||(c===144&&v===0)){const k=held.indexOf(a);if(k>-1)held.splice(k,1);if(held.length){S.hz=mHz();retarget(S.hz);audioHz();ui()}else setPlay(false)}
 else if(c===224){bend=(((v<<7)|a)-8192)/8192*2/12;if(held.length){S.hz=mHz();retarget(S.hz);audioHz();ui()}}
 else if(c===176&&a===1)S.mod=v/127}
async function midi(){try{const m=await navigator.requestMIDIAccess();const bind=()=>{let n=0;m.inputs.forEach(i=>{i.onmidimessage=onMidi;n++});$('#midi').textContent=n?`MIDI · ${n} device${n>1?'s':''}`:'MIDI · none found'};m.onstatechange=bind;bind()}catch{$('#midi').textContent='MIDI · unavailable'}}

/* ================= UI ================= */
const NN=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function note(f){const m=69+12*Math.log2(f/440),r=Math.round(m),c=Math.round((m-r)*100);return NN[(r%12+12)%12]+(Math.floor(r/12)-1)+' '+(c>=0?'+':'')+c+'¢'}
let st;const sync=()=>{clearTimeout(st);st=setTimeout(()=>{try{history.replaceState(null,'','?'+new URLSearchParams({p:S.i,o:S.oct,s:S.shape,v:S.v3}))}catch{}},400)};
const chips=$('#chips'),cb=[];
P.forEach((p,i)=>{const b=document.createElement('button');b.className='chip';b.innerHTML=`<i style="background:${p[2]}"></i>${p[0]}`;b.onclick=()=>pick(i);chips.append(b);cb.push(b)});
function ui(){
 $('#hz').innerHTML=S.hz.toFixed(2)+'<small>HZ</small>';
 $('#sub').textContent=note(S.hz)+' · '+(S.i>=0?P[S.i][0]:'Free tuning');
 cb.forEach((b,i)=>b.classList.toggle('on',i===S.i));
 const c=S.i>=0?P[S.i][2]:'#9aa0ff';tc=hex(c);document.documentElement.style.setProperty('--c',c);
 $('#ol').textContent='Oct '+(S.oct>0?'+':'')+S.oct;
 $('#shape').textContent=S.shape?'Circle plate':'Square plate';$('#view').textContent=S.v3?'3D view':'2D view';
 $('#bin').textContent=BN[S.bin];$('#bin').classList.toggle('on',S.bin>0);$('#jr').classList.toggle('on',S.jr);
 $('#play').textContent=S.play?'■ Stop':'▶ Play';
 $('#info').textContent=S.i>=0?`${P[S.i][0]} · Cosmic Octave tone (orbital/rotation period transposed up by octaves — a musical convention, not a physical sound).`:'Free tuning — MIDI or drag.';
 sync()}
function setHz(hz){S.hz=hz;retarget(hz);audioHz();ui()}
function pick(i){S.i=i;setHz(P[i][1]*Math.pow(2,S.oct))}
function setPlay(v){S.play=v;if(v)unlock();audioGate();wake();ui()}
function oct(d){const n=Math.max(-2,Math.min(3,S.oct+d));if(n===S.oct)return;S.oct=n;setHz(S.hz*Math.pow(2,d))}
const shape=()=>{S.shape^=1;ui()},view=()=>{S.v3^=1;dx=dy=0;ui()},bin=()=>{S.bin=(S.bin+1)%4;audioHz();ui()},jr=()=>{S.jr=!S.jr;ui()};
$('#play').onclick=()=>{unlock();setPlay(!S.play)};$('#om').onclick=()=>oct(-1);$('#op').onclick=()=>oct(1);
$('#shape').onclick=shape;$('#view').onclick=view;$('#bin').onclick=bin;$('#jr').onclick=jr;$('#sc').onclick=scatter;$('#shot').onclick=()=>shotReq=true;
$('#vol').oninput=e=>{S.vol=+e.target.value;if(AC)master.gain.setTargetAtTime(S.vol*S.vol,AC.currentTime,.05)};
setInterval(()=>{if(S.jr)pick((S.i+1)%P.length)},12000);

addEventListener('keydown',e=>{wake();if(e.target.tagName==='INPUT')return;const k=e.key.toLowerCase();
 if(k===' '){e.preventDefault();unlock();setPlay(!S.play)}
 else if(k==='arrowright')pick((S.i+1)%P.length);else if(k==='arrowleft')pick((S.i+P.length-1)%P.length);
 else if(k==='m')shape();else if(k==='v')view();else if(k==='b')bin();else if(k==='j')jr();else if(k==='r')scatter();
 else if(k==='f')document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.();
 else if(k==='s')shotReq=true;else if(/^[1-9]$/.test(k))pick(+k-1)});
let idle;function wake(){document.body.classList.remove('idle');clearTimeout(idle);idle=setTimeout(()=>S.play&&document.body.classList.add('idle'),4500)}
['pointermove','pointerdown','touchstart'].forEach(n=>addEventListener(n,wake,{passive:true}));
let drag=false,lx=0;
cv.addEventListener('pointerdown',e=>{drag=true;lx=e.clientX;cv.setPointerCapture(e.pointerId);unlock();if(!S.v3)tune(e)});
cv.addEventListener('pointerup',()=>drag=false);
cv.addEventListener('pointermove',e=>{if(!drag)return;if(S.v3){dx+=(e.clientX-lx)*.008;dy=Math.max(-.6,Math.min(.5,dy+(e.movementY||0)*.006));lx=e.clientX}else tune(e)});
function tune(e){S.i=-1;setHz(80*Math.pow(2,e.clientX/W*3))}

// restore from URL
try{const q=new URLSearchParams(location.search);if(q.has('o'))S.oct=Math.max(-2,Math.min(3,+q.get('o')||1));if(q.get('s')==='1')S.shape=1;if(q.get('v')==='1'){S.v3=1;vt=1}
 const p=+q.get('p');S.i=Number.isInteger(p)&&p>=0&&p<P.length?p:1}catch{}
S.hz=P[S.i][1]*Math.pow(2,S.oct);A=B=modes(S.hz);
resize();ui();wake();requestAnimationFrame(frame);requestAnimationFrame(resize);
})();
