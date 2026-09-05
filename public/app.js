let products=[],cart=JSON.parse(localStorage.getItem('maheer_cart')||'[]');
const $=id=>document.getElementById(id),money=n=>'৳'+Number(n||0).toLocaleString('en-US');
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const session='web-'+(crypto.randomUUID?crypto.randomUUID():Date.now());
function saveCart(){localStorage.setItem('maheer_cart',JSON.stringify(cart));$('cartCount').textContent=cart.reduce((s,x)=>s+x.qty,0)}
async function loadSettings(){try{const s=await fetch('/api/settings').then(r=>r.json());$('aboutText').textContent=s.about_store||'';$('footerAbout').textContent=s.store_info||s.about_store||'';const links=[['wa','whatsapp_link'],['ig','instagram_link'],['tt','tiktok_link'],['fb','facebook_link']];links.forEach(([id,k])=>{if(s[k])$(id).href=s[k];else $(id).style.opacity='.45'});links.forEach(([id,k])=>{const f={wa:'fwa',ig:'fig',tt:'ftt',fb:'ffb'}[id];if(s[k])$(f).href=s[k]});}catch{}}
async function loadProducts(q=''){
  try{
    const url='/api/products'+(q?'?search='+encodeURIComponent(q):'');
    const r=await fetch(url); if(!r.ok) throw Error('products');
    const data=await r.json();
    products=Array.isArray(data)?data:[];
    renderProducts(products); renderChips(products);
    if(q) scrollToId('products');
  }catch{
    // Fallback: search/filter the already loaded catalog instead of failing silently.
    if(q){const nq=norm(q); renderProducts(products.filter(p=>productText(p).includes(nq))); scrollToId('products');}
  }
}
function norm(v){return String(v??'').toLocaleLowerCase('bn-BD').trim().replace(/\s+/g,' ')}
function productText(p){return norm([p.name,p.category,p.tags,p.description].join(' '))}
function searchProducts(){const q=$('search').value.trim();if(!q){loadProducts();return}const nq=norm(q);const matches=products.filter(p=>productText(p).includes(nq));renderProducts(matches);renderChips(matches);scrollToId('products')}

function renderChips(ps){const cats=['ক্লিনজার','ময়েশ্চারাইজার','সিরাম','সানস্ক্রিন','বডি কেয়ার','হেয়ার কেয়ার','লিপ কেয়ার'];$('chips').innerHTML='<button class="chip active" onclick="loadProducts()">সব</button>'+cats.map(c=>`<button class="chip" onclick="filterCat('${esc(c)}')">${esc(c)}</button>`).join('')}
async function filterCat(cat){
  try{
    const r=await fetch('/api/products?category='+encodeURIComponent(cat));
    if(r.ok){const data=await r.json();renderProducts(Array.isArray(data)?data:[]);}
    else renderProducts(products.filter(p=>norm(p.category)===norm(cat)));
  }catch{renderProducts(products.filter(p=>norm(p.category)===norm(cat)))}
  document.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b.textContent===cat));
  scrollToId('products');
}
function renderProducts(ps){$('productGrid').innerHTML=ps.map(p=>{const discount=p.old_price>p.price?Math.round((1-p.price/p.old_price)*100):0;return `<article class="product"><button class="heart" onclick="addToCart(${p.id})">♡</button>${discount?`<span class="badge">-${discount}%</span>`:''}<button class="product-click" onclick="openProduct(${p.id})"><div class="pic"><img src="${p.image||'assets/hero-model.png'}" alt="${esc(p.name)}"></div><div class="product-body"><div class="product-cat">${esc(p.category)}</div><h3>${esc(p.name)}</h3><div class="price"><b>${money(p.price)}</b>${p.old_price?`<del>${money(p.old_price)}</del>`:''}</div></div></button><button class="buy" onclick="addToCart(${p.id})">🛒 কার্টে যোগ করুন</button></article>`}).join('')||'<div class="empty">কোনো পণ্য পাওয়া যায়নি।</div>'}
function openProduct(id){const p=products.find(x=>Number(x.id)===Number(id));if(!p)return;$('productDetail').innerHTML=`<div class="product-detail"><img src="${p.image||'assets/hero-model.png'}" alt="${esc(p.name)}"><div><div class="product-cat">${esc(p.category)}</div><h2>${esc(p.name)}</h2><div class="price"><b>${money(p.price)}</b>${p.old_price?` <del>${money(p.old_price)}</del>`:''}</div><p class="detail-description">${esc(p.description||'পণ্যের বিস্তারিত তথ্য শীঘ্রই যোগ করা হবে।').replace(/\n/g,'<br>')}</p><p><b>স্টক:</b> ${Number(p.stock)>0?Number(p.stock)+'টি আছে':'স্টক নেই'}</p><div class="detail-actions"><button class="dark-btn" onclick="addToCart(${p.id});closeModal('productModal')">কার্টে যোগ করুন</button><button class="gold-btn" onclick="addToCart(${p.id});closeModal('productModal');checkout()">এখনই অর্ডার করুন</button></div></div></div>`;openModal('productModal')}

function addToCart(id){const p=products.find(x=>Number(x.id)===Number(id));if(!p)return;const x=cart.find(x=>x.id===id);if(x)x.qty++;else cart.push({id:Number(p.id),qty:1});saveCart();openCart()}
function openCart(){renderCart();openModal('cartModal')}
function renderCart(){const rows=cart.map(x=>{const p=products.find(p=>Number(p.id)===x.id);if(!p)return '';return `<div class="cart-row"><img src="${p.image||'assets/hero-model.png'}"><div><b>${esc(p.name)}</b><small style="display:block;color:#888">${money(p.price)} × ${x.qty}</small><p class="cart-description">${esc(p.description||'')}</p><button onclick="changeQty(${x.id},-1)">−</button> <button onclick="changeQty(${x.id},1)">+</button></div><b>${money(p.price*x.qty)}</b></div>`}).join('');$('cartItems').innerHTML=rows||'<p>কার্টে কোনো পণ্য নেই।</p>';const total=cart.reduce((s,x)=>{const p=products.find(p=>Number(p.id)===x.id);return s+(p?p.price*x.qty:0)},0);$('cartTotal').textContent=money(total)}
function changeQty(id,d){const x=cart.find(x=>x.id===id);if(!x)return;x.qty+=d;if(x.qty<=0)cart=cart.filter(x=>x.id!==id);saveCart();renderCart()}
function checkout(){if(!cart.length){alert('কার্টে পণ্য যোগ করুন।');return}closeModal('cartModal');openModal('orderModal')}
$('orderForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.items=cart;const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await r.json();$('orderMsg').innerHTML=r.ok?`<div style="padding:14px;background:#f3f0e8;border-radius:8px;margin-top:10px">অর্ডার সফল হয়েছে। আপনার অর্ডার নম্বর: <b>${j.order_id}</b><br>মোট: <b>${money(j.total)}</b></div>`:`<div style="color:#a00;margin-top:8px">${esc(j.error||'অর্ডার করা যায়নি।')}</div>`;if(r.ok){cart=[];saveCart();e.target.reset()}}
async function trackOrder(){const code=$('trackInput').value.trim();if(!code)return;$('trackResult').textContent='খোঁজা হচ্ছে...';const r=await fetch('/api/orders/'+encodeURIComponent(code));const j=await r.json();$('trackResult').textContent=r.ok?`অর্ডার: ${j.order_code} • অবস্থা: ${j.status} • মোট: ${money(j.total)}`:(j.error||'পাওয়া যায়নি।')}
async function openAgents(){openModal('agentModal');try{const a=await fetch('/api/agents').then(r=>r.json());$('agentList').innerHTML=a.length?a.map(x=>`<div class="agent-card"><b>${esc(x.name)}</b><small style="display:block;color:#888">${esc(x.phone)}</small>${x.whatsapp?`<a href="https://wa.me/${String(x.whatsapp).replace(/\D/g,'')}" target="_blank">◉ WhatsApp</a>`:''}${x.messenger?`<a href="${esc(x.messenger)}" target="_blank">Messenger</a>`:''}</div>`).join(''):'<p>এখন কোনো সক্রিয় Agent নেই।</p>'}catch{$('agentList').innerHTML='<p>Agent তথ্য পাওয়া যাচ্ছে না।</p>'}}
function openChat(){openModal('chatModal');$('chatInput').focus()}
function quickAI(msg){openChat();sendChatMessage(msg)}
async function sendChatMessage(msg){if(!msg)return;addBubble(msg,'me');const input=$('chatInput');input.value='';const typing=document.createElement('div');typing.className='bubble bot typing';typing.textContent='উত্তর দিচ্ছে…';$('chatLog').appendChild(typing);$('chatLog').scrollTop=$('chatLog').scrollHeight;try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg,session})});const j=await r.json();typing.remove();addBubble(j.reply||'এখন উত্তর দেওয়া সম্ভব নয়।','bot')}catch{typing.remove();addBubble('সংযোগে সমস্যা হয়েছে। অনুগ্রহ করে Agent-এর সাথে যোগাযোগ করুন।','bot')}}
$('chatForm').onsubmit=async e=>{e.preventDefault();await sendChatMessage($('chatInput').value.trim())}
function addBubble(t,c){const d=document.createElement('div');d.className='bubble '+c;d.textContent=t;$('chatLog').appendChild(d);$('chatLog').scrollTop=$('chatLog').scrollHeight}
async function loadReviews(){try{const j=await fetch('/api/reviews').then(r=>r.json());$('reviewAvg').textContent=Number(j.average||0).toFixed(1);$('reviewCount').textContent=`${j.count||0}টি রিভিউ`;$('reviewGrid').innerHTML=(j.reviews||[]).map(r=>`<article class="review-card"><div class="stars">${'★'.repeat(Number(r.rating))}${'☆'.repeat(5-Number(r.rating))}</div><b>${esc(r.customer_name)}</b><p>${esc(r.comment)}</p><small>${new Date(r.created_at).toLocaleDateString('bn-BD')}</small></article>`).join('')||'<div class="empty">এখনো কোনো রিভিউ নেই।</div>'}catch{$('reviewGrid').innerHTML='<div class="empty">রিভিউ লোড করা যায়নি।</div>'}}
function openReviewForm(){openModal('reviewModal')}
$('reviewForm').onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});const j=await r.json();$('reviewMsg').innerHTML=r.ok?`<div class="notice">${esc(j.message)}</div>`:`<div class="notice error">${esc(j.error||'রিভিউ দেওয়া যায়নি।')}</div>`;if(r.ok){e.target.reset();loadReviews()}}
function openModal(id){$(id).classList.add('show')}function closeModal(id){$(id).classList.remove('show')}function scrollToId(id){$(id)?.scrollIntoView({behavior:'smooth'})}
$('hamb').onclick=()=>{$('nav').style.display=$('nav').style.display==='flex'?'none':'flex'};$('searchOpen').onclick=()=>{$('search').focus();scrollToId('products')};$('searchBtn').onclick=searchProducts;$('search').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchProducts()}};
$('year').textContent=new Date().getFullYear();saveCart();loadSettings();loadProducts();loadReviews();
