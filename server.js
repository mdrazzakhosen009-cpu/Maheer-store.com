const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const env = n => String(process.env[n] || '').trim();
if (!env('TURSO_DATABASE_URL') || !env('TURSO_AUTH_TOKEN')) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.'); process.exit(1);
}
const db = createClient({ url: env('TURSO_DATABASE_URL'), authToken: env('TURSO_AUTH_TOKEN') });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } });
const sessions = new Map();
const chatSessions = new Map();
const appCache = { settings: null, settingsAt: 0, products: null, productsAt: 0 };
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ extended: true, limit: '16mb' }));
app.use('/api', (req,res,next)=>{res.set('Cache-Control','no-store');next();});
const now=()=>new Date().toISOString();
const sha256=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const token=()=>crypto.randomBytes(32).toString('hex');
async function exec(sql,args=[]){return db.execute({sql,args});}
async function one(sql,args=[]){const r=await exec(sql,args);return r.rows[0]||null;}
async function many(sql,args=[]){const r=await exec(sql,args);return r.rows;}
function bust(){appCache.settings=null;appCache.products=null;}
async function getSettings(){if(appCache.settings&&Date.now()-appCache.settingsAt<15000)return appCache.settings;const r=await many('SELECT key,value FROM settings');appCache.settings=Object.fromEntries(r.map(x=>[x.key,x.value]));appCache.settingsAt=Date.now();return appCache.settings;}
async function getProducts(){if(appCache.products&&Date.now()-appCache.productsAt<10000)return appCache.products;appCache.products=await many('SELECT * FROM products ORDER BY featured DESC,is_new DESC,id DESC');appCache.productsAt=Date.now();return appCache.products;}
function requireAdmin(req,res,next){const t=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();if(!t||!sessions.has(t))return res.status(401).json({error:'অ্যাডমিন সেশন শেষ হয়েছে। আবার লগইন করুন।'});next();}
function imageData(file){if(!file||!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))throw Error('JPG, PNG, WEBP বা GIF ছবি দিন।');return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;}

async function initDatabase(){
  await exec(`CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY,password_hash TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,price REAL NOT NULL DEFAULT 0,old_price REAL NOT NULL DEFAULT 0,category TEXT NOT NULL DEFAULT 'স্কিন কেয়ার',tags TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',image TEXT NOT NULL DEFAULT '',featured INTEGER NOT NULL DEFAULT 0,is_new INTEGER NOT NULL DEFAULT 1,stock INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS agents(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',whatsapp TEXT NOT NULL DEFAULT '',messenger TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_code TEXT UNIQUE NOT NULL,customer_name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,items_json TEXT NOT NULL,subtotal REAL NOT NULL,delivery_fee REAL NOT NULL DEFAULT 0,total REAL NOT NULL,payment_method TEXT NOT NULL DEFAULT 'COD',transaction_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Pending',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  if(!await one('SELECT id FROM admins WHERE id=1')){const p=env('ADMIN_PASSWORD');if(!p)throw new Error('ADMIN_PASSWORD is required on first startup.');await exec('INSERT INTO admins(id,password_hash,created_at,updated_at) VALUES(1,?,?,?)',[sha256(p),now(),now()]);}
  const defaults={
    store_name:'MAHEER STORE',site_language:'bn',store_tagline:'প্রিমিয়াম স্কিন কেয়ার সংগ্রহ',
    about_store:'মাহীর স্টোরে আপনাদের স্বাগতম। আমাদের এখানে সব ধরনের স্কিন কেয়ার প্রোডাক্ট বিক্রি করা হয়। যে কোনো ধরনের তথ্যের জন্য এজেন্টের সাথে যোগাযোগ করুন।',
    store_info:'মাহীর স্টোরে মানসম্মত ও বাছাই করা স্কিন কেয়ার প্রোডাক্ট পাওয়া যায়।',
    delivery_time:'ঢাকার ভিতরে ১–২ দিন, ঢাকার বাইরে ২–৪ দিন।',delivery_fee:'80',
    bkash_number:'',nagad_number:'',rocket_number:'',cod_enabled:'true',
    whatsapp_link:'',instagram_link:'',tiktok_link:'',facebook_link:'',
    chatbot_delivery:'আমাদের ডেলিভারি সাধারণত ঢাকার ভিতরে ১–২ দিন এবং ঢাকার বাইরে ২–৪ দিন।',
    chatbot_store:'মাহীর স্টোরে বিভিন্ন ধরনের স্কিন কেয়ার প্রোডাক্ট বিক্রি করা হয়।',
    chatbot_agent:'যে কোনো তথ্যের জন্য এআই-এর পরিবর্তে আমাদের এজেন্টের সাথে যোগাযোগ করুন।'
  };
  for(const[k,v]of Object.entries(defaults))if(!await one('SELECT key FROM settings WHERE key=?',[k]))await exec('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)',[k,String(v),now()]);
  const demo=[
    ['হাইড্রেটিং ফেস ময়েশ্চারাইজার',890,1190,'ময়েশ্চারাইজার','ময়েশ্চারাইজার, হাইড্রেশন','ত্বককে কোমল ও ময়েশ্চারাইজড রাখতে দৈনন্দিন ব্যবহারের জন্য।',1,1,25],
    ['ভিটামিন সি ফেস সিরাম',1250,1590,'সিরাম','ভিটামিন সি, সিরাম, উজ্জ্বলতা','দৈনন্দিন স্কিন কেয়ার রুটিনের জন্য জনপ্রিয় সিরাম।',1,1,20],
    ['সানস্ক্রিন এসপিএফ ৫০',990,1290,'সানস্ক্রিন','সানস্ক্রিন, SPF 50, রোদ','রোদে বের হওয়ার সময় ত্বকের যত্নের জন্য।',1,0,30],
    ['জেন্টল ফেসওয়াশ',650,820,'ফেসওয়াশ','ফেসওয়াশ, ক্লিনজিং','ত্বক পরিষ্কার করার জন্য কোমল ফেসওয়াশ।',1,0,35],
    ['নিয়াসিনামাইড সিরাম',1100,1450,'সিরাম','নিয়াসিনামাইড, সিরাম','সহজ দৈনন্দিন স্কিন কেয়ার রুটিনের জন্য।',1,1,18],
    ['লিপ কেয়ার বাম',390,490,'লিপ কেয়ার','লিপ বাম, ঠোঁট','ঠোঁটকে নরম ও যত্নে রাখতে ব্যবহারযোগ্য।',0,1,40],
    ['অ্যালোভেরা জেল',520,690,'জেল','অ্যালোভেরা, জেল, ত্বক','ত্বককে সতেজ রাখতে হালকা জেল।',1,1,28],
    ['রেটিনল নাইট ক্রিম',1450,1790,'নাইট ক্রিম','নাইট ক্রিম, রেটিনল','রাতের স্কিন কেয়ার রুটিনের জন্য সমৃদ্ধ ক্রিম।',1,0,16],
    ['হায়ালুরোনিক অ্যাসিড সিরাম',1350,1690,'সিরাম','হায়ালুরোনিক, হাইড্রেশন','ত্বকের আর্দ্রতা ধরে রাখতে দৈনন্দিন ব্যবহারের সিরাম।',1,1,22],
    ['চারকোল ক্লিনজিং মাস্ক',780,990,'ফেস মাস্ক','চারকোল, ক্লিনজিং, মাস্ক','গভীরভাবে পরিষ্কার করার জন্য চারকোল ফেস মাস্ক।',0,0,19],
    ['আই ক্রিম',950,1250,'আই কেয়ার','আই ক্রিম, চোখের যত্ন','চোখের চারপাশের ত্বকের জন্য কোমল যত্ন।',0,1,15],
    ['গ্লো ফেস টোনার',850,1090,'টোনার','টোনার, গ্লো, স্কিন কেয়ার','স্কিন কেয়ার রুটিনের জন্য সতেজ টোনার।',0,1,24]
  ];
  const fallback=['#f7e8e8','#eef2ed','#f4eee4','#eee9f2','#f9efdd','#f1e8e4','#e8f2eb','#eee8e8','#e8eff1','#e8e6e0','#eee8ef','#f2eee7'];
  for(let i=0;i<demo.length;i++){
    const d=demo[i];const existing=await one('SELECT id,image FROM products WHERE name=?',[d[0]]);
    if(!existing){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="${fallback[i]}"/><circle cx="400" cy="330" r="170" fill="#ffffff" opacity=".75"/><rect x="290" y="220" width="220" height="360" rx="44" fill="#fff" stroke="#d8c9c2" stroke-width="4"/><rect x="340" y="155" width="120" height="85" rx="18" fill="#d2b09a"/><text x="400" y="385" text-anchor="middle" font-family="Georgia" font-size="28" fill="#222">MAHEER</text><text x="400" y="425" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#9a775d">${d[3]}</text></svg>`;const image='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');await exec('INSERT INTO products(name,price,old_price,category,tags,description,image,featured,is_new,stock,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[d[0],d[1],d[2],d[3],d[4],d[5],image,d[6],d[7],d[8],now(),now()]);}
  }
  if(!await one('SELECT id FROM agents LIMIT 1'))await exec('INSERT INTO agents(name,phone,whatsapp,messenger,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',['মাহীর কাস্টমার কেয়ার','01700000000','8801700000000','',1,now(),now()]);
}

app.get('/api/health',async(req,res)=>{try{await one('SELECT 1');res.json({ok:true,database:'turso'});}catch(e){res.status(500).json({ok:false,error:'Turso connection failed'});}});
app.get('/api/settings',async(req,res)=>{try{res.json(await getSettings());}catch(e){res.status(500).json({error:'সেটিংস লোড করা যায়নি।'});}});
app.get('/api/products',async(req,res)=>{try{const all=await getProducts();const q=String(req.query.search||'').trim().toLowerCase(),cat=String(req.query.category||'').trim();let out=all;if(q)out=out.filter(p=>`${p.name} ${p.category} ${p.tags} ${p.description}`.toLowerCase().includes(q));if(cat)out=out.filter(p=>p.category===cat);res.json(out);}catch(e){res.status(500).json({error:'পণ্য লোড করা যায়নি।'});}});
app.get('/api/agents',async(req,res)=>{try{res.json(await many('SELECT * FROM agents WHERE active=1 ORDER BY id DESC'));}catch(e){res.status(500).json({error:'এজেন্ট লোড করা যায়নি।'});}});

async function createOrder(body){
  const items=Array.isArray(body.items)?body.items:[];if(!body.customer_name||!body.phone||!body.address||!items.length)throw Error('নাম, মোবাইল, ঠিকানা এবং কমপক্ষে একটি পণ্য লাগবে।');
  const ids=[...new Set(items.map(x=>Number(x.id)).filter(Number.isInteger))];if(!ids.length)throw Error('সঠিক পণ্য নির্বাচন করুন।');
  const products=await many(`SELECT * FROM products WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);const map=new Map(products.map(p=>[Number(p.id),p]));
  const clean=items.map(x=>{const p=map.get(Number(x.id));if(!p)return null;const qty=Math.max(1,Math.min(9999,Number(x.qty||1)));return{id:Number(p.id),name:p.name,price:Number(p.price),qty,image:p.image||''};}).filter(Boolean);if(!clean.length)throw Error('নির্বাচিত পণ্যটি আর পাওয়া যাচ্ছে না।');
  const cfg=await getSettings(),method=String(body.payment_method||'COD');if(!['COD','bKash','Nagad','Rocket'].includes(method))throw Error('সঠিক পেমেন্ট পদ্ধতি নির্বাচন করুন।');if(method==='COD'&&cfg.cod_enabled!=='true')throw Error('ক্যাশ অন ডেলিভারি বন্ধ আছে।');if(method!=='COD'&&!String(body.transaction_id||'').trim())throw Error('অনলাইন পেমেন্টের ট্রানজ্যাকশন আইডি দিন।');
  const subtotal=clean.reduce((s,x)=>s+x.price*x.qty,0),delivery=Number(String(cfg.delivery_fee||'0').replace(/[^0-9.]/g,''))||0,total=subtotal+delivery;
  const n=Number((await one('SELECT COALESCE(MAX(id),0)+1 n FROM orders')).n),code=`MAH-${String(n).padStart(6,'0')}`;
  await exec('INSERT INTO orders(order_code,customer_name,phone,address,items_json,subtotal,delivery_fee,total,payment_method,transaction_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[code,String(body.customer_name).trim(),String(body.phone).trim(),String(body.address).trim(),JSON.stringify(clean),subtotal,delivery,total,method,String(body.transaction_id||'').trim(),'Pending',now(),now()]);
  return{order_id:code,total,delivery_fee:delivery};
}
app.post('/api/orders',async(req,res)=>{try{res.json({ok:true,...await createOrder(req.body||{})});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/orders/:code',async(req,res)=>{try{const o=await one('SELECT * FROM orders WHERE order_code=?',[String(req.params.code).toUpperCase()]);if(!o)return res.status(404).json({error:'অর্ডার পাওয়া যায়নি।'});o.items=JSON.parse(o.items_json);delete o.items_json;res.json(o);}catch(e){res.status(500).json({error:'অর্ডার লোড করা যায়নি।'});}});

app.post('/api/admin/login',async(req,res)=>{try{const a=await one('SELECT password_hash FROM admins WHERE id=1');if(!a||sha256(req.body.password||'')!==a.password_hash)return res.status(401).json({error:'পাসওয়ার্ড সঠিক নয়।'});const t=token();sessions.set(t,Date.now());res.json({ok:true,token:t});}catch(e){res.status(500).json({error:'লগইন করা যায়নি।'});}});
app.post('/api/admin/logout',requireAdmin,(req,res)=>{const t=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();sessions.delete(t);res.json({ok:true});});
app.post('/api/admin/password',requireAdmin,async(req,res)=>{try{const a=await one('SELECT password_hash FROM admins WHERE id=1');if(sha256(req.body.old_password||'')!==a.password_hash)return res.status(401).json({error:'বর্তমান পাসওয়ার্ড সঠিক নয়।'});const n=String(req.body.new_password||'');if(n.length<6)return res.status(400).json({error:'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'});await exec('UPDATE admins SET password_hash=?,updated_at=? WHERE id=1',[sha256(n),now()]);sessions.clear();res.json({ok:true});}catch(e){res.status(500).json({error:'পাসওয়ার্ড পরিবর্তন করা যায়নি।'});}});
app.get('/api/admin/dashboard',requireAdmin,async(req,res)=>{try{const [o,p,a,r,c]=await Promise.all([one('SELECT COUNT(*) c FROM orders'),one('SELECT COUNT(*) c FROM products'),one('SELECT COUNT(*) c FROM agents'),one("SELECT COALESCE(SUM(total),0) revenue FROM orders WHERE status!='Cancelled'"),one('SELECT COUNT(DISTINCT phone) c FROM orders')]);res.json({orders:Number(o.c),products:Number(p.c),agents:Number(a.c),customers:Number(c.c),revenue:Number(r.revenue)});}catch(e){res.status(500).json({error:'ড্যাশবোর্ড লোড করা যায়নি।'});}});
app.get('/api/admin/orders',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM orders ORDER BY id DESC'));}catch(e){res.status(500).json({error:'অর্ডার লোড করা যায়নি।'});}});
app.patch('/api/admin/orders/:id',requireAdmin,async(req,res)=>{try{const allowed=['Pending','Confirmed','Shipped','Delivered','Cancelled'];const s=allowed.includes(req.body.status)?req.body.status:'Pending';await exec('UPDATE orders SET status=?,updated_at=? WHERE id=?',[s,now(),Number(req.params.id)]);res.json({ok:true});}catch(e){res.status(500).json({error:'অর্ডার আপডেট করা যায়নি।'});}});
app.get('/api/admin/products',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM products ORDER BY id DESC'));}catch(e){res.status(500).json({error:'পণ্য লোড করা যায়নি।'});}});
app.post('/api/admin/products',requireAdmin,upload.single('image'),async(req,res)=>{try{const b=req.body;if(!String(b.name||'').trim())throw Error('পণ্যের নাম দিন।');const img=req.file?imageData(req.file):String(b.image||'');await exec('INSERT INTO products(name,price,old_price,category,tags,description,image,featured,is_new,stock,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[String(b.name).trim(),Number(b.price)||0,Number(b.old_price)||0,String(b.category||'স্কিন কেয়ার'),String(b.tags||''),String(b.description||''),img,b.featured==='true'?1:0,b.is_new==='false'?0:1,Number(b.stock)||0,now(),now()]);bust();res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.put('/api/admin/products/:id',requireAdmin,upload.single('image'),async(req,res)=>{try{const old=await one('SELECT image FROM products WHERE id=?',[Number(req.params.id)]);if(!old)return res.status(404).json({error:'পণ্য পাওয়া যায়নি।'});const b=req.body,img=req.file?imageData(req.file):String(b.image||old.image||'');await exec('UPDATE products SET name=?,price=?,old_price=?,category=?,tags=?,description=?,image=?,featured=?,is_new=?,stock=?,updated_at=? WHERE id=?',[String(b.name||'').trim(),Number(b.price)||0,Number(b.old_price)||0,String(b.category||'স্কিন কেয়ার'),String(b.tags||''),String(b.description||''),img,b.featured==='true'?1:0,b.is_new==='false'?0:1,Number(b.stock)||0,now(),Number(req.params.id)]);bust();res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.delete('/api/admin/products/:id',requireAdmin,async(req,res)=>{try{await exec('DELETE FROM products WHERE id=?',[Number(req.params.id)]);bust();res.json({ok:true});}catch(e){res.status(500).json({error:'পণ্য মুছে ফেলা যায়নি।'});}});
app.get('/api/admin/agents',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM agents ORDER BY id DESC'));}catch(e){res.status(500).json({error:'এজেন্ট লোড করা যায়নি।'});}});
app.post('/api/admin/agents',requireAdmin,async(req,res)=>{try{const b=req.body;if(!String(b.name||'').trim())throw Error('এজেন্টের নাম দিন।');await exec('INSERT INTO agents(name,phone,whatsapp,messenger,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[b.name,b.phone||'',b.whatsapp||'',b.messenger||'',b.active===false?0:1,now(),now()]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.put('/api/admin/agents/:id',requireAdmin,async(req,res)=>{try{const b=req.body;await exec('UPDATE agents SET name=?,phone=?,whatsapp=?,messenger=?,active=?,updated_at=? WHERE id=?',[b.name,b.phone||'',b.whatsapp||'',b.messenger||'',b.active?1:0,now(),Number(req.params.id)]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.delete('/api/admin/agents/:id',requireAdmin,async(req,res)=>{try{await exec('DELETE FROM agents WHERE id=?',[Number(req.params.id)]);res.json({ok:true});}catch(e){res.status(500).json({error:'এজেন্ট মুছে ফেলা যায়নি।'});}});
app.put('/api/admin/settings',requireAdmin,async(req,res)=>{try{for(const[k,v]of Object.entries(req.body||{})){if(!/^[a-z_]+$/.test(k))continue;await exec('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[k,String(v),now()]);}bust();res.json({ok:true});}catch(e){res.status(500).json({error:'সেটিংস সংরক্ষণ করা যায়নি।'});}});

async function gemini(contents,systemInstruction){
  const key=env('GEMINI_API_KEY');if(!key)throw Error('GEMINI_API_KEY missing');
  const model=env('GEMINI_MODEL')||'gemini-3.1-flash-lite';
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const body={systemInstruction:{parts:[{text:systemInstruction}]},contents,generationConfig:{temperature:0.2,maxOutputTokens:450}};
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const text=await r.text();if(!r.ok)throw Error(text);const j=JSON.parse(text);return j.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
}
function relevantProducts(products,msg){
  const q=String(msg||'').toLowerCase().trim();const words=q.split(/[^\p{L}\p{N}%]+/u).filter(x=>x.length>1);if(!words.length)return products.slice(0,8);
  const scored=products.map(p=>{const hay=`${p.name} ${p.category} ${p.tags} ${p.description}`.toLowerCase();let s=0;for(const w of words)if(hay.includes(w))s+=2;if(q.includes('দাম')||q.includes('price'))s+=1;return{p,s};}).sort((a,b)=>b.s-a.s);const matched=scored.filter(x=>x.s>0).slice(0,8).map(x=>x.p);return matched.length?matched:products.slice(0,8);
}
app.post('/api/chat',async(req,res)=>{
  const session=String(req.body.session||'guest').slice(0,80),message=String(req.body.message||'').trim();if(!message)return res.status(400).json({error:'বার্তা লিখুন।'});
  try{
    const cfg=await getSettings(),products=await getProducts(),rel=relevantProducts(products,message);
    const catalog=rel.map(p=>`ID ${p.id}: ${p.name} | দাম ৳${p.price}${p.old_price?` | আগের দাম ৳${p.old_price}`:''} | বিভাগ ${p.category} | স্টক ${p.stock>0?'আছে':'নেই'} | ${p.description}`).join('\n');
    const base=`তুমি MAHEER STORE-এর অফিসিয়াল customer support assistant। গ্রাহকের ভাষায়, সংক্ষিপ্ত ও ভদ্রভাবে উত্তর দাও। শুধু প্রদত্ত store তথ্য ও relevant product catalog ব্যবহার করবে; তথ্য বানাবে না। দাম, স্টক, delivery, payment বা agent সম্পর্কে অনুমান করবে না। গ্রাহক অর্ডার করতে চাইলে বলবে যে website-এর কার্ট/checkout ব্যবহার করে সরাসরি order করা যায়। Store: ${cfg.store_info}. About Store: ${cfg.about_store}. Delivery: ${cfg.delivery_time}. Payment: bKash=${cfg.bkash_number||'সেট করা নেই'}, Nagad=${cfg.nagad_number||'সেট করা নেই'}, Rocket=${cfg.rocket_number||'সেট করা নেই'}, COD=${cfg.cod_enabled==='true'?'চালু':'বন্ধ'}. Agent: ${cfg.chatbot_agent}. Relevant catalog:\n${catalog}`;
    const history=chatSessions.get(session)||[];const contents=[...history.slice(-6),{role:'user',parts:[{text:message}]}];const reply=await gemini(contents,base);chatSessions.set(session,[...contents,{role:'model',parts:[{text:reply}]}].slice(-8));res.json({reply:reply||'আপনাকে কীভাবে সাহায্য করতে পারি?'});
  }catch(e){res.json({reply:'এই মুহূর্তে এআই উত্তর দিতে পারছে না। '+((await getSettings()).chatbot_agent||'দয়া করে এজেন্টের সাথে যোগাযোগ করুন।')});}
});

app.use('/admin',express.static(path.join(__dirname,'admin')));app.use(express.static(path.join(__dirname,'public')));app.get('/admin/*',(req,res)=>res.sendFile(path.join(__dirname,'admin','index.html')));app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
initDatabase().then(()=>app.listen(PORT,()=>console.log(`MAHEER STORE running on ${PORT}; Turso connected.`))).catch(e=>{console.error('Startup failed:',e);process.exit(1);});
