/* MoshPin — shared styles */
:root{
  --bg:#1c1d1c; --panel:#252726; --panel-2:#2c2f2d; --line:#3a3e3b;
  --ink:#e8eae6; --dim:#9aa39c; --green:#2e5d43; --edge:#8fd977; --danger:#d96c5f;
  --r:10px;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--ink);
  font-family:'Outfit',system-ui,-apple-system,'Segoe UI',sans-serif;
  -webkit-text-size-adjust:100%;font-feature-settings:'tnum' 1}
a{color:var(--edge)}
button{font:inherit;cursor:pointer}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}

.btn{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);
  border-radius:var(--r);padding:11px 16px;font-size:14px}
.btn:hover{border-color:var(--edge)}
.btn:disabled{opacity:.45;cursor:default}
.btn.primary{background:var(--green);border-color:var(--edge)}
.btn.danger{border-color:var(--danger);color:var(--danger)}
.btn.wide{width:100%;display:block;text-align:center}
.btn.lg{padding:15px 18px;font-size:15px;font-weight:600}

input[type=text],input[type=number],select,textarea{
  width:100%;background:var(--panel-2);border:1px solid var(--line);border-radius:var(--r);
  color:var(--ink);font:inherit;font-size:15px;padding:12px 14px}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--edge)}
label{display:block;font-size:12.5px;color:var(--dim);margin:14px 0 6px}
.hint{font-size:12.5px;color:var(--dim);line-height:1.5}
.err{font-size:13px;color:var(--danger);margin-top:10px;display:none}
.err.on{display:block}

/* landing */
.wrap{max-width:460px;margin:0 auto;padding:34px 20px 60px}
.brand{text-align:center;margin-bottom:28px}
.brand h1{font-size:34px;letter-spacing:-.5px;font-weight:700}
.brand h1 .pin{color:var(--edge)}
.brand p{font-size:13.5px;color:var(--dim);margin-top:7px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:14px}
.card h2{font-size:17px;font-weight:600;margin-bottom:4px}
.card h2 + .hint{margin-bottom:6px}
.split{display:flex;align-items:center;gap:12px;margin:20px 0;color:var(--dim);font-size:12px}
.split::before,.split::after{content:'';flex:1;height:1px;background:var(--line)}
.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:6px;
  font-size:26px;text-align:center;text-transform:uppercase}
.qrbox{background:#fff;border-radius:12px;padding:12px;width:max-content;margin:0 auto}
.qrbox svg{display:block}
.row{display:flex;gap:10px}
.row > *{flex:1}


#ha-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);
  background:var(--panel-2);border:1px solid var(--edge);color:var(--ink);
  border-radius:999px;padding:10px 18px;font-size:13.5px;opacity:0;pointer-events:none;
  transition:opacity .18s,transform .18s;z-index:200;max-width:90vw;text-align:center}
#ha-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}

.spin{display:inline-block;width:15px;height:15px;border:2px solid var(--line);
  border-top-color:var(--edge);border-radius:50%;animation:sp .7s linear infinite;vertical-align:-2px}
@keyframes sp{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spin{animation:none}}

/* ---- crew page ---- */
.chead{display:flex;align-items:flex-start;gap:12px;margin-bottom:18px}
.chead > div:first-child{flex:1;min-width:0}
.ctitle{font-size:22px;font-weight:700;line-height:1.15}
.ctitle.sm{font-size:16px}
.btn.sm{padding:7px 12px;font-size:12.5px;border-radius:8px;flex:0 0 auto}
.merow{display:flex;align-items:center;gap:14px}
.av{border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;flex:none}
.av.fb{display:inline-flex;align-items:center;justify-content:center;color:#161711;font-weight:700}
.mlist{display:flex;flex-direction:column;gap:2px;margin-top:10px}
.mrow{display:flex;align-items:center;gap:11px;padding:7px 0}
.mname{flex:1;min-width:0;font-size:14.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tag{font-size:10px;color:var(--dim);border:1px solid var(--line);border-radius:99px;padding:1px 7px;margin-left:7px;font-weight:400}
.tag.adm{color:var(--edge);border-color:var(--edge)}
.mini{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);
  border-radius:7px;padding:5px 9px;font-size:11.5px;flex:0 0 auto}
.mini.danger{border-color:var(--danger);color:var(--danger)}
.sheet{position:fixed;inset:0;background:rgba(10,11,10,.75);display:none;
  align-items:flex-end;justify-content:center;z-index:60;padding:0}
.sheet.on{display:flex}
.sheet .panel{background:var(--panel);border:1px solid var(--line);border-radius:16px 16px 0 0;
  width:100%;max-width:460px;padding:18px 20px calc(24px + env(safe-area-inset-bottom,0px));
  max-height:88vh;overflow-y:auto}
.phead{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-size:15px}
@media (min-width:520px){.sheet{align-items:center}.sheet .panel{border-radius:16px;padding-bottom:20px}}

/* ---- festival setup ---- */
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
.vtype{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;border-radius:99px;
  padding:2px 8px;border:1px solid var(--line);color:var(--dim);flex:0 0 auto}
.vtype.stage{color:var(--edge);border-color:var(--edge)}
.err div{margin:3px 0}

/* ---- timetable ---- */
body.gridpage{padding:0;overflow:hidden;height:100dvh;height:100vh;display:flex;flex-direction:column}
.ghead{display:flex;align-items:center;gap:10px;padding:12px 14px 8px}
.gtitle{flex:1;min-width:0;text-align:center;font-weight:600;font-size:15px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gridpage .tabs{padding:0 14px 10px;margin:0}
/* One scroller, not two. The grid used to scroll sideways while the page
   scrolled up and down, so a diagonal swipe started in one and was rejected by
   the other — which is what made it bounce back. Now a single element handles
   both axes and the frozen panes are moved to match. */
.tt{border-top:1px solid var(--line);overflow:auto;-webkit-overflow-scrolling:touch;
    overscroll-behavior:contain;position:relative}
.ttop{display:flex}
.tcorner{width:46px;flex:none;position:sticky;left:0;z-index:31;background:var(--bg);
  border-bottom:2px solid var(--line);border-right:1px solid var(--line)}
.theadwrap{flex:1;min-width:0;overflow:hidden}
.ttop{position:sticky;top:0;z-index:30;background:var(--bg);width:max-content;min-width:100%}
.thead{display:grid;gap:0 6px}
.sh{position:relative;font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:var(--edge);
  text-align:center;padding:8px 3px;border-bottom:2px solid var(--line);
  display:flex;align-items:flex-end;justify-content:center;min-height:34px;line-height:1.25}
.tbody{display:flex;width:max-content;min-width:100%}
.tcol{width:46px;flex:none;position:sticky;left:0;z-index:20;background:var(--bg);
  border-right:1px solid var(--line)}
.tl{position:absolute;right:6px;font-size:10.5px;color:var(--dim);line-height:1}
.twrap{flex:1;min-width:0}
.tgrid{display:grid;gap:0 6px;position:relative;padding-bottom:40px}
.hl{position:absolute;left:0;right:0;border-top:1px dashed #333734}
.act{position:relative;z-index:1;background:var(--panel);border:1px solid var(--line);
  border-radius:7px;margin:1px 0;padding:6px 7px;overflow:hidden;cursor:pointer}
.act:hover{border-color:#4a5c4a}
.act.mine{background:var(--green);border-color:var(--edge)}
.act .t{font-size:11.5px;font-weight:600;line-height:1.22}
.act .tm{font-size:10px;color:var(--dim);margin-top:2px}
.act.mine .tm{color:#cfe9d6}
.act.b1 .t{padding-right:20px}.act.b2 .t{padding-right:38px}.act.b3 .t{padding-right:56px}
.bb{position:absolute;top:4px;right:4px;display:flex;flex-direction:row-reverse;gap:2px}
.bu{width:17px;height:17px;border-radius:50%;font-size:8.5px;font-weight:700;color:#161711;
  display:inline-flex;align-items:center;justify-content:center;border:1.5px solid #14150f;flex:none}
.bu.more{background:#555;color:#eee}
.nd{position:absolute;bottom:3px;right:6px;font-size:9.5px;color:var(--edge)}
.nowline{position:absolute;left:0;right:0;border-top:2px solid var(--edge);z-index:4;
  box-shadow:0 0 8px rgba(143,217,119,.5);pointer-events:none}
.nowline span{position:absolute;right:2px;top:-15px;font-size:10px;font-weight:700;color:var(--edge)}
@media (max-width:700px){
  .act .t{font-size:11px}.bu{width:14px;height:14px;font-size:7.5px}
  .act.b1 .t{padding-right:16px}.act.b2 .t{padding-right:31px}.act.b3 .t{padding-right:46px}
}

/* ---- check-in dock ---- */
.dock{position:fixed;right:20px;bottom:calc(24px + env(safe-area-inset-bottom,0px));
  z-index:50;display:flex;align-items:flex-end;gap:12px}
.fab{width:56px;height:56px;border-radius:50%;background:var(--panel-2);
  border:2px solid var(--line);color:#fff;font-size:22px;position:relative;
  box-shadow:0 6px 20px rgba(0,0,0,.45);flex:none}
.fab.live{background:var(--green);border-color:var(--edge)}
.fab .cnt{position:absolute;top:-2px;right:-2px;min-width:21px;height:21px;border-radius:99px;
  background:var(--edge);color:#161711;font-size:11.5px;font-weight:700;line-height:21px;display:none;padding:0 5px}
.fab .cnt.show{display:block}
.dockpanel{display:none;flex-direction:column;width:min(340px,calc(100vw - 96px));
  background:var(--panel);border:1px solid var(--line);border-radius:16px;
  box-shadow:0 10px 40px rgba(0,0,0,.5);overflow:hidden;max-height:76vh}
.dockpanel.open{display:flex}
.chead2{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);font-size:13.5px}
.chead2 .hint{font-size:10.5px}
.cibody{padding:10px 12px 14px;overflow-y:auto;flex:1}
.cifoot{padding:10px;border-top:1px solid var(--line);display:flex;gap:6px;flex-wrap:wrap}
.cifoot input{flex:1 1 100%;font-size:13px;padding:9px 12px}
.cistage{display:flex;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--line);
  border-radius:9px;padding:8px 10px;margin:10px 0 4px;cursor:pointer}
.cistage:first-child{margin-top:0}
.cistage .ct{font-size:10.5px;letter-spacing:.5px;color:var(--edge);font-weight:700;line-height:1.25}
.cistage .cs{font-size:10.5px;color:var(--dim)}
.cirow{display:flex;align-items:center;gap:9px;padding:5px 0}
.cirow .nm{font-size:12.5px;font-weight:700}
.cirow .pos{font-size:11px;color:var(--dim)}
.cirow .pos.custom{color:var(--edge)}
.cirow .cinote{font-size:11px;color:var(--edge);margin-top:1px}
.ciago{font-size:11px;color:var(--dim);flex:none;display:flex;align-items:center;gap:5px}
.ciago.fresh{color:var(--edge)}
.ciago .dot{width:6px;height:6px;border-radius:50%;background:var(--edge)}
.zgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
.zone{background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:7px 3px;
  text-align:center;min-height:52px;cursor:pointer;display:flex;flex-direction:column;
  align-items:center;justify-content:center}
.zone:hover{border-color:var(--edge)}
.zone .zl{font-size:9.5px;color:var(--dim);line-height:1.25}
.zone.behind{background:#232522;border-style:dashed}
.zone.behind .zl{color:#5f665f}
.zone.booth{border-color:var(--edge)}
.zone.booth .zl{color:var(--edge);letter-spacing:1px;font-weight:700}
.zone.taken{background:var(--green);border-color:var(--edge)}
.zone.taken .zl{color:#cfe9d6}
.zone.mine{box-shadow:inset 0 0 0 2px var(--edge)}
.zone.shut{cursor:default;opacity:.72}
.zone .alleg{font-size:8px;color:var(--edge);margin-top:2px}
.zpp{display:flex;flex-wrap:wrap;justify-content:center;gap:2px;margin-top:3px}
.zsplit{height:1px;background:var(--line);margin:9px 0}
.lockmsg{font-size:12px;color:var(--dim);border-left:2px solid var(--line);padding-left:8px;margin-bottom:10px}
.act .here{position:absolute;bottom:3px;left:6px;font-size:9px;font-weight:700;color:var(--edge)}
@media (max-width:700px){.dock{right:16px}.dockpanel{width:min(320px,calc(100vw - 88px))}}

/* ---- chat ---- */
.fabs{display:flex;flex-direction:column;gap:12px;flex:none}
.fab .cnt.warn{background:var(--danger);color:#fff}
.chatlog{padding:12px;overflow-y:auto;flex:1;min-height:180px;display:flex;flex-direction:column;gap:11px}
.msg{display:flex;gap:9px;align-items:flex-start}
.msg .mb{flex:1;min-width:0}
.msg .mn{font-weight:700;font-size:12.5px}
.msg .mt{font-size:10px;color:var(--dim);font-weight:400;margin-left:6px}
.msg .mx{font-size:13.5px;white-space:pre-wrap;word-break:break-word;margin-top:1px}
.msg .mx a{color:var(--edge)}
.chatbar{display:flex;gap:6px;padding:10px;border-top:1px solid var(--line);align-items:center}
.chatbar input{flex:1;min-width:0;font-size:13px;padding:9px 13px;border-radius:99px}
.chatbar .btn.sm{padding:8px 11px}
#chEmojiBtn.on{border-color:var(--edge);background:var(--green)}
.rxrow{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.rx{background:var(--panel-2);border:1px solid var(--line);border-radius:99px;padding:1px 8px;
  font-size:12px;color:var(--ink);line-height:1.6;display:inline-flex;gap:4px;align-items:center}
.rx.mine{background:var(--green);border-color:var(--edge)}
.rx span{font-size:10.5px;color:var(--dim);font-weight:700}
.rx.mine span{color:#cfe9d6}
.rx.add{opacity:.5;font-size:11px}
.msg:hover .rx.add{opacity:1}
.emojipanel,.rxpick{display:none;grid-template-columns:repeat(8,minmax(0,1fr));gap:2px;padding:8px 10px}
.emojipanel{border-top:1px solid var(--line);max-height:150px;overflow-y:auto}
.emojipanel.open,.rxpick.open{display:grid}
.rxpick{position:fixed;z-index:80;background:var(--panel);border:1px solid var(--line);
  border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.55);width:min(300px,calc(100vw - 24px));
  max-height:200px;overflow-y:auto}
.emojipanel button,.rxpick button{background:none;border:0;font-size:19px;line-height:1;padding:6px 0;
  border-radius:6px;cursor:pointer}
.emojipanel button:active,.rxpick button:active{background:var(--panel-2)}

/* ---- ratings ---- */
.stars{display:flex;gap:5px;margin:6px 0;align-items:center}
.star{font-size:26px;line-height:1;background:none;border:0;padding:0;color:#4a504b;cursor:pointer}
.star.on{color:var(--edge)}
.act .score{position:absolute;bottom:3px;right:6px;font-size:9px;font-weight:700;color:var(--edge)}

/* ---- leaderboard & wrap ---- */
.lbrow{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--line)}
.lbrank{font-size:17px;width:30px;flex:none;text-align:center;color:var(--edge);font-weight:700}
.lbmain{flex:1;min-width:0}
.lbname{font-size:14px;font-weight:600}
.lbscore{font-size:17px;font-weight:700;color:var(--edge);flex:none}
.wsec{font-size:11px;letter-spacing:1.1px;color:var(--edge);text-transform:uppercase;font-weight:700;margin:20px 0 8px}
.wstats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:14px}
.wstat{background:var(--panel-2);border:1px solid var(--line);border-radius:9px;padding:9px 4px;text-align:center}
.wstat b{display:block;font-size:16px;color:var(--edge)}
.wstat span{font-size:9px;color:var(--dim)}
.wcard{background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:9px 11px;
  display:flex;gap:10px;align-items:center;margin-bottom:7px}
.wcard.hero{border-color:var(--edge);background:linear-gradient(90deg,rgba(143,217,119,.10),var(--panel-2))}
.wico{font-size:19px;flex:none;width:24px;text-align:center}
.wn{font-size:13.5px;font-weight:700;margin-top:1px}
.wv{font-size:12px;color:var(--edge);font-weight:700;flex:none}
.wquote{background:var(--panel-2);border-left:3px solid var(--edge);border-radius:8px;padding:11px 13px;font-size:13.5px}


/* ---- one-page shell ---- */
.topbar{position:sticky;top:0;z-index:40;background:var(--bg);
  border-bottom:1px solid var(--line);padding:10px 14px 10px;
  padding-top:calc(10px + env(safe-area-inset-top,0px))}
.tb1{display:flex;align-items:center;gap:8px}
.brandmark{display:flex;align-items:center;gap:7px;flex:0 0 auto}
.brandmark img{width:38px;height:38px;border-radius:10px;display:block}
.brandmark{text-decoration:none;color:var(--ink)}
.brandmark b{font-size:18px;font-weight:700;letter-spacing:-.3px}
.brandmark b span{color:var(--edge)}
.evname{flex:1;min-width:0;text-align:center;font-size:12.5px;color:var(--dim);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 6px}
.evname b{color:var(--ink);font-weight:600;display:block;font-size:17px;line-height:1.15}
.iconbtn{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);
  border-radius:11px;padding:10px 13px;font-size:16px;flex:0 0 auto;
  display:flex;align-items:center;gap:6px;min-height:44px}
.iconbtn:hover{border-color:var(--edge)}
.iconbtn .n{font-size:13px;font-weight:700;color:var(--edge)}
.tb2row{display:flex;align-items:center;gap:10px;margin-top:9px}
.tb2{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;
  padding-bottom:2px;scrollbar-width:none;flex:1;min-width:0}
.tbacts{display:flex;gap:6px;flex:0 0 auto}
.tbacts .iconbtn{padding:9px 11px;min-height:40px;font-size:15px}
.tb2::-webkit-scrollbar{display:none}
.chip{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:99px;
  padding:9px 16px;font-size:13.5px;white-space:nowrap;flex:0 0 auto}
.chip.on{background:var(--green);border-color:var(--edge)}
.chip.day{font-weight:600}
.menugrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}
.menugrid .btn{text-align:left;padding:13px 14px;font-size:13.5px}
.addcol{display:flex;align-items:flex-start;justify-content:center;padding-top:8px}
.addcol button{background:var(--panel-2);border:1px dashed var(--line);color:var(--dim);
  border-radius:9px;padding:10px 8px;font-size:12px;width:100%}
.addcol button:hover{border-color:var(--edge);color:var(--edge)}

/* ---- transport ---- */
.trow{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-top:1px solid var(--line)}
.trow:first-child{border-top:0}
.tmode{font-size:19px;flex:none;width:26px;text-align:center}
.tmain{flex:1;min-width:0}
.tname{font-size:13.5px;font-weight:600}
.tdet{font-size:11.5px;color:var(--dim);margin-top:1px}
.tseat{font-size:11px;color:var(--edge);font-weight:700;flex:none}
.tgroup{font-size:10.5px;letter-spacing:.5px;color:var(--edge);font-weight:700;
  text-transform:uppercase;margin:16px 0 4px}

/* an added stage has no lineup — just hours you can pin */
.act.slot{background:transparent;border:1px dashed #2f3630;display:flex;
  align-items:center;justify-content:center}
.act.slot .t{font-size:14px;color:#4a534a;font-weight:400;padding:0}
.act.slot:hover{border-color:var(--edge)}
.act.slot:hover .t{color:var(--edge)}
.act.slot.mine{background:var(--green);border:1px solid var(--edge);
  flex-direction:column;align-items:flex-start;padding:6px 7px}
.act.slot.mine .t{font-size:11.5px;font-weight:600;color:var(--ink)}
.act.slot.b1,.act.slot.b2,.act.slot.b3{border-style:solid;border-color:var(--line);
  flex-direction:column;align-items:flex-start;padding:6px 7px}
.act.slot.b1 .t,.act.slot.b2 .t,.act.slot.b3 .t{font-size:11.5px;font-weight:600;color:var(--ink)}

.sh .del{position:absolute;top:2px;right:3px;font-size:11px;color:var(--dim);
  background:none;border:0;padding:2px 4px;line-height:1}
.sh .del:hover{color:var(--danger)}

/* ---- site map ---- */
.sheet .panel.wide{max-width:640px}
.mapwrap{position:relative;width:100%;margin-top:10px;background:#0f120f;border-radius:12px;overflow:hidden}
.mapimg{display:block;width:100%;height:auto}
/* The map already prints the stage names, so a pin must not sit on top of them.
   No fill at all — just a bright outline that says "press me". */
.mappin{position:absolute;transform:translate(-50%,-50%);background:none;
  border:2px solid rgba(143,217,119,.9);border-radius:12px;padding:0;
  color:#fff;font:inherit;font-size:11px;font-weight:700;letter-spacing:.3px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
  line-height:1.15;text-shadow:0 1px 3px rgba(0,0,0,.9);cursor:pointer;white-space:nowrap;
  box-shadow:0 0 0 1px rgba(0,0,0,.35), 0 0 10px rgba(143,217,119,.30);
  transition:box-shadow .12s, border-color .12s, background .12s}
.mappin:hover,.mappin:active{border-color:#fff;background:rgba(46,93,67,.35);
  box-shadow:0 0 0 1px rgba(0,0,0,.4), 0 0 16px rgba(143,217,119,.65)}
.mappin.busy{border-color:var(--edge);box-shadow:0 0 0 1px rgba(0,0,0,.4), 0 0 16px rgba(143,217,119,.8)}
.mappin .mpn{font-size:10.5px;background:rgba(20,24,20,.72);border-radius:7px;padding:3px 8px}
.mappin .mpc{position:absolute;top:-8px;right:-8px;background:var(--edge);color:#161711;
  border-radius:99px;min-width:18px;height:18px;line-height:18px;font-size:11px;padding:0 5px}
.mappin .mpl{font-size:9px;font-weight:400;color:#cfe9d6;max-width:96px;overflow:hidden;text-overflow:ellipsis}
@media (max-width:700px){.mappin{font-size:10px}.mappin .mpn{font-size:9.5px;padding:2px 6px}.mappin .mpl{display:none}}

/* ---- required photo ---- */
.photopick{display:flex;align-items:center;gap:12px;margin-top:2px}
.ppprev{width:60px;height:60px;border-radius:50%;flex:none;background:var(--panel-2);
  border:1px dashed var(--line);color:var(--dim);display:flex;align-items:center;
  justify-content:center;font-size:22px;overflow:hidden}
.ppprev img{width:100%;height:100%;object-fit:cover;display:block}
.photopick input{flex:1;min-width:0;font-size:12.5px;padding:9px}

/* ---- passcode ---- */
.codebox{display:flex;align-items:center;gap:10px;background:var(--panel-2);
  border:1px solid var(--edge);border-radius:10px;padding:9px 12px;margin-top:2px}
.codebox span{flex:1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:24px;letter-spacing:7px;color:var(--edge);font-weight:700}

.photopick .btn{flex:1;min-width:0}
.ppprev{font-size:26px}

/* ---- detailed stage plans ---- */
.planwrap{position:relative;width:100%;background:#141614;border:1px solid var(--line);
  border-radius:10px;overflow:hidden}
.planimg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.pgrid{position:absolute;inset:0}
.pcell{position:absolute;background:rgba(20,24,20,.18);border:1px solid rgba(143,217,119,.28);
  color:var(--ink);font:inherit;padding:0;display:flex;align-items:center;justify-content:center;
  cursor:pointer;overflow:hidden}
.pcell:hover{background:rgba(46,93,67,.45);border-color:var(--edge)}
.pcell.taken{background:rgba(46,93,67,.62);border-color:var(--edge)}
.pcell.mine{box-shadow:inset 0 0 0 2px var(--edge)}
.pcell.shut{cursor:default;opacity:.65}
.plab{font-size:8.5px;line-height:1.1;color:rgba(232,234,230,.55);text-align:center;
  padding:2px;text-shadow:0 1px 3px rgba(0,0,0,.9)}
.pcell:hover .plab,.pcell.taken .plab{color:#fff}
.pfaces{display:flex;flex-wrap:wrap;gap:1px;justify-content:center;align-items:center}
.pmore{font-size:9px;font-weight:700;color:var(--edge)}

/* ---- timetable update prompt ---- */
.updbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  background:var(--green);border-bottom:1px solid var(--edge);
  padding:10px 14px;font-size:13px}
.updbar span{flex:1;min-width:150px}

/* ---- one person's details ---- */
.pdet{display:flex;align-items:center;gap:13px;margin-bottom:4px}
.pdet .who{font-size:18px;font-weight:700}
.psec{font-size:10.5px;letter-spacing:1.1px;color:var(--edge);text-transform:uppercase;
  font-weight:700;margin:18px 0 6px}
.pitem{display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line);font-size:13px}
.pitem:first-of-type{border-top:0}
.pitem .t{flex:1;min-width:0}
.pitem .m{font-size:11px;color:var(--dim)}
.pitem .r{color:var(--edge);font-weight:700;flex:none}

.actdesc{font-size:13.5px;line-height:1.5;color:var(--ink);background:var(--panel-2);
  border-left:3px solid var(--edge);border-radius:8px;padding:10px 12px;margin-top:12px}
.updbar.err{background:var(--danger);border-bottom-color:#fff}

.evname.editable{cursor:pointer;border-radius:8px;padding:2px 6px;margin:-2px 0}
.evname.editable:hover{background:var(--panel-2)}
.evname.editable b::after{content:' ✎';font-size:11px;color:var(--dim);font-weight:400}

body.gridpage #app{flex:1;min-height:0;display:flex;flex-direction:column}
body.gridpage .topbar{position:static;flex:0 0 auto}

/* people waiting to be let in */
.pendbox{background:var(--panel-2);border:1px solid var(--edge);border-radius:10px;
  padding:10px 12px;margin:10px 0 4px}
.iconbtn.nudge{border-color:var(--edge);box-shadow:0 0 0 2px rgba(143,217,119,.25)}
.iconbtn.nudge .n{color:var(--edge)}

/* ground outside a tent — same tap target, visibly not the floor */
/* Ground outside a tent: drawn a shade quieter, but the same tap target and the
   same hover as everywhere else — it was reading as decoration before. */
.pcell.outside{border-style:dashed;border-color:rgba(143,217,119,.34);background:rgba(20,24,20,.10)}
.pcell.outside .plab{color:rgba(232,234,230,.55);font-size:8px}
.pcell.outside:hover{background:rgba(46,93,67,.45);border-style:solid;border-color:var(--edge)}
.pcell.outside:hover .plab{color:#fff}
.pcell.outside.taken{background:rgba(46,93,67,.62);border-style:solid;border-color:var(--edge)}
.pcell.outside.mine{border-style:solid}

/* a pin over a stage the map already names: a tap target, not a label */
.mappin.bare{background:none}
