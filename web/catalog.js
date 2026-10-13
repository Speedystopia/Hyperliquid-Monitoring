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
  SP500:{name:'S&P 500',coin:'xyz:SP500',link:'xyz:SP500'},
  TLT:{name:'TLT',coin:'xyz:TLT',link:'xyz:TLT'},
  XYZ100:{name:'XYZ100',coin:'xyz:XYZ100',link:'xyz:XYZ100'},
  COPPER:{name:'Copper',coin:'xyz:COPPER',link:'xyz:COPPER'},
  USDJPY:{name:'USD/JPY',coin:'xyz:JPY',link:'xyz:USDJPY',unit:'JPY/USD',precision:3},
  ETH:{name:'ETH',coin:'ETH',link:'ETH'},
  SILVER:{name:'Silver',coin:'xyz:SILVER',link:'xyz:SILVER'}
 };
 const api={assets,keys:Object.keys(assets),title:markets=>markets.map(m=>assets[m].name).join(' / ')};
 if(typeof module!=='undefined')module.exports=api;else root.OilCatalog=api;
})(globalThis);
