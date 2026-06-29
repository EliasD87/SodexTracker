"use client";

/**
 * SoDEX Demo Trading Terminal
 * Layout: Left Trade Panel | Center Chart | Right Book+Trades stacked
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, X, RotateCcw, AlertCircle, CheckCircle2, TrendingUp, BookOpen, Layers } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { getTokenIcon } from "@/lib/tokenIcons";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface Sym  { name: string; baseCoin: string; pricePrecision: number; quantityPrecision: number; maxLeverage: number; makerFee: string; takerFee: string; }
interface Tick { symbol: string; lastPx: string; highPx: string; lowPx: string; quoteVolume: string; changePct: number; change: string; markPrice: string; indexPrice: string; fundingRate: string; nextFundingTime: number; openInterest: string; }
interface Kline { t: number; o: string; h: string; l: string; c: string; v: string; }
interface Book  { bids: [string, string][]; asks: [string, string][]; }
interface MkTrd { T: number; p: string; q: string; S: "BUY" | "SELL"; }

interface DemoPos  { id: string; sym: string; side: "LONG"|"SHORT"; size: number; entry: number; lev: number; margin: number; tp?: number; sl?: number; }
interface DemoOrd  { id: string; sym: string; side: "Buy"|"Sell"; limitPx: number; qty: number; notional: number; margin: number; lev: number; ts: number; tp?: number; sl?: number; }
interface DemoFill { id: string; sym: string; side: "Buy"|"Sell"; price: number; qty: number; notional: number; fee: number; pnl?: number; ts: number; }
interface Demo     { bal: number; pos: DemoPos[]; ord: DemoOrd[]; fills: DemoFill[]; }

/* ── Constants ───────────────────────────────────────────────────────────────── */

const GW   = "https://mainnet-gw.sodex.dev/api/v1";
const WS   = "wss://mainnet-gw.sodex.dev/ws/perps";
const KEY  = "sdx-demo-v4";
const BAL0 = 10_000;
const IVS  = ["1m","5m","15m","30m","1h","4h","1D","1W"] as const;
type IV    = typeof IVS[number];

/* ── Utils ───────────────────────────────────────────────────────────────────── */

const uid  = () => Math.random().toString(36).slice(2, 9);
const $    = (n: number|string, dp?: number) => { const v = +n; if (!v||isNaN(v)) return "—"; const d = dp??(v>=1e4?0:v>=100?2:v>=1?4:6); return v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}); };
const $vol = (n: number|string) => { const v=+n; if(!v) return "$0"; return v>=1e9?"$"+(v/1e9).toFixed(2)+"B":v>=1e6?"$"+(v/1e6).toFixed(2)+"M":v>=1e3?"$"+(v/1e3).toFixed(2)+"K":"$"+v.toFixed(2); };
const liq  = (side:"LONG"|"SHORT", entry:number, lev:number) => side==="LONG" ? entry*(1-1/lev+0.005) : entry*(1+1/lev-0.005);
const cdwn = (ts:number) => { const d=ts-Date.now(); if(d<=0) return "00:00:00"; const h=Math.floor(d/3.6e6),m=Math.floor(d%3.6e6/6e4),s=Math.floor(d%6e4/1e3); return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; };
const rD   = ():Demo => { try { const r=localStorage.getItem(KEY); return r?JSON.parse(r):{bal:BAL0,pos:[],ord:[],fills:[]}; } catch { return {bal:BAL0,pos:[],ord:[],fills:[]}; }};
const sD   = (d:Demo) => { try { localStorage.setItem(KEY,JSON.stringify(d)); } catch{} };

/* ── Notifications ───────────────────────────────────────────────────────────── */

interface Toast { id:string; text:string; kind:"success"|"error"|"info"; ts:number; }

function ToastStack({toasts,onClose}:{toasts:Toast[];onClose:(id:string)=>void}) {
  return createPortal(
    <div style={{position:"fixed",top:70,right:16,zIndex:10000,display:"flex",flexDirection:"column",gap:6,pointerEvents:"none",maxWidth:340}}>
      {toasts.map(t=>{
        const color = t.kind==="success"?"var(--green)":t.kind==="error"?"var(--red)":"var(--text-muted)";
        const bg = t.kind==="success"?"var(--green-tint)":t.kind==="error"?"var(--cal-red-tint)":"var(--spotlight)";
        const Icon = t.kind==="success"?CheckCircle2:t.kind==="error"?AlertCircle:TrendingUp;
        return (
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,background:bg,border:`1px solid ${color}33`,boxShadow:"0 4px 16px rgba(0,0,0,.3)",pointerEvents:"auto",animation:"slideIn 0.2s ease"}}>
            <Icon size={13} style={{color,flexShrink:0}}/>
            <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,color,fontWeight:500,flex:1}}>{t.text}</span>
            <button onClick={()=>onClose(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-faint)",padding:0,display:"flex"}}><X size={11}/></button>
          </div>
        );
      })}
      <style>{`@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
    </div>,
    document.body
  );
}

/* ── Token icon ──────────────────────────────────────────────────────────────── */

function Coin({sym,size=18}:{sym:string;size?:number}) {
  const base=sym.split("-")[0], src=getTokenIcon(base);
  return src
    ? <img src={src} alt={base} width={size} height={size} className="rounded-full shrink-0"/>
    : <div className="rounded-full flex items-center justify-center shrink-0 mono font-bold"
        style={{width:size,height:size,background:"var(--bg-elevated)",color:"var(--text-muted)",fontSize:size*.36}}>
        {base.slice(0,2)}
      </div>;
}

/* ── Lightweight Chart ───────────────────────────────────────────────────────── */

function useIsDark() {
  const [dark,setDark]=useState(()=>typeof window!=="undefined"&&document.documentElement.classList.contains("dark"));
  useEffect(()=>{
    const obs=new MutationObserver(()=>setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement,{attributes:true,attributeFilter:["class"]});
    return()=>obs.disconnect();
  },[]);
  return dark;
}

function useMobile() {
  const [m,setM]=useState(()=>typeof window!=="undefined"&&window.innerWidth<768);
  useEffect(()=>{
    const fn=()=>setM(window.innerWidth<768);
    window.addEventListener("resize",fn);
    return()=>window.removeEventListener("resize",fn);
  },[]);
  return m;
}

function chartTheme(dark:boolean) {
  return {
    text:    dark?"#484848":"#b8b8b6",
    grid:    dark?"rgba(255,255,255,0.035)":"rgba(0,0,0,0.04)",
    border:  dark?"#1e1e1e":"#e8e8e6",
    xhair:   dark?"#333":"rgba(0,0,0,0.15)",
    xLabel:  dark?"#1c1c1c":"#f0f0ee",
    volUp:   dark?"rgba(53,199,127,.22)" :"rgba(22,163,74,.15)",
    volDown: dark?"rgba(240,97,109,.22)":"rgba(220,38,38,.15)",
    upClr:   dark?"#35C77F":"#16A34A",
    dnClr:   dark?"#F0616D":"#DC2626",
  };
}

function Chart({klines,live,sym,iv,fills}:{klines:Kline[];live:Kline|null;sym:string;iv:IV;fills:DemoFill[]}) {
  const boxRef  = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lw      = useRef<{chart:any;cs:any;vs:any}|null>(null);
  const ready   = useRef(false);
  const klinesRef = useRef<Kline[]>(klines);
  klinesRef.current = klines;
  const fillsRef = useRef<DemoFill[]>(fills);
  fillsRef.current = fills;
  const isDark = useIsDark();
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyData(cs:any, vs:any, chart:any, data:Kline[], dark:boolean) {
    if (!data.length) return;
    const th = chartTheme(dark);
    const sorted = [...data].sort((a,b)=>a.t-b.t);
    cs.setData(sorted.map(k=>({time:Math.floor(k.t/1000),open:+k.o,high:+k.h,low:+k.l,close:+k.c})));
    vs.setData(sorted.map(k=>({time:Math.floor(k.t/1000),value:+k.v,color:+k.c>=+k.o?th.volUp:th.volDown})));
    chart.timeScale().fitContent();
  }

  useEffect(()=>{
    if(!boxRef.current||ready.current) return;
    ready.current=true;
    let ro:ResizeObserver;
    import("lightweight-charts").then((L:any)=>{
      const el=boxRef.current!;
      if (!el) return;
      const dark = isDarkRef.current;
      const th   = chartTheme(dark);
      const font = getComputedStyle(document.documentElement).getPropertyValue("--font-space-grotesk").trim()||"system-ui";
      const chart=L.createChart(el,{
        width:el.clientWidth, height:el.clientHeight,
        layout:{ background:{type:L.ColorType.Solid,color:"transparent"}, textColor:th.text, fontFamily:font, fontSize:10 },
        grid:{ vertLines:{color:th.grid}, horzLines:{color:th.grid} },
        crosshair:{ mode:L.CrosshairMode.Normal, vertLine:{color:th.xhair,style:1,width:1,labelBackgroundColor:th.xLabel}, horzLine:{color:th.xhair,style:1,width:1,labelBackgroundColor:th.xLabel} },
        rightPriceScale:{ borderColor:th.border, scaleMargins:{top:0.05,bottom:0.22} },
        timeScale:{ borderColor:th.border, timeVisible:true, secondsVisible:false },
      });
      const cs=chart.addCandlestickSeries({upColor:th.upClr,downColor:th.dnClr,borderUpColor:th.upClr,borderDownColor:th.dnClr,wickUpColor:th.upClr,wickDownColor:th.dnClr});
      const vs=chart.addHistogramSeries({priceFormat:{type:"volume"},priceScaleId:"vol"});
      chart.priceScale("vol").applyOptions({scaleMargins:{top:0.82,bottom:0}});
      lw.current={chart,cs,vs};
      applyData(cs, vs, chart, klinesRef.current, dark);
      ro=new ResizeObserver(()=>{ if(el) chart.applyOptions({width:el.clientWidth,height:el.clientHeight}); });
      ro.observe(el);
    });
    return ()=>{ ro?.disconnect(); lw.current?.chart.remove(); lw.current=null; ready.current=false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Re-theme chart when dark mode toggles
  useEffect(()=>{
    if(!lw.current) return;
    const th=chartTheme(isDark);
    const font=getComputedStyle(document.documentElement).getPropertyValue("--font-space-grotesk").trim()||"system-ui";
    lw.current.chart.applyOptions({
      layout:{ textColor:th.text, fontFamily:font },
      grid:{ vertLines:{color:th.grid}, horzLines:{color:th.grid} },
      crosshair:{ vertLine:{color:th.xhair,labelBackgroundColor:th.xLabel}, horzLine:{color:th.xhair,labelBackgroundColor:th.xLabel} },
      rightPriceScale:{ borderColor:th.border },
      timeScale:{ borderColor:th.border },
    });
    lw.current.cs.applyOptions({upColor:th.upClr,downColor:th.dnClr,borderUpColor:th.upClr,borderDownColor:th.dnClr,wickUpColor:th.upClr,wickDownColor:th.dnClr});
  },[isDark]);

  useEffect(()=>{
    if(!lw.current||!klines.length) return;
    applyData(lw.current.cs, lw.current.vs, lw.current.chart, klines, isDark);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[klines]);

  useEffect(()=>{
    if(!lw.current||!live) return;
    const {volUp,volDown}=chartTheme(isDark);
    const t=Math.floor(live.t/1000);
    lw.current.cs.update({time:t,open:+live.o,high:+live.h,low:+live.l,close:+live.c});
    lw.current.vs.update({time:t,value:+live.v,color:+live.c>=+live.o?volUp:volDown});
  },[live,isDark]);

  // Update markers when fills change
  useEffect(()=>{
    if(!lw.current?.cs) return;
    const symFills = fillsRef.current.filter(f=>f.sym===sym);
    if(!symFills.length) { lw.current.cs.setMarkers([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markers:any[] = symFills.slice(0,50).reverse().map(f=>{
      const isBuy = f.side==="Buy";
      const isClose = f.pnl!=null;
      return {
        time: Math.floor(f.ts/1000),
        position: isBuy ? "belowBar" : "aboveBar",
        color: isBuy ? (isDarkRef.current?"#35C77F":"#16A34A") : (isDarkRef.current?"#F0616D":"#DC2626"),
        shape: isClose ? (isBuy ? "arrowUp" : "arrowDown") : (isBuy ? "arrowUp" : "arrowDown"),
        text: isClose ? `${isBuy?"Close Short":"Close Long"} ${f.pnl!=null&&f.pnl>=0?"+":""}${f.pnl?.toFixed(0)??"0"}` : `${isBuy?"Long":"Short"} @ ${$(f.price)}`,
      };
    });
    lw.current.cs.setMarkers(markers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[fills,sym]);

  return (
    <div className="relative w-full h-full">
      <div ref={boxRef} className="w-full h-full"/>
      <span className="absolute bottom-8 left-3 pointer-events-none select-none"
        style={{fontSize:9,opacity:.14,color:"var(--text)",fontFamily:"var(--font-space-grotesk)",letterSpacing:"0.04em"}}>
        {sym} · {iv} · PAPER
      </span>
    </div>
  );
}

/* ── Market Picker ───────────────────────────────────────────────────────────── */

function Picker({symbols,tickers,active,onPick,onClose,anchorRef}:{
  symbols:Sym[];tickers:Map<string,Tick>;active:string;
  onPick:(s:string)=>void;onClose:()=>void;
  anchorRef:React.RefObject<HTMLButtonElement|null>;
}) {
  const [q,setQ]=useState("");
  const [pos,setPos]=useState({top:98,left:0});
  const inp=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    inp.current?.focus();
    if(anchorRef.current){
      const r=anchorRef.current.getBoundingClientRect();
      setPos({top:r.bottom+6,left:r.left});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const list=symbols.filter(s=>!q||s.name.toLowerCase().includes(q.toLowerCase())||s.baseCoin.toLowerCase().includes(q.toLowerCase()));
  return createPortal(
    <div style={{position:"fixed",top:pos.top,left:pos.left,zIndex:9999,width:520,maxHeight:420,display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--bg-surface)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 24px 64px rgba(0,0,0,.7)"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:"1px solid var(--border-subtle)"}}>
        <Search size={13} style={{color:"var(--text-faint)",flexShrink:0}}/>
        <input ref={inp} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search pair…"
          style={{flex:1,background:"transparent",border:"none",outline:"none",fontFamily:"var(--font-space-grotesk)",fontSize:12,color:"var(--text)"}}/>
        <button onClick={onClose} style={{color:"var(--text-faint)",cursor:"pointer",background:"none",border:"none"}}><X size={13}/></button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 88px 76px 88px 72px",padding:"6px 12px 4px",gap:0,borderBottom:"1px solid var(--border-subtle)"}}>
        {["Pair","Mark","24H%","Volume","OI"].map(h=><span key={h} style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</span>)}
      </div>
      <div style={{overflowY:"auto",flex:1}}>
        {list.map(s=>{
          const t=tickers.get(s.name), p=t?.changePct??0, on=s.name===active;
          return (
            <button key={s.name} onClick={()=>{onPick(s.name);onClose();}}
              style={{width:"100%",display:"grid",gridTemplateColumns:"1fr 88px 76px 88px 72px",padding:"7px 12px",background:on?"var(--accent-dim)":"transparent",cursor:"pointer",border:"none",textAlign:"left"}}
              onMouseEnter={e=>{if(!on)(e.currentTarget as HTMLElement).style.background="var(--bg-elevated)";}}
              onMouseLeave={e=>{if(!on)(e.currentTarget as HTMLElement).style.background="transparent";}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Coin sym={s.name} size={17}/>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:12,fontWeight:600,color:"var(--text)"}}>{s.name}</span>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,padding:"1px 4px",background:"var(--bg-elevated)",color:"var(--text-faint)",borderRadius:3}}>{s.maxLeverage}×</span>
              </div>
              <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,color:"var(--text)"}}>{t?$(t.markPrice):"—"}</span>
              <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,color:p>=0?"var(--green)":"var(--red)"}}>{p>=0?"+":""}{p.toFixed(2)}%</span>
              <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,color:"var(--text-muted)"}}>{t?$vol(+t.quoteVolume):"—"}</span>
              <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,color:"var(--text-muted)"}}>{t?$vol(+t.openInterest * +t.markPrice):"—"}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

/* ── Order Book ──────────────────────────────────────────────────────────────── */

function OrderBook({book,info,onPx}:{book:Book;info:Sym|null;onPx:(p:string)=>void}) {
  const dp=info?.pricePrecision??2, qp=info?.quantityPrecision??4;
  const asks=[...book.asks].reverse();
  const bids=book.bids;
  const maxQ=Math.max(...[...asks,...bids].map(([,q])=>+q),1);
  const spread=asks.length&&bids.length?+asks[asks.length-1][0]-+bids[0][0]:0;

  const Row=({price,qty,isBid}:{price:string;qty:string;isBid:boolean})=>{
    const pct=(+qty/maxQ)*100;
    return (
      <button onClick={()=>onPx(price)}
        style={{position:"relative",width:"100%",display:"flex",alignItems:"center",padding:"1.5px 8px",background:"transparent",border:"none",cursor:"pointer"}}
        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="var(--spotlight)";}}
        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";}}>
        {/* depth bar — from right edge */}
        <div style={{position:"absolute",right:0,top:0,bottom:0,width:`${pct}%`,
          background:isBid?"var(--green-tint)":"var(--cal-red-tint)",pointerEvents:"none"}}/>
        <span style={{flex:1,fontFamily:"var(--font-space-grotesk)",fontSize:10.5,fontWeight:500,color:isBid?"var(--green)":"var(--red)",textAlign:"left",position:"relative",zIndex:1,fontVariantNumeric:"tabular-nums"}}>
          {(+price).toLocaleString("en-US",{minimumFractionDigits:dp,maximumFractionDigits:dp})}
        </span>
        <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:10.5,color:"var(--text-muted)",width:58,textAlign:"right",position:"relative",zIndex:1,fontVariantNumeric:"tabular-nums"}}>{(+qty).toFixed(qp)}</span>
        <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:10,color:"var(--text-faint)",width:64,textAlign:"right",position:"relative",zIndex:1,fontVariantNumeric:"tabular-nums"}}>{(+price * +qty).toFixed(0)}</span>
      </button>
    );
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      {/* Column headers */}
      <div style={{display:"flex",padding:"2px 8px 3px",flexShrink:0}}>
        <span style={{flex:1,fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",letterSpacing:"0.02em"}}>Price</span>
        <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",width:58,textAlign:"right",letterSpacing:"0.02em"}}>Size</span>
        <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",width:64,textAlign:"right",letterSpacing:"0.02em"}}>Total</span>
      </div>
      {/* Asks */}
      <div style={{flex:1,display:"flex",flexDirection:"column-reverse",overflow:"hidden",minHeight:0}}>
        {asks.map(([p,q])=><Row key={p} price={p} qty={q} isBid={false}/>)}
      </div>
      {/* Spread */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"2px 8px",margin:"0 4px",borderRadius:4,flexShrink:0,background:"var(--spotlight)"}}>
        <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",letterSpacing:"0.03em"}}>Spread</span>
        <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:600,color:"var(--text-muted)",fontVariantNumeric:"tabular-nums"}}>{spread>0?spread.toFixed(dp):"—"}</span>
      </div>
      {/* Bids */}
      <div style={{flex:1,overflow:"hidden",minHeight:0}}>
        {bids.map(([p,q])=><Row key={p} price={p} qty={q} isBid={true}/>)}
      </div>
    </div>
  );
}

/* ── Market Trades ───────────────────────────────────────────────────────────── */

function MktTrades({trades,info}:{trades:MkTrd[];info:Sym|null}) {
  const dp=info?.pricePrecision??2, qp=info?.quantityPrecision??4;
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{display:"flex",padding:"2px 8px 3px",flexShrink:0}}>
        {["Price","Size","Time"].map((h,i)=>(
          <span key={h} style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",letterSpacing:"0.02em",flex:i===0?1:undefined,width:i===1?60:i===2?56:undefined,textAlign:i===0?"left":"right"}}>{h}</span>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",minHeight:0}}>
        {trades.map((t,i)=>(
          <div key={i} style={{display:"flex",padding:"2px 8px"}}>
            <span style={{flex:1,fontFamily:"var(--font-space-grotesk)",fontSize:10.5,color:t.S==="BUY"?"var(--green)":"var(--red)"}}>
              {(+t.p).toLocaleString("en-US",{minimumFractionDigits:dp,maximumFractionDigits:dp})}
            </span>
            <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:10.5,color:"var(--text-muted)",width:60,textAlign:"right"}}>{(+t.q).toFixed(qp)}</span>
            <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:10,color:"var(--text-faint)",width:56,textAlign:"right"}}>
              {new Date(t.T).toLocaleTimeString("en-US",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"})}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Trade Panel (LEFT sidebar) ──────────────────────────────────────────────── */

function TradePanel({symbol,info,ticker,demo,lev,setLev,limitHint,onOrder,onReset}:{
  symbol:string; info:Sym|null; ticker:Tick|null; demo:Demo;
  lev:number; setLev:(n:number)=>void; limitHint:string;
  onOrder:(side:"Buy"|"Sell",type:"Market"|"Limit",amount:number,limitPx?:number,tp?:number,sl?:number)=>string|null;
  onReset:()=>void;
}) {
  const [side,setSide]=useState<"Buy"|"Sell">("Buy");
  const [type,setType]=useState<"Market"|"Limit">("Market");
  const [amtStr,setAmtStr]=useState("");
  const [limStr,setLimStr]=useState(limitHint);
  const [tpStr,setTpStr]=useState("");
  const [slStr,setSlStr]=useState("");
  const [showTPSL,setShowTPSL]=useState(false);
  const [levOpen,setLevOpen]=useState(false);
  const [msg,setMsg]=useState<{text:string;ok:boolean}|null>(null);

  // sync limit hint from order book click
  useEffect(()=>{ if(limitHint) setLimStr(limitHint); },[limitHint]);

  const mark   = +(ticker?.markPrice??0);
  const execPx = type==="Market" ? mark : (+limStr||mark);
  const amount = +amtStr||0;
  const notional = amount*lev;
  const qtyV   = execPx>0 ? notional/execPx : 0;
  const feeR   = type==="Market" ? +(info?.takerFee??"0.0004") : +(info?.makerFee??"0.00012");
  const feeUSD = notional*feeR;
  const liqPx  = qtyV>0 ? liq(side==="Buy"?"LONG":"SHORT",execPx,lev) : 0;
  const maxLev = info?.maxLeverage??20;
  const pos    = demo.pos.find(p=>p.sym===symbol);

  function flash(text:string,ok:boolean){setMsg({text,ok});setTimeout(()=>setMsg(null),2500);}
  function go(){
    if(amount<=0){flash("Enter an amount",false);return;}
    if(!mark){flash("Price unavailable",false);return;}
    const tp=tpStr?+tpStr:undefined;
    const sl=slStr?+slStr:undefined;
    const err=onOrder(side,type,amount,type==="Limit"?(+limStr||undefined):undefined,tp,sl);
    if(err) flash(err,false); else {flash(`${side} order placed`,true);setAmtStr("");setTpStr("");setSlStr("");}
  }
  function pct(p:number){setAmtStr((demo.bal*p/100).toFixed(2));}

  const green="var(--green)", red="var(--red)";
  const accent=side==="Buy"?green:red;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      {/* Buy / Sell tabs — top strip */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",flexShrink:0}}>
        {(["Buy","Sell"] as const).map(s=>(
          <button key={s} onClick={()=>setSide(s)}
            style={{
              padding:"11px 0",fontFamily:"var(--font-space-grotesk)",fontSize:12,fontWeight:700,cursor:"pointer",border:"none",
              background:side===s?(s==="Buy"?"rgba(22,163,74,0.1)":"rgba(220,38,38,0.08)"):"transparent",
              color:side===s?(s==="Buy"?green:red):"var(--text-faint)",
              transition:"all 0.15s",
            }}>
            {s}
          </button>
        ))}
      </div>

      {/* Order type pill */}
      <div style={{display:"flex",gap:3,padding:"8px 12px 0",flexShrink:0}}>
        {(["Market","Limit"] as const).map(t=>(
          <button key={t} onClick={()=>setType(t)}
            style={{
              padding:"3px 10px",fontFamily:"var(--font-space-grotesk)",fontSize:10.5,fontWeight:600,cursor:"pointer",
              background:type===t?"var(--accent)":"transparent",
              border:`1px solid ${type===t?"var(--accent)":"var(--border)"}`,
              borderRadius:20,color:type===t?"var(--accent-fg)":"var(--text-faint)",
              transition:"all 0.15s",
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:8,minHeight:220}}>

        {/* Available */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.05em"}}>Available</span>
          <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,fontWeight:600,color:green}}>
            {demo.bal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} USDC
          </span>
        </div>

        {/* Leverage row */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setLevOpen(v=>!v)}
            style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:6,cursor:"pointer"}}>
            <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:10,color:"var(--text-faint)"}}>Leverage</span>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:12,fontWeight:700,color:"var(--text)"}}>{lev}×</span>
              <ChevronDown size={10} style={{color:"var(--text-faint)"}}/>
            </div>
          </button>
          {levOpen&&(
            <div style={{position:"absolute",inset:"calc(100% + 4px) 0 auto",zIndex:20,background:"var(--bg-surface)",border:"1px solid var(--border)",borderRadius:8,padding:12,boxShadow:"0 12px 32px rgba(0,0,0,.4)"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)"}}>1×</span>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:12,fontWeight:700,color:accent}}>{lev}×</span>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)"}}>{maxLev}×</span>
              </div>
              <input type="range" min={1} max={maxLev} value={lev} onChange={e=>setLev(+e.target.value)}
                style={{width:"100%",accentColor:"var(--accent)"}}/>
              <button onClick={()=>setLevOpen(false)}
                style={{width:"100%",marginTop:8,padding:"5px 0",fontFamily:"var(--font-space-grotesk)",fontSize:10,fontWeight:700,background:"var(--accent)",color:"var(--accent-fg)",borderRadius:5,cursor:"pointer",border:"none"}}>
                Set {lev}×
              </button>
            </div>
          )}
        </div>

        {/* Limit price */}
        {type==="Limit"&&(
          <div>
            <label style={{display:"block",fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Limit Price</label>
            <div style={{position:"relative"}}>
              <input value={limStr} onChange={e=>setLimStr(e.target.value)}
                placeholder={mark>0?mark.toFixed(2):"0.00"}
                style={{width:"100%",padding:"6px 36px 6px 10px",fontFamily:"var(--font-space-grotesk)",fontSize:12,background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",outline:"none",boxSizing:"border-box"}}/>
              <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)"}}>USDC</span>
            </div>
          </div>
        )}

        {/* Amount */}
        <div>
          <label style={{display:"block",fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Margin</label>
          <div style={{position:"relative"}}>
            <input value={amtStr} onChange={e=>setAmtStr(e.target.value)} placeholder="0.00"
              style={{width:"100%",padding:"6px 36px 6px 10px",fontFamily:"var(--font-space-grotesk)",fontSize:12,background:"var(--bg-elevated)",border:`1px solid ${amount>0?accent:"var(--border)"}`,borderRadius:6,color:"var(--text)",outline:"none",boxSizing:"border-box"}}/>
            <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)"}}>USDC</span>
          </div>
        </div>

        {/* Pct buttons */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:3}}>
          {[10,25,50,75,100].map(p=>(
            <button key={p} onClick={()=>pct(p)}
              style={{padding:"4px 0",fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:600,cursor:"pointer",
                background:"transparent",border:"1px solid var(--border-subtle)",borderRadius:20,color:"var(--text-faint)",
                transition:"all 0.12s"}}
              onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor=accent;el.style.color=accent;el.style.background="var(--spotlight)";}}
              onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor="var(--border-subtle)";el.style.color="var(--text-faint)";el.style.background="transparent";}}>
              {p}%
            </button>
          ))}
        </div>

        {/* TP/SL toggle */}
        <button onClick={()=>setShowTPSL(v=>!v)}
          style={{display:"flex",alignItems:"center",gap:4,padding:"4px 0",fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:600,cursor:"pointer",background:"transparent",border:"none",color:showTPSL?accent:"var(--text-faint)",transition:"color 0.15s"}}>
          <span style={{fontSize:9}}>TP / SL</span>
          <span style={{fontSize:8,opacity:0.6}}>{showTPSL?"▾":"▸"}</span>
        </button>
        {showTPSL&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <div>
              <label style={{display:"block",fontFamily:"var(--font-space-grotesk)",fontSize:8,color:"var(--green)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>Take Profit</label>
              <input value={tpStr} onChange={e=>setTpStr(e.target.value)} placeholder="—" inputMode="decimal"
                style={{width:"100%",padding:"5px 8px",fontFamily:"var(--font-space-grotesk)",fontSize:11,background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:5,color:"var(--text)",outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={{display:"block",fontFamily:"var(--font-space-grotesk)",fontSize:8,color:"var(--red)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>Stop Loss</label>
              <input value={slStr} onChange={e=>setSlStr(e.target.value)} placeholder="—" inputMode="decimal"
                style={{width:"100%",padding:"5px 8px",fontFamily:"var(--font-space-grotesk)",fontSize:11,background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:5,color:"var(--text)",outline:"none",boxSizing:"border-box"}}/>
            </div>
          </div>
        )}

        {/* Summary card */}
        {qtyV>0&&(
          <div style={{borderRadius:8,padding:"8px 10px",display:"flex",flexDirection:"column",gap:4,background:"var(--spotlight)"}}>
            {([
              ["Qty",     `${qtyV<1e-3?qtyV.toExponential(3):qtyV.toFixed(info?.quantityPrecision??4)} ${info?.baseCoin??""}`],
              ["Notional",`$${notional.toFixed(2)}`],
              ["Est. Fee",`−$${feeUSD.toFixed(4)}`],
              ["Liq. ~",   liqPx>0?`$${$(liqPx)}`:"—"],
            ] as [string,string][]).map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:10,color:"var(--text-faint)"}}>{l}</span>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:10,fontVariantNumeric:"tabular-nums",color:"var(--text-muted)"}}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Submit */}
        <button onClick={go}
          style={{width:"100%",padding:"10px 0",fontFamily:"var(--font-space-grotesk)",fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:8,border:"none",
            background:accent,color:"#fff",opacity:amount>0?1:0.45,transition:"opacity 0.15s"}}>
          {side === "Buy" ? "Open Long" : "Open Short"}
        </button>

        {/* Feedback */}
        {msg&&(
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:7,background:msg.ok?"var(--green-tint)":"var(--cal-red-tint)"}}>
            {msg.ok?<CheckCircle2 size={10} style={{color:"var(--green)",flexShrink:0}}/>:<AlertCircle size={10} style={{color:"var(--red)",flexShrink:0}}/>}
            <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:10,color:msg.ok?"var(--green)":"var(--red)"}}>{msg.text}</span>
          </div>
        )}

        {/* Open position widget */}
        {pos&&(
          <div style={{padding:"8px 10px",background:pos.side==="LONG"?"var(--green-tint)":"var(--cal-red-tint)",borderRadius:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
              <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",letterSpacing:"0.04em"}}>Open Position</span>
              <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:10,fontWeight:700,color:pos.side==="LONG"?"var(--green)":"var(--red)"}}>{pos.side} {pos.lev}×</span>
            </div>
            <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,color:"var(--text-muted)",fontVariantNumeric:"tabular-nums"}}>
              {pos.size.toFixed(info?.quantityPrecision??4)} {info?.baseCoin} · entry ${$(pos.entry)}
            </span>
            {/* Live PnL + Liq */}
            {(()=>{
              const mp=mark||pos.entry;
              const pnl=pos.side==="LONG"?(mp-pos.entry)*pos.size:(pos.entry-mp)*pos.size;
              const liqP=liq(pos.side,pos.entry,pos.lev);
              const pnlPct=pos.margin>0?(pnl/pos.margin*100):0;
              return (
                <div style={{display:"flex",gap:8,marginTop:5,flexWrap:"wrap"}}>
                  <div style={{display:"flex",flexDirection:"column"}}>
                    <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:8,color:"var(--text-faint)",textTransform:"uppercase"}}>PnL</span>
                    <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,fontWeight:700,fontVariantNumeric:"tabular-nums",color:pnl>=0?"var(--green)":"var(--red)"}}>
                      {pnl>=0?"+":""}{pnl.toFixed(2)} ({pnlPct>=0?"+":""}{pnlPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column"}}>
                    <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:8,color:"var(--text-faint)",textTransform:"uppercase"}}>Liq.</span>
                    <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,fontWeight:600,fontVariantNumeric:"tabular-nums",color:"var(--text-muted)"}}>${$(liqP)}</span>
                  </div>
                  {pos.tp&&(
                    <div style={{display:"flex",flexDirection:"column"}}>
                      <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:8,color:"var(--text-faint)",textTransform:"uppercase"}}>TP</span>
                      <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,fontWeight:600,fontVariantNumeric:"tabular-nums",color:"var(--green)"}}>${$(pos.tp)}</span>
                    </div>
                  )}
                  {pos.sl&&(
                    <div style={{display:"flex",flexDirection:"column"}}>
                      <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:8,color:"var(--text-faint)",textTransform:"uppercase"}}>SL</span>
                      <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,fontWeight:600,fontVariantNumeric:"tabular-nums",color:"var(--red)"}}>${$(pos.sl)}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Footer: balance + reset */}
      <div style={{padding:"8px 12px 10px",borderTop:"1px solid var(--border-subtle)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div>
          <p style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",letterSpacing:"0.04em",marginBottom:2}}>Demo Balance</p>
          <p style={{fontFamily:"var(--font-space-grotesk)",fontSize:14,fontWeight:700,color:"var(--text)",fontVariantNumeric:"tabular-nums",letterSpacing:"-0.02em"}}>
            ${demo.bal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
          </p>
        </div>
        <button onClick={onReset}
          style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:600,cursor:"pointer",border:"1px solid var(--border-subtle)",borderRadius:20,color:"var(--text-faint)",background:"transparent",transition:"all 0.12s"}}
          onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor="var(--red)";el.style.color="var(--red)";}}
          onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor="var(--border-subtle)";el.style.color="var(--text-faint)";}}>
          <RotateCcw size={9}/> Reset
        </button>
      </div>
    </div>
  );
}

/* ── Bottom panel ────────────────────────────────────────────────────────────── */

type BTab="pos"|"ord"|"fills";

function Bottom({demo,tickers,onClose,onCancel,onEditTPSL,onLimitClose}:{demo:Demo;tickers:Map<string,Tick>;onClose:(id:string,mp:number)=>void;onCancel:(id:string)=>void;onEditTPSL:(id:string,tp?:number,sl?:number)=>void;onLimitClose:(id:string,limitPx:number)=>void}) {
  const [tab,setTab]=useState<BTab>("pos");
  const [closeId,setCloseId]=useState<string|null>(null);
  const [editId,setEditId]=useState<string|null>(null);
  const [editTp,setEditTp]=useState("");
  const [editSl,setEditSl]=useState("");
  const [limitCloseId,setLimitCloseId]=useState<string|null>(null);
  const [limitClosePx,setLimitClosePx]=useState("");

  const Th=({cols}:{cols:string[]})=>(
    <tr style={{borderBottom:"1px solid var(--border-subtle)"}}>
      {cols.map(c=><th key={c} style={{padding:"5px 12px",textAlign:"left",fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{c}</th>)}
    </tr>
  );
  const Td=({children,color="var(--text-muted)"}:{children:React.ReactNode;color?:string})=>(
    <td style={{padding:"5px 12px",fontFamily:"var(--font-space-grotesk)",fontSize:11,color,whiteSpace:"nowrap"}}>{children}</td>
  );

  const tabs:Array<{id:BTab;label:string}> = [
    {id:"pos",  label:"Positions"},
    {id:"ord",  label:"Orders"},
    {id:"fills",label:"History"},
  ];

  function startEdit(posId:string,tp?:number,sl?:number){
    setEditId(posId); setEditTp(tp?String(tp):""); setEditSl(sl?String(sl):"");
    setCloseId(null);
  }
  function saveEdit(){
    if(!editId)return;
    const tp=editTp?+editTp:undefined;
    const sl=editSl?+editSl:undefined;
    onEditTPSL(editId,tp,sl);
    setEditId(null);
  }
  function startLimitClose(posId:string,markPx:number){
    setLimitCloseId(posId);
    setLimitClosePx(String(markPx.toFixed(2)));
    setCloseId(null);
  }
  function confirmLimitClose(){
    if(!limitCloseId||!limitClosePx)return;
    onLimitClose(limitCloseId,+limitClosePx);
    setLimitCloseId(null); setLimitClosePx("");
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",borderBottom:"1px solid var(--border-subtle)",flexShrink:0,gap:0}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"0 14px",height:34,fontFamily:"var(--font-space-grotesk)",fontSize:11,fontWeight:500,cursor:"pointer",background:"transparent",border:"none",
              color:tab===t.id?"var(--text)":"var(--text-faint)"}}>
            {t.label}
            {t.id==="pos"&&demo.pos.length>0&&<span style={{marginLeft:4,fontSize:9,opacity:0.6}}>{demo.pos.length}</span>}
            {t.id==="ord"&&demo.ord.length>0&&<span style={{marginLeft:4,fontSize:9,opacity:0.6}}>{demo.ord.length}</span>}
          </button>
        ))}
      </div>
      <div style={{flex:1,overflow:"auto",minHeight:0}}>
        {/* Positions */}
        {tab==="pos"&&(
          demo.pos.length===0
            ? <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:50,fontFamily:"var(--font-space-grotesk)",fontSize:10,color:"var(--text-faint)"}}>No open positions</div>
            : <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><Th cols={["Symbol","Side","Size","Entry","Mark","Unr. PnL","Liq.","TP","SL",""]}/></thead>
                <tbody>
                  {demo.pos.map(p=>{
                    const t=tickers.get(p.sym), mp=t?+t.markPrice:p.entry;
                    const pnl=p.side==="LONG"?(mp-p.entry)*p.size:(p.entry-mp)*p.size;
                    const pnlPct=p.margin>0?(pnl/p.margin*100):0;
                    const isEditing=editId===p.id;
                    return (
                      <tr key={p.id} style={{borderBottom:"1px solid var(--border-subtle)"}}>
                        <Td><div style={{display:"flex",alignItems:"center",gap:6}}><Coin sym={p.sym} size={14}/><span style={{color:"var(--text)",fontWeight:600}}>{p.sym}</span><span style={{fontSize:8,padding:"1px 3px",background:"var(--bg-elevated)",color:"var(--text-faint)",borderRadius:2}}>{p.lev}×</span></div></Td>
                        <Td color={p.side==="LONG"?"var(--green)":"var(--red)"}><b>{p.side}</b></Td>
                        <Td>{p.size.toFixed(4)}</Td>
                        <Td>${$(p.entry)}</Td>
                        <Td color="var(--text)">{mp>0?"$"+$(mp):"—"}</Td>
                        <Td color={pnl>=0?"var(--green)":"var(--red)"}><b>{pnl>=0?"+":""}{pnl.toFixed(2)}</b><span style={{fontSize:9,opacity:0.7}}> ({pnlPct>=0?"+":""}{pnlPct.toFixed(1)}%)</span></Td>
                        <Td color="var(--text-faint)">${$(liq(p.side,p.entry,p.lev))}</Td>
                        {/* TP cell — editable */}
                        <td style={{padding:"3px 12px"}}>
                          {isEditing?(
                            <input value={editTp} onChange={e=>setEditTp(e.target.value)} placeholder="—" inputMode="decimal"
                              onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditId(null);}}
                              style={{width:64,padding:"3px 6px",fontFamily:"var(--font-space-grotesk)",fontSize:10,background:"var(--bg-elevated)",border:"1px solid var(--green)",borderRadius:4,color:"var(--text)",outline:"none",boxSizing:"border-box"}}/>
                          ):(
                            <button onClick={()=>startEdit(p.id,p.tp,p.sl)} style={{background:"transparent",border:"none",cursor:"pointer",padding:0,fontFamily:"var(--font-space-grotesk)",fontSize:11,color:p.tp?"var(--green)":"var(--text-faint)",whiteSpace:"nowrap"}}>
                              {p.tp?"$"+$(p.tp):"—"}
                            </button>
                          )}
                        </td>
                        {/* SL cell — editable */}
                        <td style={{padding:"3px 12px"}}>
                          {isEditing?(
                            <input value={editSl} onChange={e=>setEditSl(e.target.value)} placeholder="—" inputMode="decimal"
                              onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditId(null);}}
                              style={{width:64,padding:"3px 6px",fontFamily:"var(--font-space-grotesk)",fontSize:10,background:"var(--bg-elevated)",border:"1px solid var(--red)",borderRadius:4,color:"var(--text)",outline:"none",boxSizing:"border-box"}}/>
                          ):(
                            <button onClick={()=>startEdit(p.id,p.tp,p.sl)} style={{background:"transparent",border:"none",cursor:"pointer",padding:0,fontFamily:"var(--font-space-grotesk)",fontSize:11,color:p.sl?"var(--red)":"var(--text-faint)",whiteSpace:"nowrap"}}>
                              {p.sl?"$"+$(p.sl):"—"}
                            </button>
                          )}
                        </td>
                        <td style={{padding:"5px 12px",position:"relative"}}>
                          {isEditing?(
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={saveEdit} style={{padding:"2px 8px",fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:600,cursor:"pointer",border:"1px solid var(--green)",borderRadius:3,color:"var(--green)",background:"transparent"}}>Save</button>
                              <button onClick={()=>setEditId(null)} style={{padding:"2px 8px",fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:600,cursor:"pointer",border:"1px solid var(--border)",borderRadius:3,color:"var(--text-faint)",background:"transparent"}}>Cancel</button>
                            </div>
                          ):(
                            <>
                              <button onClick={()=>setCloseId(closeId===p.id?null:p.id)}
                                style={{padding:"2px 8px",fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:600,cursor:"pointer",border:"1px solid var(--border)",borderRadius:3,color:"var(--text-muted)",background:"transparent"}}>
                                Close ▾
                              </button>
                              {closeId===p.id&&(
                                <>
                                  <div style={{position:"fixed",inset:0,zIndex:99}} onClick={()=>setCloseId(null)}/>
                                  <div style={{position:"absolute",top:"100%",right:0,zIndex:100,background:"var(--bg-surface)",border:"1px solid var(--border)",borderRadius:6,boxShadow:"0 8px 24px rgba(0,0,0,.4)",padding:4,display:"flex",flexDirection:"column",gap:2,minWidth:130}}>
                                    <button onClick={()=>{onClose(p.id,mp);setCloseId(null);}}
                                      style={{padding:"5px 10px",fontFamily:"var(--font-space-grotesk)",fontSize:10,fontWeight:600,cursor:"pointer",border:"none",borderRadius:4,color:"var(--text)",background:"transparent",textAlign:"left",whiteSpace:"nowrap"}}>
                                      Market Close
                                    </button>
                                    <button onClick={()=>{startLimitClose(p.id,mp);}}
                                      style={{padding:"5px 10px",fontFamily:"var(--font-space-grotesk)",fontSize:10,fontWeight:600,cursor:"pointer",border:"none",borderRadius:4,color:"var(--text-muted)",background:"transparent",textAlign:"left",whiteSpace:"nowrap"}}>
                                      Limit Close…
                                    </button>
                                    <button onClick={()=>{onClose(p.id,p.entry);setCloseId(null);}}
                                      style={{padding:"5px 10px",fontFamily:"var(--font-space-grotesk)",fontSize:10,fontWeight:600,cursor:"pointer",border:"none",borderRadius:4,color:"var(--text-faint)",background:"transparent",textAlign:"left",whiteSpace:"nowrap"}}>
                                      Close at Entry
                                    </button>
                                  </div>
                                </>
                              )}
                              {limitCloseId===p.id&&(
                                <>
                                  <div style={{position:"fixed",inset:0,zIndex:99}} onClick={()=>setLimitCloseId(null)}/>
                                  <div style={{position:"absolute",top:"100%",right:0,zIndex:100,background:"var(--bg-surface)",border:"1px solid var(--border)",borderRadius:6,boxShadow:"0 8px 24px rgba(0,0,0,.4)",padding:8,display:"flex",flexDirection:"column",gap:6,minWidth:180}}>
                                    <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,color:"var(--text-faint)",textTransform:"uppercase"}}>Limit Close Price</span>
                                    <input value={limitClosePx} onChange={e=>setLimitClosePx(e.target.value)} inputMode="decimal"
                                      onKeyDown={e=>{if(e.key==="Enter")confirmLimitClose();if(e.key==="Escape")setLimitCloseId(null);}}
                                      style={{width:"100%",padding:"5px 8px",fontFamily:"var(--font-space-grotesk)",fontSize:11,background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:4,color:"var(--text)",outline:"none",boxSizing:"border-box"}}/>
                                    <div style={{display:"flex",gap:4}}>
                                      <button onClick={confirmLimitClose} style={{flex:1,padding:"4px 0",fontFamily:"var(--font-space-grotesk)",fontSize:10,fontWeight:600,cursor:"pointer",border:"none",borderRadius:4,color:"#fff",background:"var(--accent)"}}>Place</button>
                                      <button onClick={()=>setLimitCloseId(null)} style={{padding:"4px 8px",fontFamily:"var(--font-space-grotesk)",fontSize:10,fontWeight:600,cursor:"pointer",border:"1px solid var(--border)",borderRadius:4,color:"var(--text-faint)",background:"transparent"}}>Cancel</button>
                                    </div>
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
        )}
        {/* Orders */}
        {tab==="ord"&&(
          demo.ord.length===0
            ? <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:50,fontFamily:"var(--font-space-grotesk)",fontSize:10,color:"var(--text-faint)"}}>No open orders</div>
            : <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><Th cols={["Time","Symbol","Side","Limit Price","Qty","Notional","Lev.","TP","SL",""]}/></thead>
                <tbody>
                  {demo.ord.map(o=>(
                    <tr key={o.id} style={{borderBottom:"1px solid var(--border-subtle)"}}>
                      <Td color="var(--text-faint)">{new Date(o.ts).toLocaleTimeString("en-US",{hour12:false})}</Td>
                      <Td color="var(--text)"><b>{o.sym}</b></Td>
                      <Td color={o.side==="Buy"?"var(--green)":"var(--red)"}><b>{o.side}</b></Td>
                      <Td>${$(o.limitPx)}</Td>
                      <Td>{o.qty.toFixed(4)}</Td>
                      <Td>${o.notional.toFixed(2)}</Td>
                      <Td color="var(--text-faint)">{o.lev}×</Td>
                      <Td color={o.tp?"var(--green)":"var(--text-faint)"}>{o.tp?"$"+$(o.tp):"—"}</Td>
                      <Td color={o.sl?"var(--red)":"var(--text-faint)"}>{o.sl?"$"+$(o.sl):"—"}</Td>
                      <td style={{padding:"5px 12px"}}>
                        <button onClick={()=>onCancel(o.id)}
                          style={{padding:"2px 8px",fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:600,cursor:"pointer",border:"1px solid var(--border)",borderRadius:3,color:"var(--text-faint)",background:"transparent"}}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}
        {/* History */}
        {tab==="fills"&&(
          demo.fills.length===0
            ? <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:50,fontFamily:"var(--font-space-grotesk)",fontSize:10,color:"var(--text-faint)"}}>No history yet</div>
            : <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><Th cols={["Time","Symbol","Side","Price","Qty","Fee","PnL"]}/></thead>
                <tbody>
                  {demo.fills.map(f=>(
                    <tr key={f.id} style={{borderBottom:"1px solid var(--border-subtle)"}}>
                      <Td color="var(--text-faint)">{new Date(f.ts).toLocaleTimeString("en-US",{hour12:false})}</Td>
                      <Td color="var(--text)"><b>{f.sym}</b></Td>
                      <Td color={f.side==="Buy"?"var(--green)":"var(--red)"}><b>{f.side}</b></Td>
                      <Td>${$(f.price)}</Td>
                      <Td>{f.qty.toFixed(4)}</Td>
                      <Td color="var(--red)">−${f.fee.toFixed(4)}</Td>
                      <Td color={f.pnl!=null?(f.pnl>=0?"var(--green)":"var(--red)"):"var(--text-faint)"}>
                        {f.pnl!=null?`${f.pnl>=0?"+":""}${f.pnl.toFixed(2)}`:"—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════ PAGE ═══════════════════════════════ */

export function TradingPage({initialSymbol}:{initialSymbol:string}) {
  const router=useRouter();

  const [symbols,setSymbols]=useState<Sym[]>([]);
  const [tickers,setTickers]=useState<Map<string,Tick>>(new Map());
  const [sym,setSym]=useState(initialSymbol);
  const [klines,setKlines]=useState<Kline[]>([]);
  const [liveK,setLiveK]=useState<Kline|null>(null);
  const [book,setBook]=useState<Book>({bids:[],asks:[]});
  const [trades,setTrades]=useState<MkTrd[]>([]);
  const [iv,setIv]=useState<IV>("5m");
  const [lev,setLev]=useState(20);
  const [showPicker,setShowPicker]=useState(false);
  const symBtnRef=useRef<HTMLButtonElement>(null);
  const [limitHint,setLimitHint]=useState("");
  const [fundCdwn,setFundCdwn]=useState("00:00:00");
  const [bottomH,setBottomH]=useState(180);
  const [dragging,setDragging]=useState(false);
  const [demo,setDemo]=useState<Demo>(rD);
  const [mTab,setMTab]=useState<"trade"|"book"|"positions">("trade");
  const [toasts,setToasts]=useState<Toast[]>([]);
  const isMobile=useMobile();
  const wsRef=useRef<WebSocket|null>(null);

  const info=symbols.find(s=>s.name===sym)??null;
  const tick=tickers.get(sym)??null;
  const mark=+(tick?.markPrice??0);
  const pct =tick?.changePct??0;
  const col =pct>=0?"var(--green)":"var(--red)";

  function pushToast(text:string,kind:Toast["kind"]="info"){
    const id=uid();
    setToasts(prev=>[...prev,{id,text,kind,ts:Date.now()}]);
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),4000);
  }
  function closeToast(id:string){setToasts(prev=>prev.filter(t=>t.id!==id));}

  /* load symbols */
  useEffect(()=>{
    fetch(`${GW}/perps/markets/symbols`).then(r=>r.json()).then(j=>{if(j.code===0)setSymbols(j.data);}).catch(()=>{});
  },[]);

  /* poll tickers */
  const fetchTick=useCallback(()=>{
    fetch(`${GW}/perps/markets/tickers`).then(r=>r.json()).then(j=>{
      if(j.code!==0)return;
      const m=new Map<string,Tick>(); for(const t of j.data)m.set(t.symbol,t); setTickers(m);
    }).catch(()=>{});
  },[]);
  useEffect(()=>{fetchTick();const id=setInterval(fetchTick,5000);return()=>clearInterval(id);},[fetchTick]);

  /* funding countdown */
  useEffect(()=>{
    if(!tick)return;
    const nft=tick.nextFundingTime;
    setFundCdwn(cdwn(nft));
    const id=setInterval(()=>setFundCdwn(cdwn(nft)),1000);
    return()=>clearInterval(id);
  },[tick?.nextFundingTime]);

  /* load klines */
  useEffect(()=>{
    setKlines([]);setLiveK(null);
    fetch(`${GW}/perps/markets/${sym}/klines?interval=${iv}&limit=200`).then(r=>r.json()).then(j=>{if(j.code===0&&j.data)setKlines(j.data);}).catch(()=>{});
  },[sym,iv]);

  /* load book + trades */
  useEffect(()=>{
    setBook({bids:[],asks:[]});setTrades([]);
    Promise.all([
      fetch(`${GW}/perps/markets/${sym}/orderbook?limit=20`).then(r=>r.json()),
      fetch(`${GW}/perps/markets/${sym}/trades?limit=50`).then(r=>r.json()),
    ]).then(([ob,tr])=>{
      if(ob.code===0&&ob.data)setBook({bids:ob.data.bids??[],asks:ob.data.asks??[]});
      if(tr.code===0&&tr.data)setTrades(tr.data);
    }).catch(()=>{});
  },[sym]);

  /* websocket */
  useEffect(()=>{
    const ws=new WebSocket(WS); wsRef.current=ws;
    ws.onopen=()=>{
      ws.send(JSON.stringify({op:"subscribe",params:{channel:"candle",symbol:sym,interval:iv}}));
      ws.send(JSON.stringify({op:"subscribe",params:{channel:"l2Book",symbol:sym}}));
      ws.send(JSON.stringify({op:"subscribe",params:{channel:"trade",symbols:[sym]}}));
    };
    ws.onmessage=ev=>{
      try{
        const m=JSON.parse(ev.data as string);
        if(m.channel==="candle"&&m.type==="update"&&m.data)setLiveK(m.data);
        else if(m.channel==="l2Book"&&m.data)setBook({bids:m.data.b??[],asks:m.data.a??[]});
        else if(m.channel==="trade"&&m.type==="update"&&m.data)setTrades(p=>[...(m.data as MkTrd[]),...p].slice(0,50));
      }catch{}
    };
    ws.onerror=()=>{};
    return()=>{try{ws.close();}catch{}wsRef.current=null;};
  },[sym,iv]);

  /* auto-fill limits + TP/SL monitoring */
  useEffect(()=>{
    if(!mark)return;
    // Check TP/SL on ALL open positions (not just current symbol)
    const tpHit=demo.pos.filter(p=>{
      const t=tickers.get(p.sym), mp=t?+t.markPrice:p.entry;
      if(!mp)return false;
      return (p.side==="LONG"&&p.tp&&mp>=p.tp)||
             (p.side==="SHORT"&&p.tp&&mp<=p.tp)||
             (p.side==="LONG"&&p.sl&&mp<=p.sl)||
             (p.side==="SHORT"&&p.sl&&mp>=p.sl);
    });
    if(tpHit.length){
      setDemo(prev=>{
        let bal=prev.bal; const pos=[...prev.pos], fills=[...prev.fills];
        for(const p of tpHit){
          const xi=pos.findIndex(x=>x.id===p.id); if(xi<0)continue;
          const ex=pos[xi];
          const t=tickers.get(ex.sym), mp=t?+t.markPrice:ex.entry;
          const closePx=(ex.side==="LONG"&&ex.tp&&mp>=ex.tp)?ex.tp:
                        (ex.side==="SHORT"&&ex.tp&&mp<=ex.tp)?ex.tp:
                        (ex.side==="LONG"&&ex.sl&&mp<=ex.sl)?ex.sl:ex.sl!;
          const takFee=+(info?.takerFee??"0.0004");
          const pnl=ex.side==="LONG"?(closePx-ex.entry)*ex.size:(ex.entry-closePx)*ex.size;
          const fee=ex.size*closePx*takFee;
          fills.unshift({id:uid(),sym:ex.sym,side:ex.side==="LONG"?"Sell":"Buy",price:closePx,qty:ex.size,notional:ex.size*closePx,fee,pnl:pnl-fee,ts:Date.now()});
          bal+=ex.margin+pnl-fee; pos.splice(xi,1);
          const reason=(ex.side==="LONG"&&ex.tp&&mp>=ex.tp)||(ex.side==="SHORT"&&ex.tp&&mp<=ex.tp)?"TP":"SL";
          pushToast(`${ex.sym} ${ex.side} closed by ${reason} — PnL ${pnl>=0?"+":""}${pnl.toFixed(2)}`,pnl>=0?"success":"error");
        }
        const ns:Demo={bal:Math.max(0,bal),pos,ord:prev.ord,fills:fills.slice(0,200)};sD(ns);return ns;
      });
      return;
    }
    // Check limit orders for current symbol only (mark price is for current sym)
    if(!demo.ord.length)return;
    const hit=demo.ord.filter(o=>o.sym===sym&&((o.side==="Buy"&&mark<=o.limitPx)||(o.side==="Sell"&&mark>=o.limitPx)));
    if(!hit.length)return;
    setDemo(prev=>{
      let bal=prev.bal;
      const pos=[...prev.pos], ord=prev.ord.filter(o=>!hit.includes(o)), fills=[...prev.fills];
      for(const o of hit){
        const fee=o.notional*+(info?.makerFee??"0.00012");
        const f:DemoFill={id:uid(),sym:o.sym,side:o.side,price:o.limitPx,qty:o.qty,notional:o.notional,fee,ts:Date.now()};
        const xi=pos.findIndex(p=>p.sym===o.sym&&((p.side==="LONG"&&o.side==="Sell")||(p.side==="SHORT"&&o.side==="Buy")));
        if(xi>=0){
          const ex=pos[xi];
          const pnl=ex.side==="LONG"?(o.limitPx-ex.entry)*ex.size:(ex.entry-o.limitPx)*ex.size;
          f.pnl=pnl-fee; bal+=ex.margin+pnl-fee; pos.splice(xi,1);
          pushToast(`${o.sym} limit ${o.side} filled — Position closed, PnL ${pnl>=0?"+":""}${pnl.toFixed(2)}`,pnl>=0?"success":"error");
        } else {
          pos.push({id:uid(),sym:o.sym,side:o.side==="Buy"?"LONG":"SHORT",size:o.qty,entry:o.limitPx,lev:o.lev,margin:o.margin,tp:o.tp,sl:o.sl});
          pushToast(`${o.sym} limit ${o.side} filled — ${o.side==="Buy"?"LONG":"SHORT"} opened`, "success");
        }
        fills.unshift(f);
      }
      const ns:Demo={bal:Math.max(0,bal),pos,ord,fills:fills.slice(0,200)};sD(ns);return ns;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mark,demo.ord,demo.pos,tickers]);

  /* resize drag */
  useEffect(()=>{
    if(!dragging)return;
    const mv=(e:MouseEvent)=>setBottomH(Math.max(34,Math.min(420,window.innerHeight-e.clientY)));
    const up=()=>setDragging(false);
    window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
    return()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);};
  },[dragging]);

  function pick(s:string){setSym(s);setShowPicker(false);router.replace(`/trade/${encodeURIComponent(s)}`);}

  function handleOrder(side:"Buy"|"Sell",type:"Market"|"Limit",amount:number,limitPx?:number,tp?:number,sl?:number):string|null{
    if(!mark)return "Price unavailable";
    const execPx=type==="Market"?mark:(limitPx??mark);
    const takFee=+(info?.takerFee??"0.0004");
    const notional=amount*lev, qtyV=notional/execPx, fee=type==="Market"?notional*takFee:0;
    if(demo.bal<amount+fee)return "Insufficient balance";
    setDemo(prev=>{
      let bal=prev.bal; const pos=[...prev.pos],ord=[...prev.ord],fills=[...prev.fills];
      if(type==="Market"){
        const xi=pos.findIndex(p=>p.sym===sym&&((p.side==="LONG"&&side==="Sell")||(p.side==="SHORT"&&side==="Buy")));
        if(xi>=0){
          const ex=pos[xi]; const pnl=ex.side==="LONG"?(execPx-ex.entry)*ex.size:(ex.entry-execPx)*ex.size;
          const cf=ex.size*execPx*takFee;
          fills.unshift({id:uid(),sym,side,price:execPx,qty:ex.size,notional:ex.size*execPx,fee:cf,pnl:pnl-cf,ts:Date.now()});
          bal+=ex.margin+pnl-cf; pos.splice(xi,1);
          pushToast(`${sym} ${ex.side} closed — PnL ${pnl>=0?"+":""}${pnl.toFixed(2)}`,pnl>=0?"success":"error");
        } else {
          bal-=amount+fee;
          fills.unshift({id:uid(),sym,side,price:execPx,qty:qtyV,notional,fee,ts:Date.now()});
          pos.push({id:uid(),sym,side:side==="Buy"?"LONG":"SHORT",size:qtyV,entry:execPx,lev,margin:amount,tp,sl});
          const sideLabel=side==="Buy"?"LONG":"SHORT";
          pushToast(`${sym} ${sideLabel} opened @ $${$(execPx)}${tp?" TP $"+$(tp):""}${sl?" SL $"+$(sl):""}`,"success");
        }
      } else {
        bal-=amount;
        ord.push({id:uid(),sym,side,limitPx:execPx,qty:qtyV,notional,margin:amount,lev,ts:Date.now(),tp,sl});
        pushToast(`${sym} limit ${side} @ $${$(execPx)} placed`,"info");
      }
      const ns:Demo={bal:Math.max(0,bal),pos,ord,fills:fills.slice(0,200)};sD(ns);return ns;
    });
    return null;
  }

  function handleClose(id:string,mp:number){
    setDemo(prev=>{
      const p=prev.pos.find(x=>x.id===id); if(!p)return prev;
      const takFee=+(info?.takerFee??"0.0004"), pnl=p.side==="LONG"?(mp-p.entry)*p.size:(p.entry-mp)*p.size;
      const fee=p.size*mp*takFee;
      const f:DemoFill={id:uid(),sym:p.sym,side:p.side==="LONG"?"Sell":"Buy",price:mp,qty:p.size,notional:p.size*mp,fee,pnl:pnl-fee,ts:Date.now()};
      const ns:Demo={bal:Math.max(0,prev.bal+p.margin+pnl-fee),pos:prev.pos.filter(x=>x.id!==id),ord:prev.ord,fills:[f,...prev.fills].slice(0,200)};sD(ns);return ns;
    });
    pushToast(`Position market closed`, "info");
  }

  function handleEditTPSL(id:string,tp?:number,sl?:number){
    setDemo(prev=>{
      const pos=prev.pos.map(p=>p.id===id?{...p,tp,sl}:p);
      const ns:Demo={...prev,pos};sD(ns);return ns;
    });
    const p=demo.pos.find(x=>x.id===id);
    if(p) pushToast(`${p.sym} TP/SL updated${tp?" TP $"+$(tp):""}${sl?" SL $"+$(sl):""}`, "info");
  }

  function handleLimitClose(id:string,limitPx:number){
    setDemo(prev=>{
      const p=prev.pos.find(x=>x.id===id); if(!p)return prev;
      const closeSide=p.side==="LONG"?"Sell":"Buy";
      const ord:DemoOrd={id:uid(),sym:p.sym,side:closeSide,limitPx,qty:p.size,notional:p.size*limitPx,margin:0,lev:p.lev,ts:Date.now()};
      const ns:Demo={...prev,ord:[...prev.ord,ord]};sD(ns);return ns;
    });
    pushToast(`Limit close order placed`, "info");
  }

  function handleCancel(id:string){
    setDemo(prev=>{
      const o=prev.ord.find(x=>x.id===id); if(!o)return prev;
      const ns:Demo={...prev,bal:prev.bal+o.margin,ord:prev.ord.filter(x=>x.id!==id)};sD(ns);return ns;
    });
    pushToast(`Order cancelled`, "info");
  }

  function handleReset(){
    if(!confirm("Reset demo account to $10,000 USDC?"))return;
    const ns:Demo={bal:BAL0,pos:[],ord:[],fills:[]}; setDemo(ns); sD(ns);
  }

  /* ── Shared sub-panels ── */
  const ChartPanel = (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{flex:1,overflow:"hidden",minHeight:0}}>
        {klines.length>0
          ? <Chart klines={klines} live={liveK} sym={sym} iv={iv} fills={demo.fills}/>
          : <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",fontFamily:"var(--font-space-grotesk)",fontSize:11,color:"var(--text-faint)"}}>Loading chart…</div>
        }
      </div>
      <div style={{display:"flex",alignItems:"center",gap:2,padding:"4px 10px",background:"var(--bg-surface)",borderTop:"1px solid var(--border-subtle)",flexShrink:0}}>
        {IVS.map(i=>(
          <button key={i} onClick={()=>setIv(i)}
            style={{padding:"3px 9px",borderRadius:5,background:iv===i?"var(--bg-elevated)":"transparent",
              color:iv===i?"var(--text)":"var(--text-faint)",fontFamily:"var(--font-space-grotesk)",fontSize:11,fontWeight:500,cursor:"pointer",border:iv===i?"1px solid var(--border)":"1px solid transparent"}}>
            {i}
          </button>
        ))}
      </div>
    </div>
  );

  const BookPanel = (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{flex:"0 0 55%",overflow:"hidden",minHeight:0,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"5px 8px 2px",flexShrink:0}}>
          <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:600,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.07em"}}>Order Book</span>
        </div>
        <div style={{flex:1,overflow:"hidden",minHeight:0}}>
          <OrderBook book={book} info={info} onPx={setLimitHint}/>
        </div>
      </div>
      <div style={{height:1,background:"var(--border-subtle)",flexShrink:0,margin:"0 8px"}}/>
      <div style={{flex:1,overflow:"hidden",minHeight:0,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"5px 8px 2px",flexShrink:0}}>
          <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:600,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.07em"}}>Recent Trades</span>
        </div>
        <div style={{flex:1,overflow:"hidden",minHeight:0}}>
          <MktTrades trades={trades} info={info}/>
        </div>
      </div>
    </div>
  );

  /* ─────────────────────────── RENDER ──────────────────────────────────── */
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100dvh",background:"var(--bg)",overflow:"hidden",paddingBottom:isMobile?60:0}}>
      <Navbar/>
      <ToastStack toasts={toasts} onClose={closeToast}/>

      {/* ══ MOBILE LAYOUT ══ */}
      {isMobile ? (
        <>
          {/* Compact mobile top bar */}
          <div style={{marginTop:56,height:48,display:"flex",alignItems:"center",gap:0,background:"var(--bg-surface)",borderBottom:"1px solid var(--border-subtle)",flexShrink:0,paddingRight:8}}>
            <div style={{position:"relative",flexShrink:0}}>
              <button ref={symBtnRef} onClick={()=>setShowPicker(v=>!v)}
                style={{display:"flex",alignItems:"center",gap:6,padding:"0 12px",height:48,cursor:"pointer",background:"transparent",border:"none"}}>
                <Coin sym={sym} size={20}/>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:13,fontWeight:700,color:"var(--text)"}}>{sym}</span>
                <ChevronDown size={10} style={{color:"var(--text-faint)"}}/>
              </button>
              {showPicker&&(
                <>
                  <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={()=>setShowPicker(false)}/>
                  <Picker symbols={symbols} tickers={tickers} active={sym} onPick={pick} onClose={()=>setShowPicker(false)} anchorRef={symBtnRef}/>
                </>
              )}
            </div>
            <div style={{marginLeft:4}}>
              <div style={{fontFamily:"var(--font-space-grotesk)",fontSize:15,fontWeight:700,color:col,fontVariantNumeric:"tabular-nums",lineHeight:1}}>{tick?$(tick.markPrice):"—"}</div>
              <div style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,color:col,lineHeight:1,marginTop:2,fontVariantNumeric:"tabular-nums"}}>{tick?`${pct>=0?"+":""}${pct.toFixed(2)}%`:"—"}</div>
            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:12}}>
              {([
                {l:"24H High",v:tick?$(tick.highPx):"—",c:"var(--green)"},
                {l:"24H Low", v:tick?$(tick.lowPx):"—", c:"var(--red)"},
                {l:"Volume",  v:tick?$vol(+tick.quoteVolume):"—",c:"var(--text-muted)"},
              ]).map(({l,v,c})=>(
                <div key={l} style={{textAlign:"right"}}>
                  <div style={{fontFamily:"var(--font-space-grotesk)",fontSize:8,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</div>
                  <div style={{fontFamily:"var(--font-space-grotesk)",fontSize:11,fontWeight:500,color:c,fontVariantNumeric:"tabular-nums"}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Active panel */}
          <div style={{flex:1,overflowY:"auto",overflowX:"hidden",minHeight:0}}>
            {mTab==="trade" && (
              <div style={{display:"flex",flexDirection:"column"}}>
                {/* Chart fixed height */}
                <div style={{height:260,flexShrink:0,overflow:"hidden"}}>
                  {klines.length>0
                    ? <Chart klines={klines} live={liveK} sym={sym} iv={iv} fills={demo.fills}/>
                    : <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",fontFamily:"var(--font-space-grotesk)",fontSize:11,color:"var(--text-faint)"}}>Loading chart…</div>
                  }
                </div>
                {/* Interval pills */}
                <div style={{display:"flex",alignItems:"center",gap:2,padding:"5px 10px",background:"var(--bg-surface)",borderTop:"1px solid var(--border-subtle)",borderBottom:"1px solid var(--border-subtle)",flexShrink:0}}>
                  {IVS.map(i=>(
                    <button key={i} onClick={()=>setIv(i)}
                      style={{padding:"3px 9px",borderRadius:5,background:iv===i?"var(--bg-elevated)":"transparent",
                        color:iv===i?"var(--text)":"var(--text-faint)",fontFamily:"var(--font-space-grotesk)",fontSize:11,fontWeight:500,cursor:"pointer",border:iv===i?"1px solid var(--border)":"1px solid transparent"}}>
                      {i}
                    </button>
                  ))}
                </div>
                {/* Trade form */}
                <TradePanel
                  symbol={sym} info={info} ticker={tick} demo={demo}
                  lev={lev} setLev={setLev} limitHint={limitHint}
                  onOrder={handleOrder} onReset={handleReset}
                />
              </div>
            )}
            {mTab==="book" && (
              <div style={{minHeight:500}}>
                {BookPanel}
              </div>
            )}
            {mTab==="positions" && (
              <div style={{minHeight:300}}>
                <Bottom demo={demo} tickers={tickers} onClose={handleClose} onCancel={handleCancel} onEditTPSL={handleEditTPSL} onLimitClose={handleLimitClose}/>
              </div>
            )}
          </div>

          {/* Mobile tab bar — sits above the site's fixed bottom nav */}
          <div style={{height:50,display:"flex",background:"var(--bg-surface)",borderTop:"1px solid var(--border-subtle)",flexShrink:0}}>
            {([
              {id:"trade"     as const, label:"Trade",     icon:<TrendingUp size={16}/>},
              {id:"book"      as const, label:"Book",      icon:<BookOpen   size={16}/>},
              {id:"positions" as const, label:"Positions", icon:<Layers     size={16}/>},
            ]).map(t=>(
              <button key={t.id} onClick={()=>setMTab(t.id)}
                style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:"transparent",border:"none",cursor:"pointer",
                  color:mTab===t.id?"var(--text)":"var(--text-faint)",transition:"color 0.15s"}}>
                {t.icon}
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:10,fontWeight:600,letterSpacing:"0.02em"}}>{t.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        /* ══ DESKTOP LAYOUT ══ */
        <>
          {/* ── Top bar ── */}
          <div style={{marginTop:56,height:44,display:"flex",alignItems:"center",background:"var(--bg-surface)",borderBottom:"1px solid var(--border-subtle)",flexShrink:0,overflowX:"auto",gap:0}}>
            {/* Symbol button */}
            <div style={{position:"relative",flexShrink:0,borderRight:"1px solid var(--border-subtle)"}}>
              <button ref={symBtnRef} onClick={()=>setShowPicker(v=>!v)}
                style={{display:"flex",alignItems:"center",gap:7,padding:"0 14px",height:42,cursor:"pointer",background:"transparent",border:"none"}}>
                <Coin sym={sym} size={22}/>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:14,fontWeight:700,color:"var(--text)"}}>{sym}</span>
                <ChevronDown size={11} style={{color:"var(--text-faint)"}}/>
              </button>
              {showPicker&&(
                <>
                  <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={()=>setShowPicker(false)}/>
                  <Picker symbols={symbols} tickers={tickers} active={sym} onPick={pick} onClose={()=>setShowPicker(false)} anchorRef={symBtnRef}/>
                </>
              )}
            </div>
            {/* Mark price */}
            <div style={{display:"flex",flexDirection:"column",padding:"0 14px",height:42,justifyContent:"center",borderRight:"1px solid var(--border-subtle)",flexShrink:0}}>
              <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:8,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Mark</span>
              <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:14,fontWeight:700,color:col}}>{tick?$(tick.markPrice):"—"}</span>
            </div>
            {([
              {l:"Index",   v:tick?$(tick.indexPrice):"—",  c:"var(--text-muted)"},
              {l:"24H Chg", v:tick?`${pct>=0?"+":""}${pct.toFixed(2)}%`:"—", c:col},
              {l:"24H High",v:tick?$(tick.highPx):"—",      c:"var(--green)"},
              {l:"24H Low", v:tick?$(tick.lowPx):"—",       c:"var(--red)"},
              {l:"Volume",  v:tick?$vol(+tick.quoteVolume):"—", c:"var(--text-muted)"},
              {l:"OI",      v:tick?$vol(+tick.openInterest * +tick.markPrice):"—", c:"var(--text-muted)"},
            ]).map(({l,v,c})=>(
              <div key={l} style={{display:"flex",flexDirection:"column",padding:"0 12px",height:42,justifyContent:"center",borderRight:"1px solid var(--border-subtle)",flexShrink:0}}>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:8,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</span>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11.5,fontWeight:500,color:c}}>{v}</span>
              </div>
            ))}
            {/* Funding */}
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 14px",marginLeft:"auto",flexShrink:0}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:tick&&+tick.fundingRate>=0?"var(--green)":"var(--red)",boxShadow:tick&&+tick.fundingRate>=0?"0 0 4px var(--green)":"0 0 4px var(--red)"}}/>
              <div style={{display:"flex",flexDirection:"column"}}>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:8,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Funding / Next</span>
                <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:11.5,fontWeight:600,color:tick&&+tick.fundingRate>=0?"var(--green)":"var(--red)"}}>
                  {tick?`${+tick.fundingRate>=0?"+":""}${(+tick.fundingRate*100).toFixed(4)}%`:"—"} / {fundCdwn}
                </span>
              </div>
            </div>
            <div style={{padding:"0 12px",flexShrink:0,borderLeft:"1px solid var(--border-subtle)"}}>
              <span style={{fontFamily:"var(--font-space-grotesk)",fontSize:9,fontWeight:700,padding:"3px 7px",background:"var(--green-tint)",color:"var(--green)",border:"1px solid var(--green-edge)",borderRadius:4,letterSpacing:"0.06em"}}>
                PAPER
              </span>
            </div>
          </div>

          {/* ── Main 3-col ── */}
          <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0,padding:"8px 8px 0",gap:7}}>
            {/* LEFT: Trade card */}
            <div style={{width:238,flexShrink:0,display:"flex",flexDirection:"column",borderRadius:12,border:"1px solid var(--border-subtle)",background:"var(--bg-surface)",overflow:"hidden"}}>
              <TradePanel symbol={sym} info={info} ticker={tick} demo={demo} lev={lev} setLev={setLev} limitHint={limitHint} onOrder={handleOrder} onReset={handleReset}/>
            </div>
            {/* CENTER: Chart card */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0,borderRadius:12,border:"1px solid var(--border-subtle)",background:"var(--bg-surface)"}}>
              {ChartPanel}
            </div>
            {/* RIGHT: Book+Trades card */}
            <div style={{width:248,flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden",borderRadius:12,border:"1px solid var(--border-subtle)",background:"var(--bg-surface)"}}>
              {BookPanel}
            </div>
          </div>

          {/* ── Drag handle ── */}
          <div onMouseDown={()=>setDragging(true)}
            style={{height:7,cursor:"row-resize",flexShrink:0,display:"flex",alignItems:"center",padding:"0 8px"}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="var(--border-subtle)";}}
            onMouseLeave={e=>{if(!dragging)(e.currentTarget as HTMLElement).style.background="transparent";}}/>

          {/* ── Bottom card ── */}
          <div style={{height:bottomH,margin:"0 8px 8px",borderRadius:12,border:"1px solid var(--border-subtle)",background:"var(--bg-surface)",flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <Bottom demo={demo} tickers={tickers} onClose={handleClose} onCancel={handleCancel} onEditTPSL={handleEditTPSL} onLimitClose={handleLimitClose}/>
          </div>
        </>
      )}
    </div>
  );
}
