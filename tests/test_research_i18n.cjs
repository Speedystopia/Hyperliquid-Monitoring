'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const web=path.join(__dirname,'../web'),research=fs.readFileSync(path.join(web,'research.js'),'utf8'),html=fs.readFileSync(path.join(web,'index.html'),'utf8');
const phrases=new Set(),strings=expression=>[...expression.matchAll(/'((?:\\.|[^'\\])*)'/g)].map(m=>m[1].replace(/\\'/g,"'"));
for(const block of research.matchAll(/(?:const labels=|Object\.assign\(labels,)\{([^}]+)\}/g))for(const phrase of strings(block[1]))phrases.add(phrase);
// Extract literals inside every L(...) call, including ternaries and array labels.
for(const call of research.matchAll(/\bL\(/g)){
 let depth=1,quote='',escaped=false,end=call.index+2;
 for(;end<research.length&&depth;end++){
  const ch=research[end];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';}
  else if(ch==="'"||ch==='"')quote=ch;else if(ch==='(')depth++;else if(ch===')')depth--;
 }
 for(const phrase of strings(research.slice(call.index+2,end-1)))phrases.add(phrase);
}
for(const call of research.matchAll(/\bmetric\('([^']+)'/g))phrases.add(call[1]);
for(const section of [html.slice(html.indexOf('<h3>Prix Hyperliquid et sens du funding'),html.indexOf('<div id="pair-view">')),html.slice(html.indexOf('id="research-panel"'),html.indexOf('<footer>'))])for(const text of section.matchAll(/>([^<>]+)</g)){const phrase=text[1].trim();if(phrase&&!/^\d+$/.test(phrase))phrases.add(phrase);}
phrases.delete('an'); // The existing complete unit "% / an" is used by the root UI.
for(const key of ['adaptive','calendar'])phrases.delete(key); // Internal mode keys, not translated UI labels.
const source=fs.readFileSync(path.join(web,'i18n.js'),'utf8').replace('return {translate,tree,setup,set,','globalThis.translationRows=rows;return {translate,tree,setup,set,').replace('OilI18n.setup();','globalThis.i18n=OilI18n;');
const context={document:{documentElement:{}},localStorage:{getItem:()=>null,setItem(){}}};vm.createContext(context);vm.runInContext(source,context);
const rows=new Map(context.translationRows.map(r=>[r[0],r]));
for(const phrase of phrases){
 const row=rows.get(phrase);assert.ok(row,`Missing exact translation row: ${phrase}`);assert.equal(row.length,7,`Seven languages required: ${phrase}`);
 for(const [language,index] of Object.entries({fr:0,en:1,zh:2,ko:3,ja:4,it:5,es:6})){context.i18n.set(language);const translated=context.i18n.translate(phrase);assert.ok(translated.trim(),`${language}: ${phrase}`);assert.equal(translated,row[index],`${language}: ${phrase}`);}
}
context.i18n.set('en');assert.equal(context.i18n.translate('Houston'),'Houston');assert.equal(context.i18n.translate('ou'),'or');
console.log(`Research: ${phrases.size} exact labels, warnings, assumptions and external-source messages translated in all seven languages; short conjunction cannot corrupt words`);
