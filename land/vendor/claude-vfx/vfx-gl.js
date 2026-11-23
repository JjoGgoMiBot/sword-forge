/* VFX GL 렌더러 — vfx-engine.js 다음에 불러오면 Engine.render 가 이 경로를 쓴다(없으면 Canvas 2D 대체 경로).

   게임 VFX 표준 파이프라인을 그대로 따른다(라이엇·블리자드·Realtime VFX 커뮤니티 공통):
   1) 모양은 흑백 세기(intensity)로만 만든다  → 셰이더가 노이즈 텍스처로 결·가닥·침식을 픽셀 단위로 계산
   2) 색은 그라디언트 맵(램프 텍스처)으로 칠한다 → 세기 1=흰 핵, 0.5=채도 높은 몸통, 0.1=어두운 가장자리
   3) 사라짐은 알파 침식(노이즈 > 나이 문턱값)   → 가장자리가 타들어가듯 뜯기며, 경계는 잠깐 더 밝다(burn)
   4) 블룸은 밝은 부분만 추출해 다운샘플 체인     → 핵 주변만 번지고 몸통·연기는 번지지 않음
   5) 층: 어두운 뒷층·연기(일반 합성) → 칼·캐릭터 → 빛층(가산) → 블룸
*/
(function (root) {
  'use strict';
  const V = root.VFX;
  if (!V) return;
  const { clamp, lerp, hex, smooth } = V;
  const TAU = Math.PI * 2;
  const rnd = (r) => (Array.isArray(r) ? lerp(r[0], r[1], Math.random()) : (r == null ? 0 : r));
  /** 트레일 모양 → {id, in, out}. 칼날(blade)·없음이면 null(기존 초승달) */
  const shapeOf = (tr) => { const s = V.SHAPES && V.SHAPES[tr.shape]; return s && s.id ? s : null; };

  /* ---------------- 셰이더 ---------------- */
  const VS = `
attribute vec2 aPos; attribute vec2 aUV; attribute vec4 aP; attribute vec2 aK;
uniform vec3 uMx; uniform vec3 uMy;
varying vec2 vUV; varying vec4 vP; varying vec2 vK;
void main(){ vUV=aUV; vP=aP; vK=aK; gl_Position=vec4(dot(uMx,vec3(aPos,1.)), dot(uMy,vec3(aPos,1.)), 0., 1.); }`;

  // 검기 띠: vUV.x = 호 길이(노이즈 좌표), vUV.y = 0 안쪽 → 1 바깥 날. vP = 나이, 앞뒤 위치, 굵기 윤곽, 페이드
  // 원소별 모양(shape)에 같이 쓰는 함수: 해시·선분·룬 문자
  const GLSL_LIB = `
float hs(float x){ return fract(sin(x*91.345+0.7)*47453.5453); }
// 보로노이 칸 id: 격자 칸(사각 덩어리) 대신 크기·모양이 제각각인 깨진 조각 칸
float vorId(vec2 g){
  vec2 gi=floor(g), gf=fract(g); float md=8., id=0.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 o=vec2(float(i),float(j)), c=gi+o;
    vec2 r=o+0.15+0.7*vec2(hs(dot(c,vec2(1.,57.))),hs(dot(c,vec2(17.,3.1))))-gf;
    float d=dot(r,r); if(d<md){ md=d; id=hs(dot(c,vec2(7.3,13.1))); }
  }
  return id;
}
float seg(vec2 p, vec2 a, vec2 b, float w){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return 1.-smoothstep(w*0.5,w,length(pa-ba*h)); }
float glyph(float id, vec2 p){
  if(p.x<0.||p.x>1.||p.y<0.||p.y>1.) return 0.;
  vec2 A=vec2(.2,.15),B=vec2(.8,.15),C=vec2(.2,.85),D=vec2(.8,.85),T=vec2(.5,.15),U=vec2(.5,.85),L=vec2(.2,.5),R=vec2(.8,.5);
  float g=0., w=0.13;
  if(hs(id)>.35) g=max(g,seg(p,T,U,w));
  if(hs(id+1.)>.55) g=max(g,seg(p,A,C,w));
  if(hs(id+2.)>.55) g=max(g,seg(p,B,D,w));
  if(hs(id+3.)>.6) g=max(g,seg(p,A,U,w));
  if(hs(id+4.)>.6) g=max(g,seg(p,B,U,w));
  if(hs(id+5.)>.5) g=max(g,seg(p,L,R,w));
  if(hs(id+6.)>.6) g=max(g,seg(p,C,D,w));
  if(hs(id+7.)>.65) g=max(g,seg(p,A,B,w));
  return g;
}`;

  // 검기 띠: vUV.x = 호 길이(노이즈 좌표), vUV.y = 0 안쪽 → 1 바깥 날. vP = 나이, 앞뒤 위치, 굵기 윤곽, 페이드
  // uShape: 0 칼날 초승달, 1 불(바깥으로 솟는 불혀), 2 얼음(톱니 결정), 3 눈(가루 안개), 4 번개(갈라지는 전광),
  //         5 비전(룬 고리), 6 신성(곧은 빛기둥), 7 독(끈적한 방울·흘러내림), 8 어둠(연기 촉수·검은 속)
  // uIn·uOut: 띠 바깥으로 모양이 넘치는 폭(띠 굵기 배수). v는 0~1이 원래 띠, 음수=안쪽, 1 넘음=바깥
  const FS_TRAIL = `
precision mediump float;
uniform sampler2D uNoise; uniform sampler2D uRamp;
uniform float uRow, uT, uScroll, uSoft, uAmt, uCel, uTurb, uInten, uLayer, uStyle, uBackA, uSeed, uShape, uIn, uOut;
uniform vec2 uFreq; uniform vec3 uBack;
varying vec2 vUV; varying vec4 vP;
${GLSL_LIB}
void main(){
  float age=vP.x, u01=vP.y, prof=vP.z, fade=vP.w, y=vUV.y;
  float vx=y*(1.+uIn+uOut)-uIn;           // 모양 좌표(넘침 포함)
  float v=clamp(vx,0.,1.);
  float a0=vUV.x;                          // 호 각도(라디안)
  float s=vUV.x*uFreq.x;
  // 영역 왜곡(Turbulent Displace): 결 방향 노이즈를 한 번 더 비틀어 손으로 그은 붓결처럼
  float w=texture2D(uNoise, vec2(s*0.31 - uT*uScroll*0.45 + uSeed, v*0.8)).a-0.5;
  float nS=texture2D(uNoise, vec2(s - uT*uScroll + uSeed, v*uFreq.y + w*uTurb)).g;
  float nE=texture2D(uNoise, vec2(s*0.55 + 3.7 + uSeed, v*1.5 - uT*0.12)).r;
  float n=nE*0.72+nS*0.28;
  float sh=uShape;
  // 침식 결: 얼음은 조각나듯(덩어리), 신성은 큰 얼룩+잔 결(고르게 누르면 띠 전체가 한꺼번에 흐려져 매끈한 도형으로 읽힘), 비전은 문자 칸마다
  if(sh>1.5&&sh<2.5) n=vorId(vec2(a0*16.+uSeed,vx*4.))*0.8+n*0.2;
  else if(sh>5.5&&sh<6.5) n=texture2D(uNoise, vec2(a0*0.8+uSeed*0.7, vx*0.9+0.2)).r*0.55+n*0.45;
  else if(sh>4.5&&sh<5.5) n=hs(floor(a0*9.-uT*1.2+uSeed)*1.7)*0.6+n*0.4;
  // 침식 문턱값: 나이에 따라 올라가고 바깥 날(v=1)은 늦게 먹힌다(하이라이트가 끝까지 남음)
  float th=pow(age,1.1)*uAmt-0.12-clamp(vx,-0.3,1.2)*0.3;
  float m=smoothstep(th, th+uSoft, n);
  if(uLayer>0.5){
    float bs;
    if(sh<0.5) bs=smoothstep(0.,0.55,v)*(1.-smoothstep(0.9,1.,v));
    else if(sh>7.5){   // 어둠: 모양을 따라가는 검은 공허(연기 경계)
      float e=vx+(nS-0.5)*0.7+(w)*0.6;
      bs=smoothstep(-uIn,0.25,e)*(1.-smoothstep(0.75,1.+uOut*0.75,e))*1.4;
    } else bs=smoothstep(-0.15,0.45,vx)*(1.-smoothstep(0.85,1.08,vx));
    float a=clamp(uBackA*bs*m*prof*fade*(0.55+0.7*nS),0.,1.);
    gl_FragColor=vec4(uBack*a,a); return;
  }
  float I=0.;
  if(sh>0.5){
    float burnS=(1.-smoothstep(th+uSoft*0.08, th+uSoft*0.45, n))*smoothstep(0.04,0.18,age);
    if(sh<1.5){            // 불: 아래(안쪽)는 뜨겁고 바깥으로 갈수록 붉게 식으며 솟는 불혀
      float yy=(vx+uIn)/(1.+uIn+uOut);
      float f1=texture2D(uNoise, vec2(a0*1.1+uSeed, yy*1.1 - uT*1.7)).r;
      float f2=texture2D(uNoise, vec2(a0*2.6+uSeed*1.3, yy*2.3 - uT*2.9)).g;
      float tg=0.5+0.5*sin(a0*13.+f1*5.+uSeed);          // 불혀 사이 골
      float f=f1*0.55+f2*0.3+tg*0.25;
      float hgt=1.+uOut*(1.-age*0.7);                    // 타면서 불꽃이 낮아진다
      float fall=(vx-0.15)/max(0.2,hgt-0.15);
      I=f*1.45-fall*1.25+0.05;
      I*=smoothstep(-uIn,0.2,vx);
      I=clamp(I,0.,1.25)*(0.55+0.6*(1.-clamp(fall,0.,1.)));
      I*=m*(1.+burnS*0.6);
    } else if(sh<2.5){     // 얼음: 바깥 날이 톱니처럼 솟은 결정, 두 면 음영 + 밝은 능선·테두리
      // 간격·높이·기울기를 제각각으로: 같은 간격 톱니가 반복되면 접이식 부채살처럼 읽힌다
      float c=a0*11.+uSeed+0.55*sin(a0*23.+uSeed*3.)+0.3*sin(a0*41.+uSeed), ci=floor(c), cx=fract(c);
      float lean=0.25+0.5*hs(ci+7.1); cx=cx<lean?cx/lean*0.5:0.5+(cx-lean)/(1.-lean)*0.5;   // 꼭짓점을 칸마다 다른 곳에
      float tri=1.-abs(2.*cx-1.);
      float hh=0.08+1.05*pow(hs(ci),1.7);
      float top=1.+uOut*hh*pow(tri,1.2);
      float c2=a0*17.+uSeed*2., t2=1.-abs(2.*fract(c2)-1.);
      float bot=0.1-uIn*hs(floor(c2)+3.)*t2;
      float inside=smoothstep(bot-0.02,bot+0.02,vx)*(1.-smoothstep(top-0.025,top,vx));
      float face=cx<0.5?0.6+0.4*hs(ci+1.3):0.35+0.3*hs(ci+2.9);   // 결정면 두 개(칸마다 밝기가 달라 줄무늬로 안 읽힘)
      float blk=vorId(vec2(a0*7.+uSeed,vx*3.)); // 깨진 조각 면(보로노이)
      float rim=1.-smoothstep(0.,0.07,top-vx);
      float ridge=(1.-smoothstep(0.,0.05,abs(cx-0.5)))*smoothstep(0.85,1.,vx)*step(0.55,hh);   // 큰 가시에만 능선
      float keep=smoothstep(0.12,0.2,vorId(vec2(a0*5.+uSeed*1.7,vx*2.2+0.4)));   // 조각 몇 개를 빼서 통판(부채)이 아니라 깨진 판으로
      I=inside*keep*(0.22+0.22*face+0.18*blk+0.55*rim+0.4*ridge);
      I*=m*(1.+burnS*0.4);
    } else if(sh<3.5){     // 눈: 딱딱한 경계 없는 가루 안개 + 반짝이는 눈가루
      float cl=texture2D(uNoise, vec2(a0*0.7 - uT*0.25+uSeed, (vx+uIn)*0.6)).r;
      float cl2=texture2D(uNoise, vec2(a0*1.9+uSeed, vx*1.2 - uT*0.15)).g;
      float env=smoothstep(-uIn,0.35,vx+(cl-0.5)*0.6)*(1.-smoothstep(0.55,1.+uOut,vx+(cl2-0.5)*0.5));
      I=env*(0.18+0.42*cl*cl2*1.6);
      vec2 g=vec2(a0*55.+uSeed, vx*9.); vec2 gi=floor(g), gf=fract(g);
      float id=gi.x*13.1+gi.y*7.7;
      vec2 sp=vec2(hs(id+1.3),hs(id+2.9));
      float tw=0.5+0.5*sin(uT*14.+id);
      float dot1=(1.-smoothstep(0.,0.16,length(gf-sp)))*step(0.82,hs(id))*tw;
      I+=dot1*env*1.1;
      I=min(I,0.62+dot1*0.4);                           // 몸통은 하얀 핵 없이(눈은 부드럽게)
      I*=smoothstep(th-0.1, th+uSoft*2., n);
    } else if(sh<4.5){     // 번개: 희미한 띠 위로 지그재그 전광 2~3줄이 1초에 20번 새로 갈라진다
      float band=pow(max(0.,1.-abs(2.*v-1.)),2.)*(0.1+0.25*nS)*smoothstep(-0.1,0.2,vx)*(1.-smoothstep(0.9,1.1,vx));
      float lead=1.-smoothstep(0.,0.35,age);              // 진행 방향 선두(막 지나간 자리)가 가장 밝고 두껍다
      // 바탕 띠는 중간 명도까지만(순백은 전광 심에만). 전광끼리는 심은 최댓값, 번짐도 최댓값으로 합쳐 겹친 자리가 하얗게 뭉치지 않게
      I=band*(1.+0.6*lead);
      float C=0., G=0.;
      for(int k=0;k<4;k++){
        float fk=float(k), ph=floor(uT*20.+fk*3.7)+fk*17.;
        // 전광은 휘두른 방향을 따라 흐른다: 줄마다 정한 높이(base) 둘레로만 꺾이고(큰 마디+잔 마디), 띠를 가로질러 W자로 오가지 않는다
        // 마디 길이는 꺾임 폭의 2~3배(짧은 마디에 큰 꺾임 = 반지름 방향 잔털로 읽힘)
        float fr=k==3?9.:5.+fk*1.5; float q=a0*fr+uSeed, qi=floor(q), qf=fract(q);
        float base=k==0?0.86:(k==1?0.58:(k==2?0.3:1.+uOut*0.3)), amp=(k==3?0.3:0.2)*(1.+0.3*lead);
        float pa=base+amp*(2.*hs(qi+ph*3.1)-1.), pb=base+amp*(2.*hs(qi+1.+ph*3.1)-1.);
        float q2=q*3.1, j2=floor(q2), f2=fract(q2);
        float ja=hs(j2*1.3+ph)-0.5, jb=hs((j2+1.)*1.3+ph)-0.5;
        float pv=mix(pa,pb,qf)+mix(ja,jb,f2)*amp*0.45;
        float slope=(pb-pa)*fr*0.55+(jb-ja)*amp*0.45*fr*3.1*0.55;
        float d=abs(vx-pv)/sqrt(1.+slope*slope);
        // 마디가 군데군데 끊긴다. 끊긴 쪽 끝만 가늘게 사라져 반지름 방향 칼자국(쐐기)이 남지 않게
        float on=step(0.25,hs(qi*1.7+ph)), onP=step(0.25,hs((qi-1.)*1.7+ph)), onN=step(0.25,hs((qi+1.)*1.7+ph));
        on*=mix(smoothstep(0.,0.35,qf),1.,onP)*mix(1.-smoothstep(0.65,1.,qf),1.,onN);
        float wd=(k==3?0.6:1.)*(1.+0.25*lead);               // k=3: 짧고 가는 잔가지 아크. 선두는 조금만 굵게(흰 심이 면처럼 번지지 않게)
        float core=1.-smoothstep(0.008*wd,0.022*wd,d), glo=exp(-d*d*110./(wd*wd));
        float wt=k==0?1.:(k==3?0.55*step(0.55,hs(qi*2.3+ph)):0.75);
        float kf=on*wt*(1.-smoothstep(0.5,0.92,age));
        C=max(C,core*(0.75+0.5*lead)*kf); G=max(G,glo*(0.3+0.2*lead)*kf);
      }
      // 심을 뺀 몸통(띠+번짐)은 뒤에서 곱하는 세기(uInten)를 거쳐도 중간~밝은 파랑에 머물게 상한을 둔다.
      // 상한이 없으면 선두(lead)에서 번짐 4줄이 띠 전체를 덮어 세기 곱 뒤 1을 넘고, 선두 구간이 통째로 흰 덩어리가 된다
      I=I*(1.-G)+G+C;
      I*=smoothstep(th-0.2,th+uSoft,n);
    } else if(sh<5.5){     // 비전: 가는 두 고리 + 사이를 흐르는 룬 문자 + 바깥 눈금
      float r1=1.-smoothstep(0.012,0.03,abs(vx-0.97));
      float r2=1.-smoothstep(0.01,0.025,abs(vx-0.08));
      float gx=a0*9.-uT*1.2+uSeed, gi=floor(gx);
      vec2 gp=vec2(fract(gx), (vx-0.24)/0.6);
      gp.x=(gp.x-0.5)*1.45+0.5;
      float gl=glyph(gi, gp);
      float tick=(1.-smoothstep(0.,0.12,abs(fract(a0*40.+uSeed)-0.5)*2.-0.8))*smoothstep(1.0,1.04,vx)*(1.-smoothstep(1.06,1.12,vx));
      float fill=smoothstep(0.05,0.3,vx)*(1.-smoothstep(0.8,1.,vx))*0.1;
      I=r1*0.95+r2*0.6+gl*0.85+tick*0.7+fill;
      I*=m;
    } else if(sh<6.5){     // 신성: 결이 흐르는 빛 띠(안·바깥 가장자리가 노이즈로 들쭉날쭉) + 바깥으로 뻗는 뾰족한 빛줄기
      float eo=texture2D(uNoise, vec2(a0*2.3+uSeed*1.7, 0.37+uT*0.08)).r-0.5;   // 바깥 가장자리 높낮이
      float ei=texture2D(uNoise, vec2(a0*1.6+uSeed+5.1, 0.71-uT*0.05)).g-0.5;   // 안쪽 가장자리(깊게 패임)
      float fib=texture2D(uNoise, vec2(a0*0.9+uSeed*0.5-uT*uScroll*0.3, vx*5.5+w*1.5)).r;   // 호를 따라 흐르는 빛결
      float fine=texture2D(uNoise, vec2(a0*6.+uSeed*2.3, vx*1.7+0.5)).b-0.5;          // 가장자리 잔 톱니(규칙 없는 들쭉날쭉)
      float outer=0.95+eo*0.34+fine*0.12+w*0.04, inner=-0.05+ei*0.8+fine*0.1;
      float body=smoothstep(inner, inner+0.45, vx)*(1.-smoothstep(outer-0.06, outer+0.02, vx));
      // 띠를 호 방향으로 군데군데 끊는다: 큰 얼룩 노이즈가 낮은 곳은 비어 초승달 윤곽이 이어지지 않는다
      float gap=texture2D(uNoise, vec2(a0*1.3+uSeed*0.9, vx*0.5+0.6)).r+fine*0.25;
      body*=smoothstep(0.36,0.56,gap);
      float bandI=pow(body,1.3)*(0.3+0.65*fib)*0.85;
      // 빛줄기: 칸 간격을 비틀어 빗살처럼 같은 간격으로 반복되지 않게, 끝으로 갈수록 가늘어져 뾰족하게
      float c=a0*12.+uSeed+0.6*sin(a0*7.+uSeed*2.)+0.35*sin(a0*19.+uSeed), ci=floor(c), cx=fract(c);
      float L=uOut*(0.2+0.8*pow(hs(ci),1.5))*smoothstep(0.,0.25,age+0.05);
      float tt=clamp((vx-outer+0.08)/max(0.01,L),0.,1.);                     // 줄기 뿌리 0 → 끝 1
      float wd=(0.06+0.12*hs(ci+5.))*(1.-tt)*(0.8+0.4*fib);
      float ctr=0.5+(hs(ci+3.)-0.5)*0.5+(eo)*0.2;                            // 줄기 위치도 칸 가운데서 비켜남
      float shaft=(1.-smoothstep(wd*0.35,wd+0.001,abs(cx-ctr)))*step(0.35,hs(ci+9.))*smoothstep(outer-0.2,outer,vx)*(1.-tt*tt);
      I=bandI+shaft*0.85;
      I*=m*(1.+burnS*0.7);
    } else if(sh<7.5){     // 독: 울퉁불퉁 끈적한 띠 + 안쪽으로 늘어지는 방울 + 거품 테
      float lump=texture2D(uNoise, vec2(a0*1.4+uSeed, 0.3+uT*0.05)).r-0.5;
      float lump2=texture2D(uNoise, vec2(a0*1.9+uSeed+4.,0.7)).g-0.5;
      float top=0.95+lump*0.35, bot=0.3+lump2*0.4;
      float goo=smoothstep(bot-0.03,bot+0.03,vx)*(1.-smoothstep(top-0.03,top+0.03,vx));
      float c=a0*8.+uSeed, ci=floor(c), cx=fract(c);
      float Ld=uIn*(0.35+0.65*hs(ci+2.))*smoothstep(0.,0.7,age+0.15)*step(0.4,hs(ci));
      float dx=(cx-0.5)*0.24, tip=bot-Ld;
      float col=(1.-smoothstep(0.022,0.035,abs(dx)*(1.+0.6*smoothstep(bot,tip,vx))))*step(tip,vx)*step(vx,bot+0.05);
      float bulb=1.-smoothstep(0.05,0.075,length(vec2(dx,vx-tip)));
      float shape=max(goo,max(col,bulb*step(0.02,Ld)));
      float gloss=(1.-smoothstep(0.,0.08,top-vx))*goo*0.5+bulb*(1.-smoothstep(0.,0.03,length(vec2(dx+0.02,vx-tip-0.025))))*0.6;
      vec2 b=vec2(a0*22.+uSeed, vx*4.); vec2 bi=floor(b), bf=fract(b);
      float id=bi.x*3.7+bi.y*11.3, br=0.18+0.18*hs(id+4.);
      float bub=exp(-pow((length((bf-vec2(hs(id+1.),hs(id+2.)))*vec2(1.,0.5))-br)/0.035,2.))*step(0.7,hs(id))*goo;
      I=shape*(0.3+0.3*nS)+gloss+bub*0.7;
      I*=smoothstep(th,th+uSoft,n+0.15*(1.-goo));
    } else {               // 어둠: 가는 보라 테두리, 거의 검은 속, 밖으로 감기는 연기 촉수
      float rim=1.-smoothstep(0.015,0.05,abs(vx-0.96+(nS-0.5)*0.08));
      float rg=texture2D(uNoise, vec2(a0*0.9+vx*0.35+uSeed, vx*0.45 - uT*0.4)).a;
      float rg2=texture2D(uNoise, vec2(a0*1.7-vx*0.3+uSeed*1.4, vx*0.6 - uT*0.3)).a;
      float tent=pow(rg,7.)+pow(rg2,9.)*0.7;
      float outer=smoothstep(0.85,1.05,vx)*(1.-smoothstep(1.,1.+uOut,vx));
      float innerT=smoothstep(-uIn,0.1,vx)*(1.-smoothstep(0.1,0.4,vx));
      float core=smoothstep(0.1,0.5,vx)*(1.-smoothstep(0.85,0.95,vx));
      I=rim*0.75+tent*(outer*0.8+innerT*0.5)+core*0.05*nS;
      I*=m*(1.+burnS*0.8);
    }
    I*=prof*mix(0.7,1.05,smoothstep(0.,0.9,u01))*fade*uInten;
    I=pow(clamp(I,0.,1.),1.15);
    vec3 cc=texture2D(uRamp, vec2(I*0.996+0.002, uRow)).rgb;
    vec3 oo=cc*smoothstep(0.,0.08,I);
    gl_FragColor=vec4(oo, max(oo.r,max(oo.g,oo.b))); return;
  }
  if(uStyle>0.5){
    I=pow(max(0.,1.-abs(2.*v-1.)),1.6)*(0.2+1.0*nS);
  } else {
    float edge=smoothstep(0.68,0.95,v)*(1.-smoothstep(0.972,1.,v));
    float body=pow(v,1.6);
    float inner=smoothstep(0.,0.3,v-0.12+(nS-0.55)*1.1);   // 안쪽 가장자리를 결 따라 갈라진 가닥으로
    I=(body*(0.12+0.78*nS)+edge*(0.75+0.45*nS))*inner;
    float fresh=1.-smoothstep(0.,0.11,age);              // 막 지나간 자리: 흰 스미어
    I+=fresh*0.35*smoothstep(0.55,0.95,v)*inner;
  }
  float burn=(1.-smoothstep(th+uSoft*0.08, th+uSoft*0.45, n))*smoothstep(0.04,0.18,age);
  I*=m*(1.+burn*0.9);
  I*=prof*mix(0.62,1.08,smoothstep(0.,0.9,u01))*fade*uInten;
  if(uCel>0.5){ float f=I*uCel; I=(floor(f)+smoothstep(0.3,0.7,fract(f)))/uCel; }
  I=pow(clamp(I,0.,1.),1.3);
  vec3 c=texture2D(uRamp, vec2(I*0.996+0.002, uRow)).rgb;
  vec3 o=c*smoothstep(0.,0.1,I);
  gl_FragColor=vec4(o, max(o.r,max(o.g,o.b)));
}`;

  // 스프라이트(입자·타격·선): vK.x = 종류, vK.y = 램프 행, vP = 나이, 씨앗, 세기, 종류별 값
  const FS_SPRITE = `
precision mediump float;
uniform sampler2D uNoise; uniform sampler2D uRamp; uniform float uT;
varying vec2 vUV; varying vec4 vP; varying vec2 vK;
${GLSL_LIB}
void main(){
  float kind=vK.x, row=vK.y, age=vP.x, seed=vP.y, gain=vP.z, ex=vP.w;
  vec2 p=vUV; float I=0.;
  if(kind<1.5){            // 바늘: 양끝 뾰족, ex로 굵은 지점 이동(1=가운데, >1 머리쪽)
    float h=(p.x+1.)*0.5;
    float wp=pow(max(0.,sin(3.14159*pow(h,ex))),0.85);
    float d=abs(p.y)/max(wp,0.001);
    I=(1.-smoothstep(0.,0.3,d))+(1.-smoothstep(0.15,1.,d))*0.4;
  } else if(kind<2.5){     // 불씨: 뜨거운 점 + 짧은 번짐
    float r=length(p); I=exp(-r*r*10.)*1.15+exp(-r*4.)*0.2;
  } else if(kind<3.5){     // 연기(뒷층, 일반 합성): 노이즈로 일그러진 덩어리가 침식되며 사라짐
    float r=length(p);
    vec2 nu=p*0.3+vec2(seed,seed*1.37)+vec2(0.,uT*0.04);
    float n=texture2D(uNoise,nu).r, n2=texture2D(uNoise,nu*2.2+0.31).g;
    float d=r+(n-0.5)*0.95;
    float m=1.-smoothstep(0.2,0.92,d);
    float th=age*0.9-0.12; m*=smoothstep(th,th+0.28,n2);
    float a=clamp(m*gain,0.,1.);
    vec3 c=texture2D(uRamp,vec2(0.15+0.7*n2,row)).rgb;
    gl_FragColor=vec4(c*a,a); return;
  } else if(kind<4.5){     // 얼음 파편: 씨앗마다 꼭짓점 3~5개의 깨진 다각형, 조각면마다 밝기가 다르고 금 간 능선·밝은 테
    float nv=3.+floor(hs(seed*1.7)*3.), sec=6.28318/nv, off=hs(seed*0.9);
    float an=atan(p.y,p.x); if(an<0.) an+=6.28318;
    float t=an/sec-off; if(t<0.) t+=nv;
    float i=floor(t), j0=mod(i,nv), j1=mod(i+1.,nv);
    float r0=0.5+0.5*hs(seed*2.3+j0*5.7), r1=0.5+0.5*hs(seed*2.3+j1*5.7);
    float b0=(j0+off)*sec, b1=(j0+1.+off)*sec;
    vec2 v0=r0*vec2(cos(b0),sin(b0)), v1=r1*vec2(cos(b1),sin(b1));
    vec2 e=v1-v0, nI=normalize(vec2(-e.y,e.x)); if(dot(nI,-v0)<0.) nI=-nI;
    float dist=dot(p-v0,nI);
    float m=smoothstep(0.,0.05,dist);
    float facet=0.3+0.6*hs(seed*3.1+j0*7.3);
    float h=clamp(dot(p,v0)/dot(v0,v0),0.,1.), ridge=1.-smoothstep(0.,0.05,length(p-v0*h));
    float rim=1.-smoothstep(0.03,0.16,dist);
    I=m*(0.45*facet+0.55*rim+0.5*ridge);
  } else if(kind<5.5){     // 섬광 핵: 불규칙한 가시가 난 별(원 그대로 금지)
    float r=length(p), an=atan(p.y,p.x)/6.28318;
    float sp=texture2D(uNoise,vec2(an*ex+seed,seed*0.37)).g;
    sp=pow(sp,2.2);
    float rr=r/(0.1+0.95*sp);
    I=exp(-r*r*55.)*1.25+pow(1.-smoothstep(0.,1.,rr),1.6)*0.85;
  } else if(kind<6.5){     // 충격파: 노이즈로 흔들리고 나이에 따라 끊어지는 고리
    float r=length(p), an=atan(p.y,p.x)/6.28318;
    float n=texture2D(uNoise,vec2(an*3.+seed,age*0.3)).r;
    float R=ex+(n-0.5)*0.07, wd=0.035+0.05*(1.-age);
    I=exp(-pow((r-R)/wd,2.))*(0.55+0.6*n);
    float br=texture2D(uNoise,vec2(an*5.+seed*1.3,0.5)).g;
    I*=smoothstep(age*1.15-0.25,age*1.15+0.02,br);
  } else if(kind<7.5){     // 반짝임: 네 갈래 십자 별
    float ax=abs(p.x), ay=abs(p.y);
    I=(exp(-ax*16.)*exp(-ay*2.6)+exp(-ay*16.)*exp(-ax*2.6))*0.85+exp(-(ax*ax+ay*ay)*36.)*0.7;
  } else if(kind<8.5){     // 번개 마디: 아주 가는 흰 심 + 넓은 색 번짐(심이 굵으면 밝은 픽셀 대부분이 순백 → 색이 안 읽힘)
    float d=abs(p.y); I=(1.-smoothstep(0.,0.08,d))*0.85+(1.-smoothstep(0.04,1.,d))*0.24;   // 번짐은 램프의 파란 구간(0.3대)에 머물게
  } else if(kind<9.5){     // 불꽃(눈물 모양): +x가 끝, 아래는 뜨겁고 끝은 붉게 식으며 일렁임
    float h=(p.x+1.)*0.5;
    float wob=(texture2D(uNoise,vec2(h*0.5-uT*1.4+seed,seed*0.7)).r-0.5)*0.7*h;
    float wp=0.85*pow(max(0.,1.-h),0.75)*smoothstep(0.,0.22,h)+0.001;
    float d=abs(p.y-wob)/wp;
    float n=texture2D(uNoise,vec2(h*0.8-uT*2.+seed,p.y*0.4+seed)).g;
    I=(1.-smoothstep(0.35,1.,d))*(1.2-h*0.95)*(0.75+0.5*n);
    I*=smoothstep(age*0.9-0.15,age*0.9+0.2,n+0.2);
  } else if(kind<10.5){    // 안개 덩어리: 부드럽고 경계가 일렁이는 흐린 구름(하얀 핵 없음)
    float r=length(p);
    float n=texture2D(uNoise,p*0.3+vec2(seed,seed*1.3)+vec2(0.,uT*0.05)).r;
    I=(1.-smoothstep(0.15,1.,r+(n-0.5)*0.7))*0.24*(0.5+0.7*n);
  } else if(kind<11.5){    // 마법진: 두 고리 + 고리 사이 룬 + 육망성, 나이에 따라 그려 나감
    float r=length(p), an=atan(p.y,p.x);
    float g=0.;
    g+=1.-smoothstep(0.012,0.028,abs(r-0.95));
    g+=(1.-smoothstep(0.01,0.022,abs(r-0.78)))*0.8;
    g+=(1.-smoothstep(0.008,0.02,abs(r-0.4)))*0.6;
    float ga=(an/6.28318+0.5)*18.; vec2 gp=vec2(fract(ga),(r-0.8)/0.13); gp.x=(gp.x-0.5)*1.3+0.5;
    g+=glyph(floor(ga)+seed,gp)*0.8;
    for(int k=0;k<6;k++){ float t=float(k)*1.0472+0.5236; vec2 nk=vec2(cos(t),sin(t)); g+=(1.-smoothstep(0.008,0.02,abs(dot(p,nk)-0.375)))*step(r,0.76)*0.7; }
    float rev=step(an/6.28318+0.5, smoothstep(0.,0.35,age)*1.02);
    I=g*rev;
  } else if(kind<12.5){    // 액체 방울: 둥근 머리(+x) + 가늘어지는 꼬리, 광택 점
    vec2 c=vec2(0.45,0.); float tw=0.5*smoothstep(-1.,0.45,p.x);
    float d=p.x>0.45? length(p-c)/0.5 : abs(p.y)/max(tw,0.001);
    float msk=1.-smoothstep(0.75,1.,d);
    float hl=exp(-dot(p-vec2(0.6,0.2),p-vec2(0.6,0.2))*60.);
    I=msk*(0.35+0.25*(1.-d))+hl*0.9*msk+(msk-(1.-smoothstep(0.5,0.75,d)))*0.25;
  } else if(kind<13.5){    // 거품: 얇은 테 + 옅은 속 + 광택
    float r=length(p);
    float rim=exp(-pow((r-0.8)/0.07,2.));
    float sp=exp(-dot(p-vec2(-0.35,0.35),p-vec2(-0.35,0.35))*45.);
    I=rim*0.65+(1.-smoothstep(0.7,0.85,r))*0.1+sp*0.85;
  } else if(kind<14.5){    // 깃털: 가운데 깃대 + 비스듬한 깃가지 결 + 끝이 뾰족한 잎 윤곽
    float h=(p.x+1.)*0.5, wv=0.55*pow(max(0.,sin(3.14159*pow(h,0.7))),0.8)+0.001;
    float d=abs(p.y)/wv;
    float barb=0.55+0.45*sin(p.x*22.+abs(p.y)*14.);
    float shaft=(1.-smoothstep(0.02,0.05,abs(p.y)))*step(-0.95,p.x);
    I=(1.-smoothstep(0.7,1.,d))*(0.3+0.25*barb)*(0.7+0.3*h)+shaft*0.55;
  } else if(kind<15.5){    // 룬 문자: 굽은 호 획 + 곧은 획, 끝이 가늘게(사각 픽셀 느낌 금지)
    vec2 gp=p*0.5+0.5; float r=length(p), an=atan(p.y,p.x);
    float a0=hs(seed*3.1)*6.283, sw=1.6+hs(seed*5.7)*2.2;
    float da=mod(an-a0+6.283,6.283);
    float arc=(1.-smoothstep(0.05,0.1,abs(r-0.72)))*step(da,sw)*smoothstep(0.,0.5,da)*smoothstep(sw,sw-0.5,da);
    I=max(glyph(floor(seed*7.),gp*1.15-0.075)*0.9,arc)+exp(-dot(p,p)*3.)*0.1;
  } else if(kind<16.5){    // 육각 얼음 결정 기둥: +x가 뾰족한 끝, 세 면(밝은 앞면·어두운 옆면) + 모서리 하이라이트
    float h=(p.x+1.)*0.5;
    float w=0.46*min(1.,(1.-h)/0.3)*smoothstep(0.,0.06,h)+0.001;
    float y=p.y/w, ay=abs(y);
    float m=1.-smoothstep(0.9,1.,ay);
    float face=ay<0.34?0.55:(y>0.?0.32:0.16);
    float edge=(1.-smoothstep(0.,0.07,abs(ay-0.34)))*0.7+(1.-smoothstep(0.,0.1,abs(ay-0.95)))*0.35;
    float tipl=(1.-smoothstep(0.,0.05,abs(y)))*smoothstep(0.62,0.8,h)*0.6;
    float glint=exp(-pow((p.x-0.55*p.y-0.1+age*0.6)*9.,2.))*0.8*step(ay,0.34);
    float n=texture2D(uNoise,vec2(h*0.7+seed,y*0.3)).r;
    I=m*(face*(0.8+0.4*n)+edge+tipl+glint)*smoothstep(age*1.1-0.2,age*1.1+0.05,n+0.25);
  } else if(kind<17.5){    // 육각 눈송이: 여섯 갈래 팔 + 비스듬한 곁가지(60° 접기), 가운데 작은 육각
    float r=length(p), an=atan(p.y,p.x)+seed*6.283;
    float sa=mod(an,1.0472)-0.5236; sa=abs(sa);
    vec2 q=vec2(cos(sa),sin(sa))*r;
    float g=seg(q,vec2(0.),vec2(0.92,0.),0.09*(1.-q.x*0.6));
    g=max(g,seg(q,vec2(0.38,0.),vec2(0.56,0.19),0.07));
    g=max(g,seg(q,vec2(0.62,0.),vec2(0.74,0.12),0.06));
    g=max(g,seg(q,vec2(0.18,0.),vec2(0.26,0.09),0.06));
    float hexr=r*cos(sa)/0.866; g=max(g,(1.-smoothstep(0.02,0.05,abs(hexr-0.16)))*0.8);
    I=g*(0.75+0.25*(1.-r))+exp(-r*r*40.)*0.3;
  } else if(kind<18.5){    // 연기 촉수: 굵은 뿌리(-x)에서 뾰족한 끝(+x)으로, 꿈틀대며 휘어짐. 테만 밝고 속은 어둠
    float h=(p.x+1.)*0.5;
    float sg=hs(seed*3.3)>0.5?1.:-1.;   // 씨앗마다 한쪽으로 말리는 갈고리 곡선 + 꿈틀
    float wob=sg*0.6*h*h+sin(h*5.+uT*6.+seed*9.)*0.16*h+(texture2D(uNoise,vec2(h*0.4+seed,uT*0.3)).r-0.5)*0.2*h;
    float w=0.25*pow(1.-h,0.9)*smoothstep(0.,0.1,h)+0.001;
    float d=abs(p.y-wob)/w;
    float n=texture2D(uNoise,vec2(h*1.3-uT*0.8+seed,p.y*0.5)).g;
    I=((1.-smoothstep(0.55,1.,d))*0.18+exp(-pow((d-0.8)/0.16,2.))*0.7)*(0.6+0.6*n)*smoothstep(age-0.2,age+0.1,n+0.1*(1.-h));
  } else {                 // (예비) 룬 문자 하나
    vec2 gp=p*0.5+0.5;
    I=glyph(floor(seed*7.),gp)*0.95+exp(-dot(p,p)*3.)*0.08;
  }
  I=clamp(I*gain,0.,1.);
  vec3 c=texture2D(uRamp,vec2(I*0.996+0.002,row)).rgb;
  vec3 o=c*smoothstep(0.,0.08,I);
  gl_FragColor=vec4(o,max(o.r,max(o.g,o.b)));
}`;

  const VS_Q = `attribute vec2 aPos; varying vec2 vU; void main(){ vU=aPos*0.5+0.5; gl_Position=vec4(aPos,0.,1.); }`;
  // 다운샘플: 4탭 상자(반 텍셀 오프셋 → 쌍선형 덕에 16탭 효과). 첫 단계에서 밝은 부분만 추출(핵 주변만 번지게)
  const FS_DOWN = `
precision mediump float; uniform sampler2D uTex; uniform vec2 uTx; uniform float uThr; varying vec2 vU;
void main(){
  vec4 c=(texture2D(uTex,vU+uTx*vec2(-1.,-1.))+texture2D(uTex,vU+uTx*vec2(1.,-1.))+texture2D(uTex,vU+uTx*vec2(-1.,1.))+texture2D(uTex,vU+uTx*vec2(1.,1.)))*0.25;
  if(uThr>0.){ float l=max(c.r,max(c.g,c.b)); c.rgb*=smoothstep(uThr,uThr+0.35,l); }
  gl_FragColor=vec4(c.rgb,max(c.r,max(c.g,c.b)));
}`;
  const FS_UP = `
precision mediump float; uniform sampler2D uTex; uniform vec2 uTx; uniform float uAmt; varying vec2 vU;
void main(){
  vec3 c=texture2D(uTex,vU+uTx*vec2(-1.,0.)).rgb+texture2D(uTex,vU+uTx*vec2(1.,0.)).rgb+texture2D(uTex,vU+uTx*vec2(0.,-1.)).rgb+texture2D(uTex,vU+uTx*vec2(0.,1.)).rgb;
  c=c*0.25*uAmt; gl_FragColor=vec4(c,max(c.r,max(c.g,c.b)));
}`;
  const FS_FINAL = `
precision mediump float; uniform sampler2D uBase; uniform sampler2D uBloom; uniform float uAmt; varying vec2 vU;
void main(){
  vec3 b=texture2D(uBase,vU).rgb, g=texture2D(uBloom,vU).rgb*uAmt;
  vec3 c=b+g*(1.-b); gl_FragColor=vec4(c,max(c.r,max(c.g,c.b)));
}`;

  /* ---------------- 노이즈 텍스처(바둑판처럼 이어지는 값 노이즈 fbm) ---------------- */
  function noiseTex(N = 256) {
    const data = new Uint8Array(N * N * 4);
    const hash = (x, y, s) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
    const vn = (x, y, P, s) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const m = (a) => ((a % P) + P) % P;
      const a = hash(m(xi), m(yi), s), b = hash(m(xi + 1), m(yi), s), c = hash(m(xi), m(yi + 1), s), d = hash(m(xi + 1), m(yi + 1), s);
      return lerp(lerp(a, b, u), lerp(c, d, u), v);
    };
    const fbmT = (x, y, P, s, oct) => { let t = 0, amp = 0.5, sum = 0; for (let o = 0; o < oct; o++) { t += vn(x * (1 << o), y * (1 << o), P * (1 << o), s + o * 17) * amp; sum += amp; amp *= 0.5; } return t / sum; };
    const stretch = (v) => clamp((v - 0.5) * 1.9 + 0.5);   // fbm은 가운데로 몰리므로 대비를 넓힌다
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = (y * N + x) * 4;
      data[i] = stretch(fbmT(u * 6, v * 6, 6, 1, 4)) * 255;
      data[i + 1] = stretch(fbmT(u * 12, v * 12, 12, 2, 3)) * 255;
      data[i + 2] = stretch(fbmT(u * 24, v * 24, 24, 3, 2)) * 255;
      data[i + 3] = (1 - Math.abs(fbmT(u * 5, v * 5, 5, 4, 3) * 2 - 1)) * 255;
    }
    return data;
  }

  /* ---------------- 색 램프: 세기 0(어두운 가장자리) → 1(흰 핵) ---------------- */
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  /** 색 몇 개 → 어두운 가장자리·채도 높은 중간·흰 핵 램프(단색 금지 규칙을 자동으로 지킨다) */
  function glowStops(cols) {
    const cs = cols.map(hex).sort((a, b) => lum(a) - lum(b));
    const lo = cs[0], hi = cs[cs.length - 1];
    const st = [[0, lo.map((v) => v * 0.12)], [0.22, lo.map((v) => v * 0.55)]];
    cs.forEach((c, i) => st.push([0.42 + 0.4 * (cs.length > 1 ? i / (cs.length - 1) : 0.5), c]));
    st.push([0.9, hi.map((v) => v + (255 - v) * 0.6)], [1, [255, 255, 255]]);
    return st;
  }
  const ROWS = 64;

  class GL {
    static create(eng) {
      try { const g = new GL(eng); return g.ok ? g : null; } catch (err) { console.warn('VFX GL 사용 불가, 2D로 그림:', err); return null; }
    }
    constructor(eng) {
      this.e = eng;
      const cv = (this.cv = document.createElement('canvas'));
      cv.width = cv.height = 4;
      const gl = (this.gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }));
      if (!gl) return;
      const prog = (vs, fs) => {
        const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
        const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
        gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aUV'); gl.bindAttribLocation(p, 2, 'aP'); gl.bindAttribLocation(p, 3, 'aK');
        gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
        return { p, u };
      };
      this.pT = prog(VS, FS_TRAIL); this.pS = prog(VS, FS_SPRITE);
      this.pD = prog(VS_Q, FS_DOWN); this.pU = prog(VS_Q, FS_UP); this.pF = prog(VS_Q, FS_FINAL);
      this.vb = gl.createBuffer(); this.qb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      this.buf = new Float32Array(10 * 6 * 4096); this.n = 0;
      // 노이즈
      this.tN = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tN);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseTex(256));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // 램프 묶음(행마다 램프 하나)
      this.rampData = new Uint8Array(256 * ROWS * 4); this.rows = new Map(); this.nRows = 0; this.rampDirty = true;
      this.tR = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tR);
      this.texParams(gl.LINEAR);
      this.fb = []; this.W = 0; this.H = 0;
      this.ok = true;
    }
    texParams(f) {
      const gl = this.gl;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    }
    /** 램프 행 번호(0~1 텍스처 좌표). key 객체별로 한 번만 만든다 */
    row(key, stops) {
      let r = this.rows.get(key);
      if (r != null) return r;
      const i = this.nRows < ROWS ? this.nRows++ : (this.nRows = 1, this.rows.clear(), 0);
      const f = V.ramp(stops);
      for (let x = 0; x < 256; x++) { const c = f(x / 255), o = (i * 256 + x) * 4; this.rampData[o] = c[0]; this.rampData[o + 1] = c[1]; this.rampData[o + 2] = c[2]; this.rampData[o + 3] = 255; }
      r = (i + 0.5) / ROWS; this.rows.set(key, r); this.rampDirty = true;
      return r;
    }
    rowGlow(key, cols) { const r = this.rows.get(key); return r != null ? r : this.row(key, glowStops(cols)); }
    rowColor(c) { const k = 'c' + c.join(','); const r = this.rows.get(k); return r != null ? r : this.row(k, glowStops([c.map((v) => v * 0.55), c])); }
    rowPart(d) {
      const r = this.rows.get(d); if (r != null) return r;
      if (d.type === 'smoke') return this.row(d, (d.colors || ['#222222', '#333333']).map((c, i, a) => [a.length > 1 ? i / (a.length - 1) : 0, c]));
      return d.colors ? this.rowGlow(d, d.colors) : this.row(d, d._tc);
    }

    size(W, H) {
      const gl = this.gl, s = Math.min(1, Math.sqrt(2.4e6 / (W * H)));   // 아주 큰 화면은 내부 해상도를 줄여 60fps 유지
      const w = Math.max(4, Math.round(W * s)), h = Math.max(4, Math.round(H * s));
      if (w === this.W && h === this.H) return;
      this.W = w; this.H = h; this.cv.width = w; this.cv.height = h;
      for (const f of this.fb) { gl.deleteFramebuffer(f.f); gl.deleteTexture(f.t); }
      this.fb = [];
      let fw = w, fh = h;
      for (let i = 0; i < 6; i++) {   // 0: 원본, 1~5: 1/2 ~ 1/32
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); this.texParams(gl.LINEAR);
        const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        this.fb.push({ f, t, w: fw, h: fh });
        fw = Math.max(1, fw >> 1); fh = Math.max(1, fh >> 1);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /* ---------- 정점 쌓기 ---------- */
    v(x, y, u, w, a, b, c, d, k, r) {
      if (this.n + 10 > this.buf.length) { const nb = new Float32Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
      const B = this.buf; let i = this.n;
      B[i++] = x; B[i++] = y; B[i++] = u; B[i++] = w; B[i++] = a; B[i++] = b; B[i++] = c; B[i++] = d; B[i++] = k; B[i++] = r; this.n = i;
    }
    /** 회전된 사각 한 장(uv -1~1). (ux,uy)=길이 방향 단위벡터, hl/hw=반길이·반폭, off=중심을 길이 방향으로 민 거리 */
    quad(x, y, ux, uy, hl, hw, P, k, r) {
      const ax = ux * hl, ay = uy * hl, bx = -uy * hw, by = ux * hw;
      const c = [[x - ax - bx, y - ay - by, -1, -1], [x + ax - bx, y + ay - by, 1, -1], [x - ax + bx, y - ay + by, -1, 1], [x + ax + bx, y + ay + by, 1, 1]];
      for (const j of [0, 1, 2, 2, 1, 3]) { const q = c[j]; this.v(q[0], q[1], q[2], q[3], P[0], P[1], P[2], P[3], k, r); }
    }
    /** 바늘: (x0,y0)=꼬리 → (x1,y1)=머리 */
    needle(x0, y0, x1, y1, hw, P, r) {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-3;
      this.quad((x0 + x1) / 2, (y0 + y1) / 2, dx / L, dy / L, L / 2, hw, P, 1, r);
    }
    upRamp() {
      if (!this.rampDirty) return;
      const gl = this.gl; gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.rampData); this.rampDirty = false;
    }
    flush() {
      const gl = this.gl; if (!this.n) return;
      this.upRamp();   // 이번 배치에서 새로 등록한 램프 행이 텍스처에 있어야 첫 프레임부터 색이 맞는다
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
      gl.bufferData(gl.ARRAY_BUFFER, this.buf.subarray(0, this.n), gl.STREAM_DRAW);
      const st = 40;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 16);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, st, 32);
      gl.drawArrays(gl.TRIANGLES, 0, this.n / 10);
      this.n = 0;
    }
    use(P) {
      const gl = this.gl; gl.useProgram(P.p);
      if (P.u.uMx) { gl.uniform3fv(P.u.uMx, this.mx); gl.uniform3fv(P.u.uMy, this.my); }
      if (P.u.uNoise) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tN); gl.uniform1i(P.u.uNoise, 0); }
      if (P.u.uRamp) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tR); gl.uniform1i(P.u.uRamp, 1); }
      if (P.u.uT) gl.uniform1f(P.u.uT, this.e.t);
    }

    /* ---------- 검기 띠 ---------- */
    trailRows(t) {
      const S = t.S, n = S.length; if (n < 2) return null;
      const e = this.e, tr = t.p.trail, band = tr.band || 0.62;
      const step = Math.max(1, Math.ceil(n / 160)), idx = [];
      for (let i = 0; i < n; i += step) idx.push(i);
      if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
      const m = idx.length;
      return idx.map((i, j) => {
        const s = S[i], age = clamp((e.t - s.t) / t.life);
        let prof;
        if (t.wave) prof = s.w; else { const u = m > 1 ? j / (m - 1) : 1; prof = Math.pow(Math.sin(Math.PI * Math.pow(u, 1.7)), 0.55); }
        prof *= s.pw;
        const thick = (t.r1 - t.r0) * band * Math.max(prof, 0.06) * (1 - 0.3 * age);
        return { age, id: s.id, prof, u: t.wave ? 0.9 : (m > 1 ? j / (m - 1) : 1), rOut: t.r1, thick, ca: Math.cos(s.a), sa: Math.sin(s.a), x: s.x, y: s.y };
      });
    }
    /** 띠 하나를 정점으로. rFn(row) → [안쪽 반지름, 바깥 반지름], aOff = 나이 더하기, pk = 굵기 윤곽 배율 */
    strip(t, rows, rFn, aOff, pk) {
      // 면 위 좌표 → 화면(3D면 휘두른 면에 붙은 리본으로 투영, 2D면 그대로)
      const e = this.e, ef = e.edgeFade(t.pl), P = (r, R) => e.projLocal(t.pl, t.ox + (r.x + r.ca * R) * t.sc, t.oy + (r.y + r.sa * R) * t.sc);
      let prev = null;
      for (const r of rows) {
        const [ri, ro] = rFn(r), age = clamp(r.age + aOff), fade = (1 - Math.pow(age, 3)) * ef;
        const a = P(r, ri), b = P(r, ro);
        if (!a || !b) { prev = null; continue; }   // 카메라 뒤
        const cur = { a, b, id: r.id, age, u: r.u, prof: r.prof * pk, fade };
        if (prev) {
          const V4 = (q, v, uu) => this.v(q[0], q[1], uu.id, v, uu.age, uu.u, uu.prof, uu.fade, 0, 0);
          V4(prev.a, 0, prev); V4(prev.b, 1, prev); V4(cur.a, 0, cur);
          V4(cur.a, 0, cur); V4(prev.b, 1, prev); V4(cur.b, 1, cur);
        }
        prev = cur;
      }
    }
    trailUniforms(t, layer, style) {
      const gl = this.gl, u = this.pT.u, tr = t.p.trail, dz = tr.dissolve || {};
      if (!t._seed) t._seed = Math.random() * 10;
      gl.uniform1f(u.uRow, this.row(tr, tr.colors));
      gl.uniform1f(u.uScroll, tr.scroll || 1); gl.uniform1f(u.uSoft, dz.soft || 0.25); gl.uniform1f(u.uAmt, dz.amount || 1.2);
      gl.uniform1f(u.uCel, tr.cel || 0); gl.uniform1f(u.uTurb, tr.turb == null ? 0.35 : tr.turb); gl.uniform1f(u.uInten, tr.intensity || 1);
      gl.uniform1f(u.uLayer, layer); gl.uniform1f(u.uStyle, style); gl.uniform1f(u.uBackA, tr.backAlpha || 0); gl.uniform1f(u.uSeed, t._seed);
      const sx = style ? null : shapeOf(tr);
      gl.uniform1f(u.uShape, sx ? sx.id : 0); gl.uniform1f(u.uIn, sx ? sx.in : 0); gl.uniform1f(u.uOut, sx ? sx.out : 0);
      gl.uniform2f(u.uFreq, (dz.scale || 5) * 0.16, tr.streakFreq || 2.2);
      const b = t.c.back; gl.uniform3f(u.uBack, b[0] / 255, b[1] / 255, b[2] / 255);
    }
    drawTrails(layer) {
      this.use(this.pT);
      for (const t of this.e.trails) {
        const rows = this.trailRows(t); if (!rows) continue;
        const tr = t.p.trail;
        const sx = shapeOf(tr);
        if (layer === 1) {
          if (!(tr.backAlpha > 0)) continue;
          this.trailUniforms(t, 1, 0);
          this.strip(t, rows, sx ? (r) => [r.rOut - r.thick * (1 + sx.in), r.rOut + r.thick * sx.out] : (r) => [r.rOut - r.thick * 1.5 - 10, r.rOut + 6], 0, 1);
          this.flush(); continue;
        }
        this.trailUniforms(t, 0, 0);
        this.strip(t, rows, sx ? (r) => [r.rOut - r.thick * (1 + sx.in), r.rOut + r.thick * sx.out] : (r) => [r.rOut - r.thick, r.rOut + 1.5], 0, 1);
        this.flush();
        // 크기 위계 '중간': 바깥에 늦게 뜨는 가는 잔상 호 2개(참고 사진의 겹친 얇은 호)
        const echo = tr.echo == null ? 2 : tr.echo;
        if (echo > 0) {
          this.trailUniforms(t, 0, 1);
          for (let k = 0; k < echo; k++) {
            const off = (k ? 0.16 : 0.07) * (t.r1 - t.r0), w = (k ? 0.035 : 0.06) * (t.r1 - t.r0);
            this.strip(t, rows, (r) => [r.rOut + off - w * r.prof, r.rOut + off + w * r.prof], 0.12 + 0.12 * k, k ? 0.5 : 0.8);
          }
          this.flush();
        }
      }
    }

    /* ---------- 입자·타격·선 ----------
       모두 화면을 보는 빌보드다. 위치는 화면으로 투영하고, 크기에는 원근 배율 S(2D면 1)를 곱한다. */
    /** 입자 → 화면 위치·화면 속도·배율·깊이. 카메라 뒤면 null */
    pt(p) {
      const e = this.e;
      if (!e.c3) return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, s: 1, w: 1 };
      const a = e.projSim(p.x, p.y, p.z || 0); if (!a) return null;
      const h = 1 / 120, b = e.projSim(p.x + p.vx * h, p.y + p.vy * h, (p.z || 0) + (p.vz || 0) * h);
      return b ? { x: a[0], y: a[1], vx: (b[0] - a[0]) / h, vy: (b[1] - a[1]) / h, s: a[2], w: a[3] }
               : { x: a[0], y: a[1], vx: 0, vy: 0, s: a[2], w: a[3] };
    }
    drawSmoke() {
      const L = [];
      for (const p of this.e.parts) {
        if (p.d.type !== 'smoke') continue;
        const q = this.pt(p); if (q) L.push([p, q]);
      }
      if (this.e.c3) L.sort((a, b) => b[1].w - a[1].w);   // 일반 합성은 순서가 중요: 먼 것부터
      for (const [p, q] of L) {
        const k = p.age / p.life, r = p.size * (1 + k * 2.2) * q.s;
        const a = Math.min(0.4, p.d.alpha) * smooth(0, 0.18, k) * (1 - k) * (1 - k);   // 연기는 옅게 깔리고 투명해지며 사라진다(검은 먹 덩어리 방지)
        if (a < 0.01) continue;
        const an = p.rot;
        this.quad(q.x, q.y, Math.cos(an), Math.sin(an), r * 1.25, r, [k, p.seed * 0.0137, a, 0], 3, this.rowPart(p.d));
      }
    }
    drawParts() {
      const e = this.e;
      for (const p of e.parts) {
        const d = p.d; if (d.type === 'smoke') continue;
        const q = this.pt(p); if (!q) continue;
        const k = p.age / p.life, row = this.rowPart(d), S = q.s, ps = p.size * S, x = q.x, y = q.y;
        let g = V.partAlpha(d, k);
        const v = Math.hypot(q.vx, q.vy) || 1e-3, ux = q.vx / v, uy = q.vy / v;
        switch (d.type) {
          case 'spark': {   // 속도 방향으로 늘어난 바늘(머리 쪽이 굵고 흰 핵)
            const L = Math.max(ps * 3, v * 0.03 * d.len), hw = ps * (1 - k * 0.5) * 1.6;
            this.needle(x - ux * L, y - uy * L, x + ux * L * 0.15, y + uy * L * 0.15, hw, [k, p.seed, g * 1.1, 2.2], row);
            break;
          }
          case 'streak': {
            const L = 40 * S + v * 0.09, hw = ps * (1 - k * 0.6) * 1.8;
            this.needle(x - ux * L, y - uy * L, x + ux * L * 0.2, y + uy * L * 0.2, hw, [k, p.seed, g, 1.6], row);
            break;
          }
          case 'line': {    // 직선 스피드 라인: 머리가 빠르게 뻗고 꼬리가 따라와 지워짐(애니 와이프)
            const L = ps, hd = smooth(0, 0.3, k), tl = smooth(0.2, 1, k);
            const x0 = x - ux * L * 0.5, y0 = y - uy * L * 0.5;
            if (hd - tl > 0.01) this.needle(x0 + ux * L * tl, y0 + uy * L * tl, x0 + ux * L * hd, y0 + uy * L * hd, (d.width || 1.6) * S, [k, p.seed, d.alpha * (1 - k * 0.4), 1.4], row);
            break;
          }
          case 'ember': {
            g *= 0.6 + 0.4 * Math.sin(e.t * 28 + p.seed * 7);
            const st = 1 + Math.min(2, v * 0.006 / S), s = ps * 2.2;
            this.quad(x, y, ux, uy, s * st, s, [k, p.seed, g, 0], 2, row);
            break;
          }
          case 'shard': {
            // 깨진 조각: 씨앗마다 길쭉함이 다르다(가늘고 긴 쐐기 ~ 뭉툭한 덩어리)
            const fr = (p.seed * 0.618) % 1, c = Math.cos(p.rot), s = Math.sin(p.rot);
            const L = ps * (1.3 + 1.5 * fr) * Math.sqrt(d.len), W = ps * (0.75 + 0.75 * (1 - fr));
            this.quad(x, y, c, s, L, W, [k, p.seed * 0.013, g * 1.3, 0], 4, row);
            break;
          }
          case 'flake': {
            g *= Math.min(1, k * 6);   // 육각 눈송이(둥근 점 금지), 천천히 돈다
            const r = p.rot + e.t * 0.8 * ((p.seed % 2) - 0.5);
            this.quad(x, y, Math.cos(r), Math.sin(r), ps * 2.6, ps * 2.6, [k, p.seed * 0.017, g * 1.05, 0], 17, row);
            break;
          }
          case 'crystal': {   // 큰 결정 기둥: 솟아오르며 자라고(첫 15%), 끝까지 제자리에서 굳었다 부서지듯 침식
            const c = Math.cos(p.rot), s = Math.sin(p.rot), gr = smooth(0, 0.15, k), L = ps * 2.2 * d.len * (0.25 + 0.75 * gr);
            this.quad(x + c * L, y + s * L, c, s, L, ps * 1.5, [k, p.seed * 0.013, g * 1.5, 0], 16, row);
            break;
          }
          case 'tendril': {   // 연기 촉수: 뿌리에서 바깥으로 뻗어 꿈틀댐
            g *= smooth(0, 0.15, k);
            const c = Math.cos(p.rot), s = Math.sin(p.rot), L = ps * 2.4 * d.len * (0.5 + 0.5 * smooth(0, 0.3, k));
            this.quad(x + c * L, y + s * L, c, s, L, ps * 1.8, [k, p.seed * 0.013, g * 1.7, 0], 18, row);
            break;
          }
          case 'mote': {   // 둥근 점 대신 네 갈래 반짝임(크기 위계의 '잔 입자')
            g *= Math.min(1, k * 8) * (0.7 + 0.3 * Math.sin(e.t * 20 + p.seed * 5));
            const s = ps * 3.2, r = p.seed + e.t * 0.6;
            this.quad(x, y, Math.cos(r * 0.3), Math.sin(r * 0.3), s, s, [k, p.seed, g, 0], 7, row);
            break;
          }
          case 'bolt': {
            if (!p.pts || e.t - p.regen > 0.045) {   // 마디는 화면 방향으로 만들고 원근 배율만 곱한다
              p.regen = e.t;
              const L = d.len * (0.7 + 0.15 * p.size), ang = Math.atan2(q.vy, q.vx) + (Math.random() - 0.5) * 0.8, seg = 7, pts = [0, 0];
              for (let i = 1; i <= seg; i++) { const t = i / seg, off = i === seg ? 0 : (Math.random() - 0.5) * L * 0.32; pts.push(Math.cos(ang) * L * t - Math.sin(ang) * off, Math.sin(ang) * L * t + Math.cos(ang) * off); }
              p.pts = pts;
              const bi = 2 + 2 * Math.floor(Math.random() * 3), ba = ang + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5), tw = [pts[bi], pts[bi + 1]];
              for (let i = 1; i <= 3; i++) { const t = i / 3; tw.push(pts[bi] + Math.cos(ba) * L * 0.4 * t + (Math.random() - 0.5) * L * 0.08, pts[bi + 1] + Math.sin(ba) * L * 0.4 * t + (Math.random() - 0.5) * L * 0.08); }
              p.tw = tw;
            }
            for (let i = 2; p.tw && i < p.tw.length; i += 2) {   // 잔가지: 가늘고 끝이 사라짐
              const x0 = x + p.tw[i - 2] * S, y0 = y + p.tw[i - 1] * S, x1 = x + p.tw[i] * S, y1 = y + p.tw[i + 1] * S;
              const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, w = ps * 1.3 * (1 - i / p.tw.length * 0.7);
              this.quad((x0 + x1) / 2, (y0 + y1) / 2, dx / L, dy / L, L / 2 + w * 0.5, w, [k, p.seed, g * 0.8, 0], 8, row);
            }
            for (let i = 2; i < p.pts.length; i += 2) {
              const x0 = x + p.pts[i - 2] * S, y0 = y + p.pts[i - 1] * S, x1 = x + p.pts[i] * S, y1 = y + p.pts[i + 1] * S;
              const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, w = ps * 3.4 * (1 - (i / p.pts.length) * 0.65);
              this.quad((x0 + x1) / 2, (y0 + y1) / 2, dx / L, dy / L, L / 2 + w * 0.5, w, [k, p.seed, g * 1.35, 0], 8, row);
            }
            break;
          }
          case 'flame': {   // 솟는 불꽃: 움직이는 방향이 끝, 나이에 따라 짧아짐
            const fx = v > 20 ? ux : 0, fy = v > 20 ? uy : -1;
            g *= smooth(0, 0.12, k);
            this.quad(x, y, fx, fy, ps * 2.6 * (1 - k * 0.45), ps * 1.25, [k, p.seed, g * 1.15, 0], 9, row);
            break;
          }
          case 'mist': {
            g *= smooth(0, 0.2, k);
            const s = ps * 2 * (1 + k * 1.4);
            this.quad(x, y, Math.cos(p.rot), Math.sin(p.rot), s, s * 0.8, [k, p.seed * 0.013, g, 0], 10, row);
            break;
          }
          case 'rune': {
            g *= smooth(0, 0.1, k);
            const s = ps * (1 + k * 0.4);
            this.quad(x, y, Math.cos(p.rot), Math.sin(p.rot), s, s, [k, p.seed, g, 0], 11, row);
            break;
          }
          case 'drop': {
            const st = 1 + Math.min(1.2, v * 0.002 / S);
            this.quad(x, y, ux, uy, ps * 1.3 * st, ps, [k, p.seed, g, 0], 12, row);
            break;
          }
          case 'bubble': {
            const s = ps * (0.6 + 0.6 * smooth(0, 0.3, k)) * (k > 0.85 ? 1 + (k - 0.85) * 3 : 1);
            this.quad(x, y, 1, 0, s, s, [k, p.seed, g * (k > 0.85 ? (1 - k) / 0.15 : 1), 0], 13, row);
            break;
          }
          case 'feather': {
            g *= smooth(0, 0.1, k);
            this.quad(x, y, Math.cos(p.rot), Math.sin(p.rot), ps * 2.6, ps * 1.1, [k, p.seed, g, 0], 14, row);
            break;
          }
          case 'glyph': {
            g *= smooth(0, 0.15, k) * (0.75 + 0.25 * Math.sin(e.t * 18 + p.seed));
            this.quad(x, y, 1, 0, ps * 1.5, ps * 1.5, [k, p.seed, g, 0], 15, row);
            break;
          }
          default: this.quad(x, y, 1, 0, ps * 2, ps * 2, [k, p.seed, g, 0], 2, row);
        }
      }
    }
    /** 원소별 타격 모양(섬광·광선·고리 위에 더하는 것). h.shape 는 Engine.impact 가 정한다 */
    drawHitShape(h, hx, hy, S, k, after, hold) {
      const c = h.c, B = h.bits, sid = h.shape, col = c.star || c.flash || c.ring || [255, 255, 255], row = this.rowColor(col), sz = ((h.im.flash && h.im.flash.size) || 120) * S;
      if (sid === 1) {        // 불: 위로 치솟는 불기둥 다발
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (B[i] - 0.5) * 1.3, L = sz * (0.6 + 0.7 * B[i + 7]) * (0.5 + 0.9 * smooth(0, 0.35, k)), w = sz * (0.22 + 0.12 * B[i + 3]) * (1 - k * 0.5);
          const ox = (B[i + 11] - 0.5) * sz * 0.5;
          this.quad(hx + ox + Math.cos(a) * L * 0.7, hy + Math.sin(a) * L * 0.7, Math.cos(a), Math.sin(a), L, w, [k, B[i] * 9, 1.1 * (1 - k * 0.7), 0], 9, row);
        }
      } else if (sid === 2) { // 얼음: 사방으로 솟는 결정 가시
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + B[i] * 0.5, L = sz * (0.5 + 0.8 * B[i + 9]) * (hold ? 0.6 + 0.4 * h.age / 0.05 : 1) * (1 - Math.max(0, k - 0.6)), w = sz * (0.1 + 0.08 * B[i + 3]);
          this.quad(hx + Math.cos(a) * L * 0.8, hy + Math.sin(a) * L * 0.8, Math.cos(a), Math.sin(a), L, w, [k, B[i], 1.2 * (1 - k * 0.6), 0], 4, row);
        }
      } else if (sid === 3) { // 눈: 퍼지는 가루 안개
        for (let i = 0; i < 6; i++) {
          const a = B[i] * TAU, r = sz * (0.3 + 0.9 * (1 - Math.pow(1 - k, 2))) * (0.5 + B[i + 6]), s = sz * (0.6 + 0.5 * B[i + 3]) * (1 + k);
          this.quad(hx + Math.cos(a) * r, hy + Math.sin(a) * r, Math.cos(a), Math.sin(a), s, s * 0.8, [k, B[i] * 3, 0.5 * (1 - k), 0], 10, row);
        }
      } else if (sid === 4) { // 번개: 하늘에서 내리꽂는 낙뢰(1초에 25번 다시 갈라짐)
        if (!h.sky || this.e.t - h.skyT > 0.04) {
          h.skyT = this.e.t; const pts = [[0, -900]], n = 9;
          for (let i = 1; i <= n; i++) { const t = i / n; pts.push([i === n ? 0 : (Math.random() - 0.5) * 120 * (1 - t * 0.5), -900 * (1 - t)]); }
          h.sky = pts;
        }
        const g = (hold ? 1.3 : Math.pow(1 - after, 1.3)) * 1.1;
        for (let i = 1; i < h.sky.length; i++) {
          const a = h.sky[i - 1], b = h.sky[i], x0 = hx + a[0] * S, y0 = hy + a[1] * S, x1 = hx + b[0] * S, y1 = hy + b[1] * S;
          const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, w = (5 + 4 * (i / h.sky.length)) * S;
          this.quad((x0 + x1) / 2, (y0 + y1) / 2, dx / L, dy / L, L / 2 + w * 0.5, w, [k, i, g, 0], 8, row);
        }
      } else if (sid === 5) { // 비전: 넓어지며 도는 마법진
        const R = sz * (0.7 + 0.9 * smooth(0, 0.5, k)), an = h.seed + k * 2.2;
        this.quad(hx, hy, Math.cos(an), Math.sin(an), R, R, [k, h.seed, 1.15 * (1 - Math.pow(k, 2)), 0], 11, row);
        this.quad(hx, hy, Math.cos(-an * 1.6), Math.sin(-an * 1.6), R * 0.5, R * 0.5, [k, h.seed + 3, 0.9 * (1 - k), 0], 11, row);
      } else if (sid === 6) { // 신성: 위에서 내려오는 빛기둥
        const g = hold ? 1.2 : Math.pow(1 - after, 1.2), Wd = sz * (0.32 + 0.25 * (1 - k)), Hh = sz * 7;
        this.needle(hx, hy + sz * 0.6, hx, hy - Hh, Wd, [k, h.seed, 0.95 * g, 0.5], row);
        this.needle(hx, hy + sz * 0.3, hx, hy - Hh, Wd * 0.3, [k, h.seed, 1.2 * g, 0.5], row);
      } else if (sid === 7) { // 독: 튀어 퍼지는 독 웅덩이 얼룩
        for (let i = 0; i < 6; i++) {
          const a = B[i] * TAU, r = sz * (0.5 + 0.7 * B[i + 6]) * smooth(0, 0.12, k), s = sz * (0.22 + 0.2 * B[i + 3]);
          this.quad(hx + Math.cos(a) * r, hy + Math.sin(a) * r, 1, 0, s, s, [k, B[i], 0.75 * (1 - k * 0.8), 0], 13, row);
        }
      } else if (sid === 8) { // 어둠: 빨려 드는 고리(안쪽으로 조여듦)
        const R = sz * 1.6;
        this.quad(hx, hy, 1, 0, R, R, [after, h.seed * 0.13, 1.25 * (1 - after * 0.5), lerp(0.95, 0.12, smooth(0, 1, k))], 6, row);
        this.quad(hx, hy, 1, 0, R * 0.8, R * 0.8, [after, h.seed * 0.2, 0.8 * (1 - after * 0.5), lerp(0.98, 0.05, smooth(0.1, 1, k))], 6, row);
      }
    }
    drawHits() {
      for (const h of this.e.hits) {
        const q = this.e.projLocal(h.pl, h.x, h.y); if (!q) continue;
        const hx = q[0], hy = q[1], S = q[2];
        const im = h.im, c = h.c, k = h.age / h.life, HOLD = 0.05;
        const hold = h.age < HOLD;   // 임팩트 홀드: 처음 ~3프레임은 최대 크기·최대 밝기로 고정
        const after = clamp((h.age - HOLD) / Math.max(0.01, h.life - HOLD));
        if (!h.seed) h.seed = Math.random() * 10;
        if (c.flash) {
          const Z = (im.flash.size || 120) * S * (hold ? 0.75 + 0.25 * (h.age / HOLD) * 1.25 : lerp(1, 0.25, Math.pow(after, 0.6)));
          const g = (im.flash.alpha || 0.9) * (hold ? 1.25 : Math.pow(1 - after, 1.8));
          const sp = (im.star && im.star.count) || 5, an = h.seed;
          this.quad(hx, hy, Math.cos(an), Math.sin(an), Z, Z, [k, h.seed * 0.1, g, sp], 5, this.rowColor(c.flash));
        }
        if (c.flash && im.flare !== false) {   // 아나모픽 플레어: 화면 가로로 길고 가는 띠(참고 u5)
          const g = hold ? 1 : Math.pow(1 - after, 2.2), L = (im.flash.size || 120) * S * (hold ? 2.2 + 1.6 * h.age / HOLD : 3.8 + after * 1.5);
          if (g > 0.02) {
            const row = this.rowColor(c.flash), w = Math.min(1, S);
            this.needle(hx - L, hy, hx + L, hy, (2.6 * g + 0.6) * w, [k, h.seed, 1.05 * g, 1], row);
            this.needle(hx - L * 0.45, hy, hx + L * 0.45, hy, 7 * g * w, [k, h.seed, 0.5 * g, 1], row);
          }
        }
        if (c.ring && !hold) {
          const R = (im.ring.size || 110) * 1.25 * S, eo = 1 - Math.pow(1 - after, 3);
          this.quad(hx, hy, 1, 0, R, R, [after, h.seed * 0.13, 1.1 * (1 - after * 0.6), 0.12 + eo * 0.78], 6, this.rowColor(c.ring));
        }
        if (c.star) {
          const row = this.rowColor(c.star), grow = hold ? 1 : 1 + after * 0.25, thin = hold ? 1 : Math.pow(1 - after, 1.4);
          for (const ray of h.rays) {
            const ca = Math.cos(ray.ang), sa = Math.sin(ray.ang);
            if (ray.main) {
              const L = ray.len * S * (hold ? 0.55 + 0.45 * (h.age / HOLD) : grow), w = ray.w * S * 1.5 * thin;
              if (w < 0.2) continue;
              // 머리(굵은 쪽)를 중심에 두고 바깥으로 바늘처럼 가늘어짐
              this.needle(hx + ca * L, hy + sa * L, hx - ca * L * 0.06, hy - sa * L * 0.06, w, [k, h.seed, 1.15 * (hold ? 1 : thin + 0.1), 4], row);
            } else {
              const o = ray.off * S * (0.5 + 0.9 * (hold ? h.age / HOLD : 1 + after)), L = ray.len * S * (1 - after * 0.5), w = ray.w * S * 1.8 * thin;
              if (w < 0.2) continue;
              this.needle(hx + ca * (o + L), hy + sa * (o + L), hx + ca * o, hy + sa * o, w, [k, h.seed, 0.95 * thin, 3], row);
            }
          }
        }
        if (h.shape && h.bits) this.drawHitShape(h, hx, hy, S, k, after, hold);
      }
    }
    drawLines() {   // 집중선은 화면 연출: 중심만 투영하고 길이는 화면 기준
      for (const l of this.e.lines) {
        const q = this.e.projLocal(l.pl, l.x, l.y); if (!q) continue;
        const lx = q[0], ly = q[1];
        const k = l.age / l.life, a = Math.pow(1 - k, 1.5), rin = lerp(230, 90, 1 - Math.pow(1 - k, 3)) * Math.min(1, q[2]), row = this.rowColor(l.col);
        for (const s of l.L) {
          // 길이·굵기·밝기를 선마다 다르게: 고른 방사 격자로 읽히지 않게(작화 집중선은 들쭉날쭉)
          const j = (Math.sin(s.a * 91.7) * 43758.5) % 1, jj = Math.abs(j);
          const ca = Math.cos(s.a), sa = Math.sin(s.a), ri = rin * s.r * lerp(0.8, 1.6, jj), ro = ri + lerp(160, 620, jj * jj);
          this.needle(lx + ca * ro, ly + sa * ro, lx + ca * ri, ly + sa * ri, s.w * (1 - k * 0.5) * lerp(0.5, 1.2, jj), [k, s.a, lerp(0.18, 0.55, jj) * a, 6], row);
        }
      }
    }
    drawShots() {
      const e = this.e;
      for (const s of e.shots) {
        const q = e.projLocal(s.pl, s.x, s.y); if (!q) continue;
        const sx = q[0], sy = q[1], S = q[2], sz = s.size * S;
        const col = s.c.flash || s.c.star || [255, 255, 255], row = this.rowColor(col);
        if (s.phase === 'charge') {   // 모으기(앤티): 반짝임이 빨려 들고 조여드는 고리
          const k = s.age / s.charge;
          for (let i = 0; i < 12; i++) {
            const kk = (k * 1.4 + i / 12) % 1, r = lerp(90, 6, kk * kk) * S, a = s.age * 16 + i * 2.4 + kk * 5, z = (3 + 4 * kk) * S;
            this.quad(sx + Math.cos(a) * r, sy + Math.sin(a) * r, 1, 0, z * 2, z * 2, [kk, i, Math.sin(Math.PI * kk), 0], 7, row);
          }
          this.quad(sx, sy, 1, 0, 70 * S, 70 * S, [k, 0.3, 1, lerp(0.9, 0.15, k)], 6, row);
          this.quad(sx, sy, 1, 0, sz * lerp(0.6, 2.4, k), sz * lerp(0.6, 2.4, k), [k, 0.5, 1, 6], 5, row);
          continue;
        }
        let vx = s.vx, vy = s.vy;
        if (e.c3) { const h = 1 / 120, q2 = e.projLocal(s.pl, s.x + s.vx * h, s.y + s.vy * h); if (q2) { vx = (q2[0] - sx) / h; vy = (q2[1] - sy) / h; } }
        const v = Math.hypot(vx, vy) || 1, ux = vx / v, uy = vy / v, st = 1 + Math.min(2.2, v * 0.0016 / S);
        this.quad(sx, sy, ux, uy, sz * 2.2 * st, sz * 2.2 / Math.sqrt(st), [0, 0.7, 1.1, 5], 5, row);
        const L = sz * st * 5;
        this.needle(sx - ux * L, sy - uy * L, sx + ux * sz, sy + uy * sz, sz * 0.9 / Math.sqrt(st), [0, 0.2, 1, 3], row);
      }
    }

    /* ---------- 한 프레임 ---------- */
    render(ctx, world, opts) {
      const e = this.e, gl = this.gl, W = e.fx.width, H = e.fx.height;
      this.size(W, H);
      // 정점 좌표 → 클립 좌표. 2D: 월드 변환(DPR)·카메라 흔들림 반영. 3D: 정점이 이미 화면 px(흔들림은 게임 카메라 몫)
      if (e.c3) { this.mx = [2 / W, 0, -1]; this.my = [0, -2 / H, 1]; }
      else { ctx.save(); world(ctx); e.cam(ctx); const m = ctx.getTransform(); ctx.restore();
        this.mx = [m.a * 2 / W, m.c * 2 / W, m.e * 2 / W - 1]; this.my = [-m.b * 2 / H, -m.d * 2 / H, 1 - m.f * 2 / H]; }
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);

      // 1) 뒷층: 연기 + 검기 어두운 그림자 (일반 합성, 미리 곱한 알파)
      const hasBack = e.parts.some((p) => p.d.type === 'smoke') || e.trails.some((t) => t.p.trail.backAlpha > 0 && t.S.length > 1);
      if (hasBack) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.W, this.H);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this.drawSmoke(); this.use(this.pS); this.flush();
        this.drawTrails(1);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.drawImage(this.cv, 0, 0, W, H); ctx.restore();
      }
      if (opts.between) { ctx.save(); if (!e.c3) { world(ctx); e.cam(ctx); } opts.between(ctx); ctx.restore(); }
      if (!e.busy) return;

      // 2) 빛층 → FBO0 (가산)
      const F = this.fb;
      gl.bindFramebuffer(gl.FRAMEBUFFER, F[0].f); gl.viewport(0, 0, F[0].w, F[0].h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendFunc(gl.ONE, gl.ONE);
      this.drawLines(); this.drawParts(); this.drawShots(); this.drawHits();
      const nSprites = this.n; const saved = nSprites ? this.buf.slice(0, nSprites) : null; this.n = 0;
      this.drawTrails(0);   // 띠는 자체 유니폼이라 따로 그림(램프 등록 포함)
      if (saved) { this.use(this.pS); this.buf.set(saved); this.n = nSprites; this.flush(); }

      // 3) 블룸: 밝은 부분만 추출 → 1/2 … 1/32 다운샘플 → 거꾸로 더하며 업샘플
      const bloom = opts.bloom == null ? e.bloomAmt : opts.bloom;
      const quad = () => { gl.bindBuffer(gl.ARRAY_BUFFER, this.qb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i); gl.drawArrays(gl.TRIANGLES, 0, 6); };
      const tex = (P, name, t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(P.u[name], unit); };
      if (bloom > 0) {
        gl.disable(gl.BLEND); gl.useProgram(this.pD.p);
        for (let i = 1; i < F.length; i++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, F[i].f); gl.viewport(0, 0, F[i].w, F[i].h);
          tex(this.pD, 'uTex', F[i - 1].t, 0);
          gl.uniform2f(this.pD.u.uTx, 0.5 / F[i - 1].w, 0.5 / F[i - 1].h); gl.uniform1f(this.pD.u.uThr, i === 1 ? 0.6 : 0);
          quad();
        }
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(this.pU.p);
        for (let i = F.length - 1; i > 1; i--) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, F[i - 1].f); gl.viewport(0, 0, F[i - 1].w, F[i - 1].h);
          tex(this.pU, 'uTex', F[i].t, 0);
          gl.uniform2f(this.pU.u.uTx, 1 / F[i].w, 1 / F[i].h); gl.uniform1f(this.pU.u.uAmt, 0.9);
          quad();
        }
      }
      // 4) 최종: 원본 + 블룸 → 화면 GL 캔버스 → 2D 화면에 더하기 합성
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.W, this.H);
      gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.pF.p); tex(this.pF, 'uBase', F[0].t, 0); tex(this.pF, 'uBloom', F[1].t, 1); gl.uniform1f(this.pF.u.uAmt, bloom > 0 ? bloom * 0.5 : 0);
      quad();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.cv, 0, 0, W, H);
      e.postFrames(ctx, W, H);
      ctx.restore();
    }
  }

  V.GL = GL;
  V.glowStops = glowStops;
})(typeof window !== 'undefined' ? window : globalThis);
