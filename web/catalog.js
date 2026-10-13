'use strict';
(function(root){
 const assets={
  BRENTOIL:{name:'Brent',coin:'xyz:BRENTOIL',link:'xyz:BRENTOIL'},
  WTIOIL:{name:'WTI',coin:'xyz:CL',link:'xyz:WTIOIL'},
  DIESEL:{name:'Diesel',coin:'xyz:HO',link:'xyz:DIESEL'},
  NATGAS:{name:'Natural Gas',coin:'xyz:NATGAS',link:'xyz:NATGAS'},
  BTC:{name:'BTC',coin:'BTC',link:'BTC'},
  MSTR:{name:'MSTR',coin:'xyz:MSTR',link:'xyz:MSTR'},
  GOLD:{name:'Gold',coin:'xyz:GOLD',link:'xyz:GOLD'},
  EURUSD:{name:'EUR/USD',coin:'xyz:EUR',link:'xyz:EURUSD'},
  SP500:{name:'S&P 500',coin:'xyz:SP500',link:'xyz:SP500'}
 };
 const api={assets,keys:Object.keys(assets),title:markets=>markets.map(m=>assets[m].name).join(' / ')};
 if(typeof module!=='undefined')module.exports=api;else root.OilCatalog=api;
})(globalThis);
