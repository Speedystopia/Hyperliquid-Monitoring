'use strict';
// French source phrases; English default, with five additional translations.
const OilI18n=(()=>{
 const languages={en:1,fr:0,zh:2,ko:3,ja:4,it:5,es:6};
 const locales={en:'en-GB',fr:'fr-FR',zh:'zh-CN',ko:'ko-KR',ja:'ja-JP',it:'it-IT',es:'es-ES'};
 const rows=[
 ['Funding','Funding','资金费率','펀딩','資金調達率','Funding','Funding'],
 ['Intervalle','Interval','时间间隔','간격','間隔','Intervallo','Intervalo'],
 ['Funding Brent et WTI','Brent and WTI funding','布伦特与WTI资金费率','브렌트 및 WTI 펀딩','ブレントとWTIの資金調達率','Funding Brent e WTI','Funding Brent y WTI'],
 ['Clôtures Brent et WTI et niveaux des positions','Brent / WTI closes and position levels','布伦特与WTI收盘价及持仓水平','브렌트 / WTI 종가 및 포지션 수준','ブレントとWTIの終値とポジション水準','Chiusure Brent / WTI e livelli delle posizioni','Cierres Brent / WTI y niveles de posiciones'],
 ['Quatre courbes superposées avec deux axes','Four overlaid curves with two axes','四条曲线与双坐标轴','이중 축의 네 곡선','2軸で重ねた4本の曲線','Quattro curve sovrapposte con due assi','Cuatro curvas superpuestas con dos ejes'],
 ['positions','positions','持仓','포지션','ポジション','posizioni','posiciones'],
 ['funding','funding','资金费率','펀딩','資金調達率','funding','funding'],
 ['Code erreur','Error code','错误代码','오류 코드','エラーコード','Codice errore','Código de error'],
 ['Série','Series','序列','시리즈','系列','Serie','Serie'],
 ['Erreur de connexion','Connection error','连接错误','연결 오류','接続エラー','Errore di connessione','Error de conexión'],
 ['Observatoire','Monitor','监测面板','모니터','モニター','Monitor','Monitor'],
 ['Connexion au collecteur…','Connecting to collector…','正在连接采集程序…','수집기에 연결 중…','コレクターに接続中…','Connessione al raccoglitore…','Conectando con el recolector…'],
 ['Deux pétroles. Une vue d’ensemble.','Two oils. One complete view.','两种原油，一览全貌。','두 원유를 한눈에.','2つの原油を、ひと目で。','Due petroli. Una visione completa.','Dos petróleos. Una visión completa.'],
 ['Funding réalisé et clôtures du Brent et du WTI. Historique conservé sur votre ordinateur.','Realized funding and Brent / WTI closing prices. History stored on your computer.','布伦特与WTI的实际资金费率和收盘价。历史数据保存在您的电脑上。','브렌트와 WTI의 실현 펀딩 및 종가. 기록은 컴퓨터에 저장됩니다.','ブレントとWTIの確定資金調達率と終値。履歴はPCに保存されます。','Funding realizzato e chiusure Brent / WTI. Storico salvato sul computer.','Funding realizado y cierres Brent / WTI. Historial guardado en tu ordenador.'],
 ['↻ Synchroniser','↻ Sync now','↻ 立即同步','↻ 지금 동기화','↻ 今すぐ同期','↻ Sincronizza ora','↻ Sincronizar ahora'],
 ['Réinitialiser le zoom','Reset zoom','重置缩放','확대 초기화','ズームをリセット','Reimposta zoom','Restablecer zoom'],
 ['Tout l’historique','Full history','完整历史','전체 기록','全履歴','Storico completo','Historial completo'],
 ['Mon fuseau','My timezone','我的时区','내 시간대','ローカル時間帯','Il mio fuso','Mi zona horaria'],
 ['Collecte chaque heure à HH:01 · périodes alignées UTC','Auto sync at startup and every hour at HH:01 · UTC periods','启动时及每小时HH:01自动同步 · 周期按UTC对齐','시작 시 및 매시 01분 자동 동기화 · UTC 구간','起動時と毎時01分に自動同期 · UTC基準','Sync automatico all’avvio e ogni ora a HH:01 · periodi UTC','Sincronización al iniciar y cada hora a HH:01 · períodos UTC'],
 ['VOTRE COMPTE · LECTURE PUBLIQUE','YOUR ACCOUNT · PUBLIC READ ONLY','您的账户 · 公开只读','내 계정 · 공개 읽기 전용','アカウント · 公開データの読み取り','IL TUO CONTO · LETTURA PUBBLICA','TU CUENTA · LECTURA PÚBLICA'],
 ['Positions & funding perçu','Positions & funding received','持仓与已收资金费','포지션 및 수령 펀딩','ポジションと受取資金調達料','Posizioni e funding ricevuto','Posiciones y funding recibido'],
 ['Afficher les niveaux sur les prix','Show position levels on price charts','在价格图上显示持仓水平','가격 차트에 포지션 수준 표시','価格チャートにポジション水準を表示','Mostra livelli sui grafici dei prezzi','Mostrar niveles en gráficos de precio'],
 ['Adresse publique Hyperliquid','Public Hyperliquid address','Hyperliquid公开地址','Hyperliquid 공개 주소','Hyperliquid公開アドレス','Indirizzo pubblico Hyperliquid','Dirección pública Hyperliquid'],
 ['Scanner le compte','Scan account','扫描账户','계정 조회','アカウントを照会','Analizza conto','Escanear cuenta'],
 ['Effacer','Clear','清除','지우기','消去','Cancella','Borrar'],
 ['Compte principal et sous-comptes · actualisation chaque minute après le scan · aucune adresse enregistrée.','Main account and subaccounts · refresh every minute after scanning · address never saved.','主账户及子账户 · 扫描后每分钟更新 · 不保存地址。','주 계정 및 하위 계정 · 조회 후 매분 갱신 · 주소는 저장되지 않습니다.','メインとサブアカウント · 照会後は毎分更新 · アドレスは保存しません。','Conto principale e sottoconti · aggiornamento ogni minuto dopo la lettura · indirizzo non salvato.','Cuenta principal y subcuentas · actualización cada minuto tras el escaneo · dirección no guardada.'],
 ['01 / FLUX','01 / FLOWS','01 / 资金流','01 / 흐름','01 / 資金フロー','01 / FLUSSI','01 / FLUJOS'],
 ['02 / MARCHÉ','02 / MARKET','02 / 市场','02 / 시장','02 / 市場','02 / MERCATO','02 / MERCADO'],
 ['03 / COMPARAISON','03 / COMPARISON','03 / 对比','03 / 비교','03 / 比較','03 / CONFRONTO','03 / COMPARACIÓN'],
 ['Funding réalisé','Realized funding','实际资金费率','실현 펀딩','確定資金調達率','Funding realizzato','Funding realizado'],
 ['Prix de clôture','Closing prices','收盘价','종가','終値','Prezzi di chiusura','Precios de cierre'],
 ['% par période','% per period','每周期 %','구간별 %','期間あたり %','% per periodo','% por período'],
 ['Funding & prix superposés','Funding & prices overlaid','资金费率与价格叠加','펀딩 및 가격 겹쳐보기','資金調達率と価格の重ね合わせ','Funding e prezzi sovrapposti','Funding y precios superpuestos'],
 ['Gauche : funding % · Droite : prix USD','Left: funding % · Right: price USD','左轴：资金费率 % · 右轴：价格 USD','왼쪽: 펀딩 % · 오른쪽: 가격 USD','左：資金調達率 % · 右：価格 USD','Sinistra: funding % · Destra: prezzo USD','Izquierda: funding % · Derecha: precio USD'],
 ['Couverture des données & méthode','Data coverage & methodology','数据覆盖与计算方法','데이터 범위 및 계산 방법','データ範囲と計算方法','Copertura dati e metodo','Cobertura de datos y método'],
 ['Molette : zoom · Glisser : déplacer · Double-clic : réinitialiser','Scroll: zoom · Drag: pan · Double-click: reset','滚轮缩放 · 拖动平移 · 双击重置','휠: 확대 · 드래그: 이동 · 더블클릭: 초기화','ホイール：ズーム · ドラッグ：移動 · ダブルクリック：リセット','Rotella: zoom · Trascina: sposta · Doppio clic: reset','Rueda: zoom · Arrastrar: mover · Doble clic: restablecer'],
 ['Télécharger le JSON','Download JSON','下载JSON','JSON 다운로드','JSONをダウンロード','Scarica JSON','Descargar JSON'],
 ['Funding : somme des paiements horaires sur chaque période complète, sans annualisation. Prix : clôtures natives 4H et 1D. Les périodes incomplètes et les données absentes restent vides. Le funding d’un compte est un montant en USDC depuis l’ouverture de ses positions, distinct du taux de funding du marché.','Funding: sum of hourly rates over complete periods, without annualization. Prices: native 4H / 1D closes. Incomplete periods and missing data remain blank. Account funding is a USDC amount since position opening, separate from the market funding rate.','资金费率：完整周期内的小时费率之和，不年化。价格：原生4H/1D收盘价。不完整周期及缺失数据留空。账户资金费以USDC计，自持仓建立起计算，与市场费率不同。','펀딩: 완전한 구간의 시간별 비율 합계이며 연환산하지 않습니다. 가격: 원본 4H/1D 종가. 불완전한 구간과 누락 데이터는 비워 둡니다. 계정 펀딩은 포지션 개시 이후의 USDC 금액이며 시장 비율과 다릅니다.','資金調達率は完全な期間の時間別率の合計で、年率換算はしません。価格は4H/1Dの確定終値です。不完全な期間や欠損は空白とします。アカウントの資金調達料はポジション開始以降のUSDC額で、市場の率とは別です。','Funding: somma dei tassi orari nei periodi completi, senza annualizzazione. Prezzi: chiusure native 4H/1D. Periodi incompleti e dati mancanti restano vuoti. Il funding del conto è un importo USDC dall’apertura, distinto dal tasso di mercato.','Funding: suma de tasas horarias de períodos completos, sin anualizar. Precios: cierres nativos 4H/1D. Períodos incompletos y datos ausentes quedan vacíos. El funding de la cuenta es un importe USDC desde la apertura, distinto de la tasa de mercado.'],
 ['Les dates correspondent à la fin des périodes. Pour les positions, l’entrée moyenne est pondérée par la taille absolue. Une liquidation moyenne est seulement indicative : les seuils réels de chaque sous-compte sont affichés séparément. Les niveaux actuels s’étendent sur tout le graphique à titre de repère, sans représenter l’historique de la position.','Dates are period ends. Average entry is weighted by absolute position size. Average liquidation is indicative only; actual subaccount thresholds are shown separately. Current levels extend across the chart as references and do not represent position history.','日期为周期结束时间。平均入场价按持仓绝对规模加权。平均清算价仅供参考；各子账户实际阈值单独显示。当前水平横贯图表作为参考，不代表持仓历史。','날짜는 구간 종료 시각입니다. 평균 진입가는 포지션 절대 크기로 가중합니다. 평균 청산가는 참고값이며 각 하위 계정의 실제 기준은 따로 표시됩니다. 현재 수준은 참고선이며 포지션 기록이 아닙니다.','日時は期間終了時刻です。平均建値はポジション数量の絶対値で加重します。平均清算価格は参考値で、各サブアカウントの実際の水準は個別に表示します。現在の水準は参考線であり、ポジション履歴を表しません。','Le date sono le fini dei periodi. L’ingresso medio è ponderato per la dimensione assoluta. La liquidazione media è solo indicativa; le soglie reali dei sottoconti sono separate. I livelli attuali sono riferimenti, non lo storico della posizione.','Las fechas son fines de período. La entrada media se pondera por el tamaño absoluto. La liquidación media es solo indicativa; se muestran los umbrales reales por subcuenta. Los niveles actuales son referencias, no el historial de la posición.'],
 ['Corrélation des prix Brent / WTI','Brent / WTI price correlation','布伦特 / WTI价格相关性','브렌트 / WTI 가격 상관관계','ブレント / WTI価格相関','Correlazione prezzi Brent / WTI','Correlación de precios Brent / WTI'],
 ['funding annualisé réalisé','realized funding annualized','实际资金费率年化','실현 펀딩 연환산','実績資金調達率の年率換算','funding realizzato annualizzato','funding realizado anualizado'],
 ['Funding cumulé sur 12 mois','Funding sum over 12 months','12个月资金费率累计','12개월 펀딩 누계','12か月の資金調達率累計','Funding cumulato su 12 mesi','Funding acumulado de 12 meses'],
 ['historique partiel','partial history','历史不满一年','일부 기록','1年未満の履歴','storico parziale','historial parcial'],
 ['Cumul total','Total cumulative funding','资金费率总累计','전체 펀딩 누계','資金調達率の全累計','Funding cumulato totale','Funding acumulado total'],
 ['Moyenne des','Average of','平均值：','평균:','平均：','Media di','Media de'],
 ['paiements horaires','hourly payments','小时支付','시간별 지급','時間別支払','pagamenti orari','pagos horarios'],
 ['jours observés','days observed','已观测天数','관측 일수','観測日数','giorni osservati','días observados'],
 ['Pearson sur tout l’historique commun','Pearson over full shared history','完整共同历史的皮尔逊相关','전체 공통 기록의 피어슨 상관','共通する全履歴のピアソン相関','Pearson sullo storico comune completo','Pearson del historial común completo'],
 ['clôtures appariées','matched closes','匹配收盘数据','일치하는 종가','対応する終値','chiusure abbinate','cierres coincidentes'],
 ['−100 % : inverse · 0 % : linéaire nulle · +100 % : même sens','−100%: inverse · 0%: no linear relation · +100%: same direction','−100%：反向 · 0%：无线性关系 · +100%：同向','−100%: 반대 · 0%: 선형 관계 없음 · +100%: 같은 방향','−100%：逆方向 · 0%：線形関係なし · +100%：同方向','−100%: inversa · 0%: nessuna relazione lineare · +100%: stessa direzione','−100%: inversa · 0%: sin relación lineal · +100%: mismo sentido'],
 ['Entrée moyenne pondérée','Weighted average entry','加权平均入场价','가중 평균 진입가','加重平均建値','Ingresso medio ponderato','Entrada media ponderada'],
 ['Liquidation moyenne indicative','Indicative average liquidation','清算价加权平均（仅供参考）','참고용 평균 청산가','参考加重平均清算価格','Liquidazione media indicativa','Liquidación media indicativa'],
 ['Funding net depuis ouverture','Net funding since opening','建仓后净资金费','개시 이후 순 펀딩','開始以降の純資金調達料','Funding netto dall’apertura','Funding neto desde apertura'],
 ['+ reçu / − payé','+ received / − paid','+ 收到 / − 支付','+ 수령 / − 지급','+ 受取 / − 支払','+ ricevuto / − pagato','+ recibido / − pagado'],
 ['certains seuils de liquidation indisponibles','some liquidation levels unavailable','部分清算阈值不可用','일부 청산 수준 없음','一部の清算水準は不明','alcune soglie di liquidazione non disponibili','algunos umbrales de liquidación no disponibles'],
 ['Aucune position ouverte sur ce marché.','No open position in this market.','该市场无未平仓持仓。','이 시장에 열린 포지션이 없습니다.','この市場に未決済ポジションはありません。','Nessuna posizione aperta su questo mercato.','No hay posiciones abiertas en este mercado.'],
 ['Aucune donnée','No data','无数据','데이터 없음','データなし','Nessun dato','Sin datos'],
 ['Période complète indisponible','No complete period available','无完整周期数据','완전한 구간 없음','完全な期間がありません','Nessun periodo completo disponibile','Sin período completo disponible'],
 ['Lecture du compte et des sous-comptes en cours…','Reading account and subaccounts…','正在读取账户及子账户…','계정 및 하위 계정 조회 중…','アカウントとサブアカウントを照会中…','Lettura del conto e dei sottoconti…','Leyendo cuenta y subcuentas…'],
 ['Saisissez une adresse publique valide : 0x suivi de 40 caractères hexadécimaux.','Enter a valid public address: 0x followed by 40 hexadecimal characters.','请输入有效公开地址：0x后跟40位十六进制字符。','올바른 공개 주소를 입력하세요: 0x 뒤에 40자리 16진수.','有効な公開アドレスを入力してください：0xと40桁の16進数。','Inserisci un indirizzo pubblico valido: 0x seguito da 40 caratteri esadecimali.','Introduce una dirección pública válida: 0x y 40 caracteres hexadecimales.'],
 ['Adresse effacée. Aucune adresse enregistrée.','Address cleared. No address saved.','地址已清除，未保存任何地址。','주소를 지웠습니다. 저장된 주소는 없습니다.','アドレスを消去しました。保存されたアドレスはありません。','Indirizzo cancellato. Nessun indirizzo salvato.','Dirección borrada. No se ha guardado ninguna dirección.'],
 ['Collecteur actif · prochain passage à HH:01','Auto collector active · next run at HH:01','自动采集已启用 · 下次HH:01','자동 수집 활성 · 다음 실행 매시 01분','自動収集稼働中 · 次回は毎時01分','Raccolta automatica attiva · prossimo passaggio HH:01','Recolección automática activa · próxima ejecución HH:01'],
 ['Collecte incomplète · nouvelle tentative sous 5 min','Collection failed / incomplete · retry within 5 min','采集失败或未完成 · 5分钟内重试','수집 실패 / 미완료 · 5분 내 재시도','収集失敗または未完了 · 5分以内に再試行','Raccolta fallita / incompleta · nuovo tentativo entro 5 min','Recolección fallida / incompleta · reintento en 5 min'],
 ['Collecteur inaccessible · données affichées conservées','Collector unavailable · displayed data retained','采集程序不可用 · 保留已显示数据','수집기 연결 불가 · 표시 데이터 유지','コレクターに接続不可 · 表示データは保持','Raccoglitore non disponibile · dati visualizzati conservati','Recolector no disponible · datos mostrados conservados'],
 ['En attente du premier JSON…','Waiting for the first JSON…','等待首个JSON…','첫 JSON 대기 중…','最初のJSONを待機中…','In attesa del primo JSON…','Esperando el primer JSON…'],
 ['Synchronisation demandée…','Sync requested…','已请求同步…','동기화 요청됨…','同期を要求しました…','Sync richiesta…','Sincronización solicitada…'],
 ['Collecte demandée…','Collection queued…','采集已排队…','수집 대기 중…','収集待ち…','Raccolta in coda…','Recolección en cola…'],
 ['Collecte en cours…','Collecting data…','正在采集数据…','데이터 수집 중…','データ収集中…','Raccolta in corso…','Recopilando datos…'],
 ['Dernière collecte','Last collection','上次采集','최근 수집','最終収集','Ultima raccolta','Última recolección'],
 ['L’historique apparaîtra après la collecte.','History will appear after collection.','采集后将显示历史数据。','수집 후 기록이 표시됩니다.','収集後に履歴が表示されます。','Lo storico apparirà dopo la raccolta.','El historial aparecerá tras la recolección.'],
 ['Première fin de période','First period end','首个周期结束','첫 구간 종료','最初の期間終了','Prima fine periodo','Primer fin de período'],
 ['les prix 4H atteignent le début du funding','4H prices reach the start of funding history','4H价格覆盖资金费率历史起点','4H 가격이 펀딩 기록 시작까지 포함','4H価格は資金調達率履歴の開始をカバー','i prezzi 4H coprono l’inizio del funding','los precios 4H cubren el inicio del funding'],
 ['début des prix 4H postérieur au funding, historique plus ancien indisponible à cette granularité','4H prices start after funding; earlier history unavailable at this granularity','4H价格历史晚于资金费率，此粒度下更早历史不可用','4H 가격이 펀딩보다 늦게 시작하며 이전 기록은 이 구간에서 제공되지 않습니다','4H価格は資金調達率より後に開始し、この粒度では以前の履歴は取得不可','i prezzi 4H iniziano dopo il funding; lo storico precedente non è disponibile','los precios 4H empiezan después del funding; no hay historial anterior con esta granularidad'],
 ['Liste des sous-comptes indisponible : resultats partiels','Subaccount list unavailable: partial results','子账户列表不可用：结果不完整','하위 계정 목록 없음: 일부 결과','サブアカウント一覧取得不可：部分的な結果','Elenco sottoconti non disponibile: risultati parziali','Lista de subcuentas no disponible: resultados parciales'],
 ['Lecture du compte principal impossible','Unable to read main account','无法读取主账户','주 계정을 읽을 수 없음','メインアカウントの読み取り不可','Impossibile leggere il conto principale','No se puede leer la cuenta principal'],
 ['Un sous-compte est indisponible : resultats partiels','A subaccount is unavailable: partial results','部分子账户不可用：结果不完整','하위 계정 읽기 불가: 일부 결과','サブアカウント取得不可：部分的な結果','Un sottoconto non disponibile: risultati parziali','Subcuenta no disponible: resultados parciales'],
 ['Limite de 100 sous-comptes atteinte','100-subaccount limit reached','已达100个子账户上限','하위 계정 100개 한도 도달','サブアカウント100件の上限','Raggiunto limite di 100 sottoconti','Límite de 100 subcuentas alcanzado'],
 ['compte(s) consulté(s)','account(s) checked','已查询账户','조회한 계정','照会済みアカウント','conti consultati','cuentas consultadas'],
 ['adresse non enregistrée','address not saved','地址未保存','주소 미저장','アドレス保存なし','indirizzo non salvato','dirección no guardada'],
 ['entrée moy.','avg. entry','平均入场','평균 진입','平均建値','ingresso medio','entrada media'],
 ['liq. moyenne indicative','indicative avg. liq.','清算均值（参考）','참고 평균 청산','参考平均清算','liq. media indicativa','liq. media indicativa'],
 ['zéro funding','zero funding','零资金费率','펀딩 0','資金調達率ゼロ','funding zero','funding cero'],
 ['Funding source 1H','1H source funding','1H源资金费率','1H 원본 펀딩','1H元資金調達率','Funding sorgente 1H','Funding fuente 1H'],
 ['Clôtures 4H','4H closes','4H收盘价','4H 종가','4H終値','Chiusure 4H','Cierres 4H'],
 ['Clôtures 1D','1D closes','1D收盘价','1D 종가','1D終値','Chiusure 1D','Cierres 1D'],
 ['Compte principal','Main account','主账户','주 계정','メインアカウント','Conto principale','Cuenta principal'],
 ['Sous-compte','Subaccount','子账户','하위 계정','サブアカウント','Sottoconto','Subcuenta'],
 ['Funding net USDC','Net funding USDC','净资金费USDC','순 펀딩 USDC','純資金調達料USDC','Funding netto USDC','Funding neto USDC'],
 ['Liquidation USD','Liquidation USD','清算价USD','청산가 USD','清算価格USD','Liquidazione USD','Liquidación USD'],
 ['Entrée USD','Entry USD','入场价USD','진입가 USD','建値USD','Ingresso USD','Entrada USD'],
 ['en attente','pending','等待中','대기 중','待機中','in attesa','pendiente'],
 ['actualisé','updated','更新时间','갱신','更新','aggiornato','actualizado'],
 ['Échec du scan','Scan failed','扫描失败','조회 실패','照会失敗','Lettura fallita','Escaneo fallido'],
 ['Indisponible','Unavailable','不可用','제공 안 됨','取得不可','Non disponibile','No disponible'],
 ['Manquantes','Missing','缺失','누락','欠損','Mancanti','Ausentes'],
 ['Manquant','Missing','缺失','누락','欠損','Mancante','Ausente'],
 ['Observations','Observations','观测值','관측값','観測値','Osservazioni','Observaciones'],
 ['Dernière','Latest','最新','최신','最新','Ultima','Última'],
 ['Chargement…','Loading…','加载中…','로딩 중…','読み込み中…','Caricamento…','Cargando…'],
 ['Période','Period','周期','기간','期間','Periodo','Período'],
 ['Horaires','Timezone','时区','시간대','時間帯','Fuso orario','Zona horaria'],
 ['Marché','Market','市场','시장','市場','Mercato','Mercado'],
 ['Compte','Account','账户','계정','アカウント','Conto','Cuenta'],
 ['Entrée','Entry','入场价','진입','建値','Ingresso','Entrada'],
 ['Liquidation','Liquidation','清算价','청산','清算','Liquidazione','Liquidación'],
 ['clôture','close','收盘','종가','終値','chiusura','cierre'],
 ['daily','daily','日线','일별','日次','giornaliera','diario'],
 ['Daily','Daily','日线','일별','日次','Giornaliero','Diario'],
 ['Position','Position','持仓','포지션','ポジション','Posizione','Posición'],
 ['position','position','持仓','포지션','ポジション','posizione','posición'],
 ['jours','days','天','일','日','giorni','días'],
 ['Long','Long','多头','롱','ロング','Long','Largo'],
 ['Short','Short','空头','숏','ショート','Short','Corto'],
 ['Prix','Price','价格','가격','価格','Prezzo','Precio'],
 ['entrée','entry','入场','진입','建値','ingresso','entrada'],
 ['liq.','liq.','清算','청산','清算','liq.','liq.'],
 ['% / an','% / year','% / 年','% / 년','% / 年','% / anno','% / año']
 ];
 rows.sort((a,b)=>b[0].length-a[0].length);
 let lang='en';try{const stored=localStorage.getItem('oil-language');if(stored in languages)lang=stored;}catch{}
 function translate(text){if(lang==='fr')return String(text);let source=String(text),parts=[],cursor=0;
  // One pass: longest matches; translated output is never translated again.
  while(cursor<source.length){let next=source.length,row=null;for(const r of rows){const at=source.indexOf(r[0],cursor);if(at>=0&&(at<next||at===next&&(!row||r[0].length>row[0].length))){next=at;row=r;}}
   if(!row){parts.push(source.slice(cursor));break;}parts.push(source.slice(cursor,next),row[languages[lang]]);cursor=next+row[0].length;
  }return parts.join('');
 }
 const nodes=[],attrs=[];
 function setup(){const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
  while(n=walker.nextNode()){if(!n.parentElement.closest('script,#language'))nodes.push([n,n.textContent]);}
  document.querySelectorAll('[placeholder],[aria-label]').forEach(el=>{for(const key of ['placeholder','aria-label'])if(el.hasAttribute(key))attrs.push([el,key,el.getAttribute(key)]);});
  apply();document.querySelector('#language').value=lang;
 }
 function apply(){for(const [n,text] of nodes)n.textContent=translate(text);for(const [el,key,text] of attrs)el.setAttribute(key,translate(text));document.documentElement.lang=lang;}
 function set(value){lang=value in languages?value:'en';try{localStorage.setItem('oil-language',lang);}catch{}apply();}
 function tree(el){const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())if(!n.parentElement.closest('[data-i18n-ignore]'))n.textContent=translate(n.textContent);}
 return {translate,tree,setup,set,get lang(){return lang;},get locale(){return locales[lang];}};
})();
OilI18n.setup();
