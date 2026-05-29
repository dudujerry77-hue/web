
// ═══════════════════════════════════════════════
//  DATA
// ═══════════════════════════════════════════════
const KEYS={p:'gg_p',o:'gg_o',u:'gg_u',sess:'gg_sess',cfg:'gg_cfg',fav:'gg_fav',admin:'gg_admin'};
const DEF_CFG={name:'GrubGlass',logoIcon:'bi-basket2-fill',tag:'Fresh & Delicious',heroLabel:'Fresh today',heroMain:'GrubGlass',heroHighlight:'Fresh & Delicious',heroDesc:'Discover the finest dishes, delivered fast. Order straight to WhatsApp.',heroPrimary:'Browse Menu',heroSecondary:'My Orders',curr:'₦',fee:500,wa:'2348083252950',accent:'#ff7c3a',theme:'dark',nav:'top'};
const DEF_ADMIN={uid:'admin-1',email:'admin@grubglass.com',password:'admin123',name:'Admin'};
const SEED=[
  {id:1,name:'Jerk Chicken Platter',price:4500,cat:'Mains',desc:'Smoky spiced jerk chicken with rice & peas, coleslaw and fried plantain.',img:'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=500&q=80',avail:true,rating:4.8,sold:312},
  {id:2,name:'Shrimp Fried Rice',price:3800,cat:'Mains',desc:'Wok-tossed rice with plump shrimp, egg, spring onions and vegetables.',img:'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500&q=80',avail:true,rating:4.6,sold:201},
  {id:3,name:'Mango Sorbet',price:1500,cat:'Desserts',desc:'Refreshing tropical mango sorbet made fresh daily. Zero dairy.',img:'https://images.unsplash.com/photo-1488900128323-21503983a07e?w=500&q=80',avail:true,rating:4.9,sold:150},
  {id:4,name:'Suya Skewers',price:2800,cat:'Starters',desc:'Tender beef skewers marinated in the classic suya spice blend.',img:'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&q=80',avail:true,rating:4.7,sold:280},
  {id:5,name:'Pepper Soup',price:2200,cat:'Starters',desc:'Spicy aromatic Nigerian pepper soup with catfish and fresh herbs.',img:'https://images.unsplash.com/photo-1547592180-85f173990554?w=500&q=80',avail:true,rating:4.5,sold:98},
  {id:6,name:'Chapman Cooler',price:1200,cat:'Drinks',desc:"Nigeria's favourite cocktail — Fanta, Sprite, grenadine and Angostura bitters.",img:'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=500&q=80',avail:true,rating:4.4,sold:190},
  {id:7,name:'Egusi + Swallow',price:3500,cat:'Mains',desc:'Rich melon seed soup with assorted meat, served with eba or pounded yam.',img:'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500&q=80',avail:false,rating:4.9,sold:410},
  {id:8,name:'Chin-Chin Basket',price:900,cat:'Snacks',desc:'Crispy fried dough snacks tossed in honey and sesame. Great for sharing.',img:'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500&q=80',avail:true,rating:4.3,sold:75},
];

function ls(k,fb){try{return JSON.parse(localStorage.getItem(k))??fb}catch{return fb}}
function lss(k,v){localStorage.setItem(k,JSON.stringify(v))}
function init(){
  if(!ls(KEYS.p,null))lss(KEYS.p,SEED);
  if(!ls(KEYS.cfg,null))lss(KEYS.cfg,DEF_CFG);
  if(!ls(KEYS.o,null))lss(KEYS.o,[]);
  if(!ls(KEYS.fav,null))lss(KEYS.fav,[]);
  if(!ls(KEYS.admin,null))lss(KEYS.admin,DEF_ADMIN);
}

const DB={
  cfg(){return{...DEF_CFG,...ls(KEYS.cfg,{})}},
  saveCfg(d){lss(KEYS.cfg,{...this.cfg(),...d})},
  prods(){return ls(KEYS.p,SEED)},
  prod(id){return this.prods().find(p=>p.id===id)||null},
  addProd(d){const pp=this.prods();const p={...d,id:Date.now(),sold:0,rating:0};lss(KEYS.p,[...pp,p]);return p},
  updProd(id,d){lss(KEYS.p,this.prods().map(p=>p.id===id?{...p,...d}:p))},
  delProd(id){lss(KEYS.p,this.prods().filter(p=>p.id!==id))},
  cats(){return['All',...new Set(this.prods().map(p=>p.cat))]},
  orders(){return ls(KEYS.o,[])},
  userOrders(uid){return this.orders().filter(o=>o.uid===uid)},
  placeOrder(cart,uid,area=''){
    const cfg=this.cfg();
    const sub=cart.reduce((s,x)=>s+x.qty*x.price,0);
    const sess=this.sess();
    const cleanArea=String(area||sess?.area||'').trim();
    const o={id:'ORD-'+Date.now(),uid:uid||'guest',customer:sess?.name||sess?.email||'Guest',area:cleanArea||'Not set',items:cart,sub,fee:cfg.fee,total:sub+cfg.fee,status:'pending',at:new Date().toISOString()};
    lss(KEYS.o,[o,...this.orders()]);
    if(sess&&cleanArea)this.saveProfile({area:cleanArea});
    return o;
  },
  updOrder(id,status){lss(KEYS.o,this.orders().map(o=>o.id===id?{...o,status}:o))},
  sess(){return ls(KEYS.sess,null)},
  isIn(){return!!this.sess()},
  isAdmin(){return this.sess()?.role==='admin'},
  adminCred(){return{...DEF_ADMIN,...ls(KEYS.admin,{})}},
  saveAdminCred(d){
    const current=this.adminCred();
    const next={...current,...d,uid:DEF_ADMIN.uid};
    lss(KEYS.admin,next);
    const sess=this.sess();
    if(sess?.role==='admin'){
      lss(KEYS.sess,{...sess,email:next.email,name:next.name});
    }
    return next;
  },
  login(email,pw){
    const admin=this.adminCred();
    if(email===admin.email&&pw===admin.password){
      const saved=ls(KEYS.u,[]).find(u=>u.email===email);
      const u={uid:DEF_ADMIN.uid,email:admin.email,name:admin.name||'Admin',role:'admin',avatar:saved?.avatar||'',av:'<i class="bi bi-person-check-fill"></i>'};
      lss(KEYS.sess,u);return{ok:true,u}
    }
    const users=ls(KEYS.u,[]);const f=users.find(u=>u.email===email&&u.pw===pw);
    if(f){const{pw:_,...s}=f;lss(KEYS.sess,s);return{ok:true,u:s}}
    return{ok:false,err:'Invalid email or password.'}
  },
  signup(name,email,pw,avatar='',area=''){
    const users=ls(KEYS.u,[]);
    if(users.find(u=>u.email===email))return{ok:false,err:'Email already registered.'};
    const u={uid:'u-'+Date.now(),name,email,pw,role:'user',avatar,area,av:'<i class="bi bi-people"></i>'};
    lss(KEYS.u,[...users,u]);const{pw:_,...s}=u;lss(KEYS.sess,s);return{ok:true,u:s}
  },
  logout(){localStorage.removeItem(KEYS.sess)},
  saveAvatar(avatar){
    const sess=this.sess();if(!sess)return null;
    return this.saveProfile({avatar});
  },
  saveProfile(d){
    const sess=this.sess();if(!sess)return null;
    const next={...sess,...d};
    lss(KEYS.sess,next);
    const users=ls(KEYS.u,[]);
    const found=users.some(u=>u.uid===sess.uid||u.email===sess.email);
    const clean={uid:sess.uid,email:sess.email,name:sess.name||sess.email,pw:'',role:sess.role||'user',avatar:sess.avatar||'',area:sess.area||'',av:sess.av};
    lss(KEYS.u,found?users.map(u=>(u.uid===sess.uid||u.email===sess.email)?{...u,...d}:u):[...users,{...clean,...d}]);
    return next;
  },
  favs(){return ls(KEYS.fav,[])},
  toggleFav(id){const f=this.favs();const n=f.includes(id)?f.filter(x=>x!==id):[...f,id];lss(KEYS.fav,n);return n.includes(id)},
  hasFav(id){return this.favs().includes(id)},
};

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════
let cart=[],curPage='home',editId=null,formAvail=true,mQty=1,mProd=null,navMode='top',sbOpen=false;

// ═══════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════
const $=id=>document.getElementById(id);
function fmt(n){const c=DB.cfg();return c.curr+Number(n).toLocaleString('en-NG',{minimumFractionDigits:2})}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function icon(name){return `<i class="bi ${esc(String(name||'bi-basket2-fill').replace(/[^a-z0-9-]/gi,''))}"></i>`}
function todayKey(d=new Date()){return d.toISOString().slice(0,10)}
function offerPrice(p){return p.offerActive?Math.max(0,Math.round(Number(p.price||0)*(1-Number(p.offerPercent||0)/100))):Number(p.price||0)}
function uniqueCount(arr){return new Set(arr.filter(Boolean)).size}
function isImageSrc(src){return /^(https?:\/\/|data:image\/)/i.test(String(src||''))}
function avatarHTML(u,cls=''){
  return isImageSrc(u?.avatar)
    ? `<img class="${esc(cls)}" src="${esc(u.avatar)}" alt="${esc(u.name||'Profile picture')}" onerror="this.parentElement.innerHTML='${icon('bi-person-fill').replace(/'/g,'&apos;')}'">`
    : icon('bi-person-fill');
}
function storeLogoIcon(cfg=DB.cfg()){
  return /^bi-[a-z0-9-]+$/i.test(cfg.logoIcon||'')?cfg.logoIcon:DEF_CFG.logoIcon;
}
function readImageFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function toast(msg,type='info',ms=3000){
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<span>${type==='success'?icon('bi-check-circle-fill'):type==='error'?icon('bi-x-circle-fill'):icon('bi-info-circle-fill')}</span> ${esc(msg)}`;
  $('twrap').appendChild(el);
  setTimeout(()=>{el.style.transition='all .3s';el.style.opacity='0';el.style.transform='translateY(8px) scale(.9)';setTimeout(()=>el.remove(),300)},ms);
}

function applyStoreBrand(){
  const cfg=DB.cfg();
  document.title=`${cfg.name} - Food Ordering`;
  document.querySelectorAll('.brand-name,.sb-brand span').forEach(el=>el.textContent=cfg.name);
  document.querySelectorAll('.brand-dot').forEach(el=>el.innerHTML=icon(storeLogoIcon(cfg)));
}

function applyHeroText(){
  const cfg=DB.cfg();
  if($('hero-tag'))$('hero-tag').innerHTML=`${icon('bi-lightning-charge-fill')} ${esc(cfg.heroLabel)}`;
  if($('hero-title'))$('hero-title').innerHTML=`${esc(cfg.heroMain)}<br><em>${esc(cfg.heroHighlight)}</em>`;
  if($('hero-desc'))$('hero-desc').textContent=cfg.heroDesc;
  if($('hero-primary-text'))$('hero-primary-text').textContent=cfg.heroPrimary;
  if($('hero-secondary-text'))$('hero-secondary-text').textContent=cfg.heroSecondary;
}

function fillSettingsForm(){
  const cfg=DB.cfg();
  if(!$('set-name'))return;
  $('set-name').value=cfg.name||'';
  if($('set-logo'))$('set-logo').value=storeLogoIcon(cfg);
  $('set-tag').value=cfg.tag||'';
  if($('set-hero-label'))$('set-hero-label').value=cfg.heroLabel||'';
  if($('set-hero-main'))$('set-hero-main').value=cfg.heroMain||'';
  if($('set-hero-highlight'))$('set-hero-highlight').value=cfg.heroHighlight||'';
  if($('set-hero-desc'))$('set-hero-desc').value=cfg.heroDesc||'';
  if($('set-hero-primary'))$('set-hero-primary').value=cfg.heroPrimary||'';
  if($('set-hero-secondary'))$('set-hero-secondary').value=cfg.heroSecondary||'';
  $('set-curr').value=cfg.curr||DEF_CFG.curr;
  $('set-fee').value=Number.isFinite(Number(cfg.fee))?cfg.fee:0;
  $('set-wa').value=cfg.wa||'';
}

function fillAdminLoginForm(){
  if(!$('admin-email'))return;
  const admin=DB.adminCred();
  $('admin-email').value=admin.email||'';
  $('admin-name').value=admin.name||'';
  $('admin-password').value='';
  $('admin-password2').value='';
}

// ═══════════════════════════════════════════════
//  ROUTER
// ═══════════════════════════════════════════════
function go(page){
  if(page==='admin'&&!DB.isAdmin()){
    toast('Admin access required.','error');
    page='login';
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  curPage=page;
  const pel=$(`page-${page}`);if(pel)pel.classList.add('active');
  const cartBtn=document.querySelector('.cart-pill');
  if(cartBtn)cartBtn.style.display=page==='home'?'flex':'none';
  const bottomCart=$('bottom-cart-btn');
  if(bottomCart)bottomCart.style.display=page==='home'?'flex':'none';
  if(page!=='home'){
    $('cart-panel')?.classList.remove('open');
    closeCart();
  }
  switch(page){
    case'home':renderHome();break;
    case'favorites':renderFavs();break;
    case'orders':renderOrders();break;
    case'profile':renderProfile();break;
    case'admin':renderAdmin();break;
    case'login':if(DB.isIn())go('home');break;
  }
  window.scrollTo({top:0,behavior:'smooth'});
}

// ═══════════════════════════════════════════════
//  HOME
// ═══════════════════════════════════════════════
function renderHome(){
  const cfg=DB.cfg();
  applyStoreBrand();
  applyHeroText();
  const avail=DB.prods().filter(p=>p.avail).length;
  $('s-dishes').textContent=avail;
  $('s-orders').textContent=DB.orders().length;
  $('s-fee').textContent=fmt(cfg.fee);
  renderCats();
  renderGrid(DB.prods().filter(p=>p.avail));
}

function renderCats(){
  const bar=$('cat-bar');if(!bar)return;
  bar.innerHTML=DB.cats().map(c=>`<button class="cat-chip${c==='All'?' active':''}" onclick="filterCat('${esc(c)}')" data-cat="${esc(c)}">${c==='All'?icon('bi-grid-fill'):''}${esc(c)}</button>`).join('');
}

function filterCat(cat){
  document.querySelectorAll('.cat-chip').forEach(el=>el.classList.toggle('active',el.dataset.cat===cat));
  const prods=DB.prods().filter(p=>p.avail);
  renderGrid(cat==='All'?prods:prods.filter(p=>p.cat===cat));
}

function handleSearch(v){
  const q=v.toLowerCase().trim();
  const prods=DB.prods().filter(p=>p.avail);
  renderGrid(q?prods.filter(p=>p.name.toLowerCase().includes(q)||p.cat.toLowerCase().includes(q)||(p.desc||'').toLowerCase().includes(q)):prods);
}

function renderGrid(prods){
  const g=$('pgrid');if(!g)return;
  if(!prods.length){g.innerHTML='<p style="color:var(--t3);padding:48px;text-align:center;grid-column:1/-1">No items found.</p>';return}
  g.innerHTML=prods.map((p,i)=>cardHTML(p,i)).join('');
}

function cardHTML(p,i=0){
  const price=offerPrice(p);
  const hasOffer=p.offerActive&&price<Number(p.price||0);
  return`<div class="pcard" style="animation-delay:${i*55}ms" onclick="openPM(${p.id})">
    <div class="pc-img">
      ${p.img?`<img src="${esc(p.img)}" alt="${esc(p.name)}" onerror="this.style.display='none'"/>`:icon('bi-egg-fried')}
      <span class="pc-badge">${esc(p.cat)}</span>
      ${hasOffer?`<span class="offer-badge">${Number(p.offerPercent||0)}% OFF</span>`:''}
      <button class="pc-fav${DB.hasFav(p.id)?' active':''}" onclick="event.stopPropagation();toggleFav(${p.id},this)">${icon(DB.hasFav(p.id)?'bi-heart-fill':'bi-heart')}</button>
    </div>
    <div class="pc-body">
      <div class="pc-cat">${esc(p.cat)}</div>
      <div class="pc-name">${esc(p.name)}</div>
      <div class="pc-desc">${esc(p.desc||'')}</div>
      <div class="pc-foot">
        <div><div class="pc-price">${hasOffer?`<span class="old-price">${fmt(p.price)}</span> `:''}${fmt(price)}</div><div class="pc-stars">${icon('bi-star-fill').repeat(Math.round(p.rating||0))} <span style="color:var(--t3)">(${p.sold||0})</span></div></div>
        <button class="add-btn" onclick="event.stopPropagation();quickAdd(${p.id})" title="Add">+</button>
      </div>
    </div>
  </div>`
}

// ═══════════════════════════════════════════════
//  PRODUCT MODAL
// ═══════════════════════════════════════════════
function openPM(id){
  const p=DB.prod(id);if(!p)return;
  mProd=p;mQty=1;
  const imgEl=$('m-img');
  imgEl.innerHTML=`<button class="m-close" onclick="closePM()">${icon('bi-x-lg')}</button>${p.img?`<img src="${esc(p.img)}" alt="${esc(p.name)}" onerror="this.style.display='none'"/>`:icon('bi-egg-fried')}`;
  $('m-cat').textContent=p.cat;
  $('m-name').textContent=p.name;
  $('m-desc').textContent=p.desc||'';
  $('m-qty').textContent=1;
  $('m-price').textContent=fmt(offerPrice(p));
  $('m-add-btn').textContent=`Add to Order - ${fmt(offerPrice(p))}`;
  $('prod-modal').classList.add('open');
}
function closePM(){$('prod-modal').classList.remove('open')}
function mqty(d){
  mQty=Math.max(1,mQty+d);
  $('m-qty').textContent=mQty;
  if(mProd){$('m-price').textContent=fmt(offerPrice(mProd)*mQty);$('m-add-btn').textContent=`Add to Order - ${fmt(offerPrice(mProd)*mQty)}`}
}
function mAddCart(){
  if(!mProd)return;
  for(let i=0;i<mQty;i++)quickAdd(mProd.id,false);
  toast(`${mProd.name} x${mQty} added!`,'success');
  closePM();openCart();
}

// ═══════════════════════════════════════════════
//  FAVOURITES
// ═══════════════════════════════════════════════
function toggleFav(id,btn){
  const now=DB.toggleFav(id);
  btn.innerHTML=icon(now?'bi-heart-fill':'bi-heart');
  btn.classList.toggle('active',now);
  toast(now?'Added to favourites':'Removed from favourites',now?'success':'info');
}
function renderFavs(){
  const ids=DB.favs();
  const prods=DB.prods().filter(p=>ids.includes(p.id));
  const g=$('fav-grid');if(!g)return;
  g.innerHTML=prods.length?prods.map((p,i)=>cardHTML(p,i)).join(''):'<p style="color:var(--t3);padding:48px;text-align:center;grid-column:1/-1">No favourites yet. Tap the heart icon on any dish.</p>';
}

// ═══════════════════════════════════════════════
//  CART
// ═══════════════════════════════════════════════
function quickAdd(id,notify=true){
  if(!DB.isIn()){toast('Please log in to add items.','error');go('login');return}
  const p=DB.prod(id);if(!p)return;
  const ex=cart.find(x=>x.id===id);
  if(ex)ex.qty++;else cart.push({...p,price:offerPrice(p),basePrice:p.price,qty:1});
  updBadge();renderCP();
  if(notify)toast(`${p.name} added!`,'success',1800);
  if(window.innerWidth>1000)openCart();
}
function chQty(id,d){const x=cart.find(x=>x.id===id);if(!x)return;x.qty=Math.max(1,x.qty+d);updBadge();renderCP();renderCD()}
function rmCart(id){cart=cart.filter(x=>x.id!==id);updBadge();renderCP();renderCD()}
function clearCart(){if(cart.length&&!confirm('Clear cart?'))return;cart=[];updBadge();renderCP();renderCD()}
function cartSub(){return cart.reduce((s,x)=>s+x.qty*x.price,0)}
function cartN(){return cart.reduce((s,x)=>s+x.qty,0)}
function updBadge(){const n=cartN();const b=$('cbadge');if(b){b.textContent=n;b.classList.toggle('on',n>0)}}

function openCart(){
  if(curPage!=='home'){toast('Cart is available from the home page.','info');go('home');return}
  if(window.innerWidth>1000){$('cart-panel').classList.add('open');renderCP()}
  else{$('cdov').classList.add('open');renderCD()}
}
function closeCart(){$('cdov').classList.remove('open')}

function cartFootHTML(){
  const cfg=DB.cfg();const sub=cartSub();const total=sub+cfg.fee;const area=DB.sess()?.area||'';
  return`<div class="cp-row"><span>Subtotal</span><span>${fmt(sub)}</span></div>
  <div class="cp-row"><span>Delivery</span><span>${fmt(cfg.fee)}</span></div>
  <label class="cart-area-label" for="cart-area">Area / Location</label>
  <input class="cart-area-input" id="cart-area" type="text" value="${esc(area)}" placeholder="e.g. Lekki Phase 1"/>
  <div class="divider"></div>
  <div class="cp-row total"><span>Total</span><span>${fmt(total)}</span></div>
  <button class="checkout-btn" onclick="checkout()">Place Order</button>
  <button class="wa-btn" onclick="orderWA()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
    Order via WhatsApp
  </button>`
}

function cartItemsHTML(onQty='chQty',onRm='rmCart'){
  if(!cart.length)return`<div class="cp-empty"><div class="cp-empty-icon">${icon('bi-cart')}</div><p>Cart is empty</p></div>`;
  return cart.map(x=>`
    <div class="ci">
      <div class="ci-thumb">${x.img?`<img src="${esc(x.img)}" onerror="this.parentElement.innerHTML='${icon('bi-egg-fried').replace(/'/g,'&apos;')}'"/>`:icon('bi-egg-fried')}</div>
      <div class="ci-info">
        <div class="ci-name">${esc(x.name)}</div>
        <div class="ci-price">${fmt(x.price*x.qty)}</div>
        <div class="ci-ctrl">
          <button class="ci-btn" onclick="${onQty}(${x.id},-1)">−</button>
          <span class="ci-qty">${x.qty}</span>
          <button class="ci-btn" onclick="${onQty}(${x.id},1)">+</button>
        </div>
      </div>
      <button class="ci-rm" onclick="${onRm}(${x.id})">✕</button>
    </div>`).join('')
}

function renderCP(){
  const body=$('cp-body');const foot=$('cp-foot');if(!body)return;
  body.innerHTML=cartItemsHTML();
  if(foot){foot.style.display=cart.length?'block':'none';if(cart.length)foot.innerHTML=cartFootHTML()}
}
function renderCD(){
  const body=$('cd-body');const foot=$('cd-foot');if(!body)return;
  body.innerHTML=cartItemsHTML();
  if(foot){foot.innerHTML=cart.length?cartFootHTML():''}
}

function checkout(){
  if(!DB.isIn()){toast('Please log in to place an order.','error');go('login');return}
  if(!cart.length){toast('Cart is empty.','error');return}
  const area=document.querySelector('.cart-area-input')?.value.trim()||DB.sess()?.area||'';
  if(!area){toast('Please add your area/location.','error');return}
  const o=DB.placeOrder(cart,DB.sess().uid,area);
  cart=[];updBadge();renderCP();renderCD();
  $('cart-panel').classList.remove('open');closeCart();
  toast(`Order ${o.id} placed!`,'success',4000);
  go('orders');
}

function orderWA(){
  if(!DB.isIn()){toast('Please log in first.','error');go('login');return}
  if(!cart.length)return;
  const cfg=DB.cfg();
  const area=document.querySelector('.cart-area-input')?.value.trim()||DB.sess()?.area||'';
  if(!area){toast('Please add your area/location.','error');return}
  const lines=cart.map(x=>`- ${x.qty}x ${x.name} - ${fmt(x.price*x.qty)}`).join('\n');
  const msg=`Hello! I'd like to order:\n\n${lines}\n\nArea/Location: ${area}\nDelivery: ${fmt(cfg.fee)}\nTotal: ${fmt(cartSub()+cfg.fee)}`;
  window.open(`https://wa.me/${cfg.wa}?text=${encodeURIComponent(msg)}`,'_blank');
}

// ═══════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════
function switchTab(tab){
  document.querySelectorAll('.auth-tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
  $('form-login').style.display=tab==='login'?'block':'none';
  $('form-signup').style.display=tab==='signup'?'block':'none';
}
function fillAdmin(){
  const admin=DB.adminCred();
  $('l-email').value=admin.email;
  $('l-pw').value=admin.password;
}
function doLogin(){
  const em=$('l-email').value.trim(),pw=$('l-pw').value;
  if(!em||!pw){ferr('l-err','Fill in all fields.');return}
  const r=DB.login(em,pw);
  if(r.ok){toast(`Welcome back, ${r.u.name||r.u.email}!`,'success');updNavUser();go('home')}
  else{ferr('l-err',r.err);$('l-pw').classList.add('err','shake');setTimeout(()=>$('l-pw').classList.remove('shake'),400)}
}
async function doSignup(){
  const n=$('s-name').value.trim(),area=$('s-area')?.value.trim()||'',em=$('s-email').value.trim(),pw=$('s-pw').value,pw2=$('s-pw2').value;
  if(!n||!em||!pw){ferr('s-err','Fill in all fields.');return}
  if(pw!==pw2){ferr('s-err','Passwords do not match.');return}
  if(pw.length<6){ferr('s-err','Password must be 6+ characters.');return}
  const file=$('s-avatar-file')?.files?.[0];
  const avatar=file?await readImageFile(file):$('s-avatar')?.value.trim()||'';
  if(avatar&&!isImageSrc(avatar)){ferr('s-err','Use a valid profile image URL.');return}
  const r=DB.signup(n,em,pw,avatar,area);
  if(r.ok){toast(`Welcome, ${n}!`,'success');updNavUser();go('home')}
  else ferr('s-err',r.err);
}
function doLogout(){DB.logout();cart=[];updBadge();updNavUser();toast('Logged out.','info');go('home')}
function ferr(id,msg){const el=$(id);if(el){el.textContent=msg;el.classList.add('on');setTimeout(()=>el.classList.remove('on'),4000)}}
function updNavUser(){
  const u=DB.sess();const el=$('nav-user');if(!el)return;
  document.querySelectorAll('.admin-only').forEach(link=>link.style.display=u?.role==='admin'?'':'none');
  if(u){el.innerHTML=isImageSrc(u.avatar)?avatarHTML(u,'nav-avatar'):(u.av||icon('bi-person-check-fill'));el.onclick=()=>go(u.role==='admin'?'admin':'profile')}
  else{el.innerHTML='<i class="bi bi-person-x"></i>';el.onclick=()=>go('login')}
}

// ═══════════════════════════════════════════════
//  ORDERS
// ═══════════════════════════════════════════════
function renderOrders(){
  const u=DB.sess();const list=$('orders-list');if(!list)return;
  if(!u){list.innerHTML=`<div style="text-align:center;padding:60px;color:var(--t3)"><p style="font-size:36px;margin-bottom:10px">${icon('bi-lock-fill')}</p><p>Please <a onclick="go('login')" style="color:var(--a1);cursor:pointer">log in</a> to see orders.</p></div>`;return}
  const orders=u.role==='admin'?DB.orders():DB.userOrders(u.uid);
  if(!orders.length){list.innerHTML=`<div style="text-align:center;padding:60px;color:var(--t3)"><p style="font-size:36px;margin-bottom:10px">${icon('bi-clipboard-check')}</p><p>No orders yet!</p></div>`;return}
  list.innerHTML=orders.map((o,i)=>{
    const names=o.items.map(x=>x.name).join(', ');
    const d=new Date(o.at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'});
    return`<div class="ocard" style="animation-delay:${i*55}ms">
      <div class="o-icon"><i class="bi bi-card-list"></i></div>
      <div class="o-info">
        <div class="o-id">${esc(o.id)}</div>
        <div class="o-items">${esc(names)}</div>
        <div class="o-meta"><span class="o-date">${d}</span><span>${icon('bi-geo-alt')} ${esc(o.area||'Not set')}</span><span class="sbadge ${o.status}">${o.status.charAt(0).toUpperCase()+o.status.slice(1)}</span></div>
      </div>
      <div class="o-price">${fmt(o.total)}</div>
      <button class="reorder-btn" onclick="reorder('${esc(o.id)}')">Reorder</button>
    </div>`}).join('');
}

function reorder(oid){
  if(!DB.isIn()){go('login');return}
  const o=DB.orders().find(x=>x.id===oid);if(!o)return;
  o.items.forEach(item=>{const ex=cart.find(x=>x.id===item.id);if(ex)ex.qty+=item.qty;else cart.push({...item})});
  updBadge();renderCP();toast('Items re-added to cart!','success');go('home');openCart();
}

// ═══════════════════════════════════════════════
//  PROFILE
// ═══════════════════════════════════════════════
function renderProfile(){
  const u=DB.sess();const cfg=DB.cfg();
  $('p-name').textContent=u?(u.name||u.email):'Guest';
  $('p-email').textContent=u?.email||'';
  if($('p-avatar'))$('p-avatar').innerHTML=avatarHTML(u);
  if($('p-area'))$('p-area').value=u?.area||'';
  if($('p-avatar-url'))$('p-avatar-url').value=isImageSrc(u?.avatar)&&!String(u.avatar).startsWith('data:image/')?u.avatar:'';
  if($('p-avatar-file'))$('p-avatar-file').value='';
  $('tog-dark').classList.toggle('on',document.documentElement.dataset.theme!=='light');
  $('tog-sidebar').classList.toggle('on',navMode==='sidebar');
  document.querySelectorAll('.swatch').forEach(sw=>sw.classList.toggle('active',sw.dataset.c===cfg.accent));
  fillSettingsForm();
}

async function saveAvatar(){
  if(!DB.isIn()){toast('Please log in first.','error');go('login');return}
  const file=$('p-avatar-file')?.files?.[0];
  const avatar=file?await readImageFile(file):$('p-avatar-url').value.trim();
  if(avatar&&!isImageSrc(avatar)){toast('Use a valid image URL or upload an image file.','error');return}
  DB.saveAvatar(avatar);
  updNavUser();
  renderProfile();
  toast('Profile picture saved.','success');
}

async function saveProfileDetails(){
  if(!DB.isIn()){toast('Please log in first.','error');go('login');return}
  const file=$('p-avatar-file')?.files?.[0];
  const avatar=file?await readImageFile(file):$('p-avatar-url').value.trim();
  if(avatar&&!isImageSrc(avatar)){toast('Use a valid image URL or upload an image file.','error');return}
  DB.saveProfile({avatar,area:$('p-area')?.value.trim()||''});
  updNavUser();
  renderProfile();
  toast('Profile details saved.','success');
}

function toggleTheme(){
  let icon=$('theme-icon')
  const light=document.documentElement.dataset.theme==='light';
  document.documentElement.dataset.theme=light?'dark':'light';
  DB.saveCfg({theme:light?'dark':'light'});
  $('tog-dark').classList.toggle('on',!light);
  toast(`${light?'Dark':'Light'} mode`,'info',1500);

  if(document.documentElement.dataset.theme==='dark'){
    icon.className='bi bi-moon';
}else{
  icon.className='bi bi-sun';
}
}
function toggleNavMode(){
  navMode=navMode==='top'?'sidebar':'top';
  DB.saveCfg({nav:navMode});
  $('tog-sidebar').classList.toggle('on',navMode==='sidebar');
  applyNav();toast(`${navMode==='sidebar'?'Sidebar':'Top'} navigation`,'info',1500);
  if(navMode==='sidebar'){
    $('threeDot').style.display='block';
    // console.log('%cSidebar mode enabled. Tip: Press "M" to toggle navigation!','color:var(--a1);font-size:14px');
    }else{
    $('threeDot').style.display='none';
  }
}
function applyNav(){
  const small=window.matchMedia('(max-width: 600px)').matches;
  if(small){
    sbOpen=false;
    $('top-nav').style.display='';
    $('sidebar').classList.remove('open');
    $('content').classList.remove('sb-open');
    if($('threeDot'))$('threeDot').style.display='none';
    return;
  }
  $('top-nav').style.display=navMode==='sidebar'?'none':'';
  $('sidebar').classList.toggle('open',navMode==='sidebar'||sbOpen);
  $('content').classList.toggle('sb-open',navMode==='sidebar');
  if($('threeDot'))$('threeDot').style.display=navMode==='sidebar'?'block':'none';
}
function setAccent(c){
  document.documentElement.style.setProperty('--a1',c);
  document.documentElement.style.setProperty('--a1d',c+'30');
  document.documentElement.style.setProperty('--a2',c);
  DB.saveCfg({accent:c});
  document.querySelectorAll('.swatch').forEach(sw=>sw.classList.toggle('active',sw.dataset.c===c));
  toast('Accent updated!','success',1500);
}
function saveSettings(){
  const name=$('set-name').value.trim();if(!name){toast('Name required.','error');return}
  const fee=parseFloat($('set-fee').value);
  DB.saveCfg({
    name,
    logoIcon:($('set-logo')?.value.trim()||DEF_CFG.logoIcon),
    tag:$('set-tag').value.trim(),
    heroLabel:$('set-hero-label')?.value.trim()||DEF_CFG.heroLabel,
    heroMain:$('set-hero-main')?.value.trim()||name,
    heroHighlight:$('set-hero-highlight')?.value.trim()||$('set-tag').value.trim()||DEF_CFG.heroHighlight,
    heroDesc:$('set-hero-desc')?.value.trim()||DEF_CFG.heroDesc,
    heroPrimary:$('set-hero-primary')?.value.trim()||DEF_CFG.heroPrimary,
    heroSecondary:$('set-hero-secondary')?.value.trim()||DEF_CFG.heroSecondary,
    curr:$('set-curr').value.trim()||DEF_CFG.curr,
    fee:Number.isFinite(fee)?fee:0,
    wa:$('set-wa').value.trim()
  });
  applyStoreBrand();
  applyHeroText();
  fillSettingsForm();
  toast('Settings saved!','success');
  renderHome();
  if(curPage==='admin')renderAdmin();
}

// ═══════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════
function renderAdmin(){
  if(!DB.isAdmin()){toast('Admin access required.','error');go('login');return}
  applyStoreBrand();
  applyHeroText();
  fillSettingsForm();
  fillAdminLoginForm();
  const prods=DB.prods();const orders=DB.orders();const todays=orders.filter(o=>todayKey(new Date(o.at))===todayKey());
  $('as-p').textContent=prods.length;
  $('as-o').textContent=todays.length;
  $('as-r').textContent=fmt(todays.reduce((s,o)=>s+(o.total||0),0));
  $('as-pend').textContent=uniqueCount(todays.map(o=>o.uid||o.customer));
  renderAProds();renderAOrders();renderHistory();renderOffers();
}
function renderAProds(){
  const t=$('admin-ptable');if(!t)return;
  const prods=DB.prods();
  t.innerHTML=prods.map(p=>`
    <div class="arow">
      <div class="ar-th">${p.img?`<img src="${esc(p.img)}" onerror="this.parentElement.innerHTML='${icon('bi-egg-fried').replace(/'/g,'&apos;')}'"/>`:icon('bi-egg-fried')}</div>
      <div class="ar-info"><div class="ar-name">${esc(p.name)}</div><div class="ar-cat">${esc(p.cat)} - ${p.avail?'Available':'Unavailable'}</div></div>
      <div class="ar-price">${fmt(p.price)}</div>
      <div class="ar-acts">
        <button class="ar-btn" onclick="openAF(${p.id})"><i class="bi bi-pencil"></i></button>
        <button class="ar-btn del" onclick="delProd(${p.id})"><i class="bi bi-trash"></i></button>
      </div>
    </div>`).join('')||'<p style="padding:18px;color:var(--t3)">No products.</p>';
}
function renderAOrders(){
  const t=$('admin-otable');if(!t)return;
  const orders=DB.orders();
  t.innerHTML=orders.map(o=>`
    <div class="arow">
      <div class="ar-info"><div class="ar-name">${esc(o.id)} - ${esc(o.customer||'Customer')}</div><div class="ar-cat">${esc(o.area||'Not set')} - ${o.items.map(x=>esc(x.name)).join(', ')}</div></div>
      <div class="ar-price">${fmt(o.total)}</div>
      <select onchange="DB.updOrder('${o.id}',this.value);renderAOrders()" style="padding:5px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-size:12px;cursor:pointer">
        ${['pending','preparing','delivered','cancelled'].map(s=>`<option value="${s}"${o.status===s?' selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
      </select>
    </div>`).join('')||'<p style="padding:18px;color:var(--t3)">No orders.</p>';
}
function orderGroupsByDate(){
  return DB.orders().reduce((acc,o)=>{
    const key=todayKey(new Date(o.at));
    if(!acc[key])acc[key]={date:key,orders:0,people:new Set(),sales:0,items:0};
    acc[key].orders++;
    acc[key].people.add(o.uid||o.customer);
    acc[key].sales+=Number(o.total||0);
    acc[key].items+=(o.items||[]).reduce((s,x)=>s+Number(x.qty||0),0);
    return acc;
  },{});
}
function renderHistory(){
  const hist=$('admin-history-table');const top=$('admin-top-table');if(!hist||!top)return;
  const rows=Object.values(orderGroupsByDate()).sort((a,b)=>b.date.localeCompare(a.date));
  hist.innerHTML=rows.map(d=>`
    <div class="arow">
      <div class="ar-info"><div class="ar-name">${new Date(d.date).toLocaleDateString('en-NG',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</div><div class="ar-cat">${d.orders} orders - ${d.people.size} customers - ${d.items} items</div></div>
      <div class="ar-price">${fmt(d.sales)}</div>
    </div>`).join('')||'<p style="padding:18px;color:var(--t3)">No sales history yet.</p>';
  const itemMap={},areaMap={};
  DB.orders().forEach(o=>{
    areaMap[o.area||'Not set']=(areaMap[o.area||'Not set']||0)+1;
    (o.items||[]).forEach(x=>itemMap[x.name]=(itemMap[x.name]||0)+Number(x.qty||0));
  });
  const items=Object.entries(itemMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const areas=Object.entries(areaMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  top.innerHTML=`
    <div class="mini-list-title">Most ordered items</div>
    ${items.map(([name,qty])=>`<div class="mini-row"><span>${esc(name)}</span><strong>${qty}</strong></div>`).join('')||'<p style="padding:12px 18px;color:var(--t3)">No item data yet.</p>'}
    <div class="mini-list-title">Most active areas</div>
    ${areas.map(([area,count])=>`<div class="mini-row"><span>${esc(area)}</span><strong>${count}</strong></div>`).join('')||'<p style="padding:12px 18px;color:var(--t3)">No area data yet.</p>'}`;
}
function renderOffers(){
  const list=$('offer-product-list');if(!list)return;
  list.innerHTML=DB.prods().map(p=>`
    <label class="offer-row">
      <input type="checkbox" class="offer-check" value="${p.id}" ${p.offerActive?'checked':''}/>
      <span class="offer-thumb">${p.img?`<img src="${esc(p.img)}" alt="${esc(p.name)}">`:icon('bi-egg-fried')}</span>
      <span class="offer-info"><strong>${esc(p.name)}</strong><small>${esc(p.cat)} - ${fmt(p.price)}${p.offerActive?` - ${Number(p.offerPercent||0)}% off`:''}</small></span>
    </label>`).join('')||'<p style="padding:18px;color:var(--t3)">No products.</p>';
}
function selectedOfferIds(){
  return [...document.querySelectorAll('.offer-check:checked')].map(x=>Number(x.value));
}
function applyOffers(){
  if(!DB.isAdmin()){toast('Admin access required.','error');return}
  const percent=Math.min(90,Math.max(1,Number($('offer-percent').value)||15));
  const limit=Math.max(1,Number($('offer-limit').value)||1);
  const selected=selectedOfferIds().slice(0,limit);
  if(!selected.length){toast('Select at least one item for the offer.','error');return}
  DB.prods().forEach(p=>DB.updProd(p.id,{offerActive:selected.includes(p.id),offerPercent:percent}));
  toast(`Offer applied to ${selected.length} item${selected.length>1?'s':''}.`,'success');
  renderAdmin();renderHome();
}
function clearOffers(){
  DB.prods().forEach(p=>DB.updProd(p.id,{offerActive:false,offerPercent:0}));
  toast('Offers cleared.','info');
  renderAdmin();renderHome();
}
function adminTab(tab){
  document.querySelectorAll('.atab-btn').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
  $('admin-prod-panel').style.display=tab==='products'?'block':'none';
  $('admin-ord-panel').style.display=tab==='orders'?'block':'none';
  $('admin-history-panel').style.display=tab==='history'?'block':'none';
  $('admin-offers-panel').style.display=tab==='offers'?'block':'none';
  $('store').style.display=tab==='store'?'block':'none';
  $('admin-access-panel').style.display=tab==='access'?'block':'none';
  if(tab==='history')renderHistory();
  if(tab==='offers')renderOffers();
  if(tab==='store')fillSettingsForm();
  if(tab==='access')fillAdminLoginForm();
}
function saveAdminLogin(){
  if(!DB.isAdmin()){toast('Admin access required.','error');go('login');return}
  const email=$('admin-email').value.trim();
  const name=$('admin-name').value.trim()||'Admin';
  const password=$('admin-password').value;
  const password2=$('admin-password2').value;
  if(!email){toast('Admin email required.','error');return}
  if(password||password2){
    if(password.length<6){toast('Password must be 6+ characters.','error');return}
    if(password!==password2){toast('Passwords do not match.','error');return}
  }
  const update={email,name};
  if(password)update.password=password;
  DB.saveAdminCred(update);
  fillAdminLoginForm();
  updNavUser();
  renderProfile();
  toast('Admin login updated.','success');
}
function openAF(id){
  editId=id||null;formAvail=true;
  $('af-title').textContent=id?'Edit Product':'Add Product';
  if(id){
    const p=DB.prod(id);if(!p)return;
    $('af-name').value=p.name;$('af-price').value=p.price;$('af-cat').value=p.cat;
    $('af-desc').value=p.desc||'';$('af-img').value=p.img||'';
    formAvail=p.avail;afPreview(p.img);
  }else{
    ['af-name','af-price','af-desc','af-img'].forEach(i=>{const el=$(i);if(el)el.value=''});
    $('af-cat').value='Mains';$('af-prev').style.display='none';
  }
  setFA(formAvail);$('afov').classList.add('open');$('af-name').focus();
}
function closeAF(){$('afov').classList.remove('open')}
function setFA(v){formAvail=v;$('tog-yes').classList.toggle('active',v);$('tog-no').classList.toggle('active',!v)}
function afPreview(url){const p=$('af-prev');if(!p)return;if(url){p.src=url;p.style.display='block';p.onerror=()=>p.style.display='none'}else p.style.display='none'}
function saveAF(){
  const name=$('af-name').value.trim(),price=parseFloat($('af-price').value);
  if(!name||isNaN(price)){toast('Name and price required.','error');return}
  const d={name,price,cat:$('af-cat').value,desc:$('af-desc').value.trim(),img:$('af-img').value.trim(),avail:formAvail};
  if(editId){DB.updProd(editId,d);toast('Updated!','success')}
  else{DB.addProd(d);toast('Product added!','success')}
  closeAF();renderAdmin();renderHome();
}
function delProd(id){if(!confirm('Delete this product?'))return;DB.delProd(id);toast('Deleted.','info');renderAdmin();renderHome()}

// ═══════════════════════════════════════════════
//  SIDEBAR TOGGLE
// ═══════════════════════════════════════════════
function toggleSidebar(){
  if(window.matchMedia('(max-width: 600px)').matches){sbOpen=false;applyNav();return}
  sbOpen=!sbOpen;$('sidebar').classList.toggle('open',sbOpen)
}

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
init();
const cfg=DB.cfg();
document.documentElement.dataset.theme=cfg.theme||'dark';
if(cfg.accent){
  document.documentElement.style.setProperty('--a1',cfg.accent);
  document.documentElement.style.setProperty('--a1d',cfg.accent+'30');
}
navMode=cfg.nav||'top';
applyStoreBrand();
applyNav();
window.addEventListener('resize',applyNav);
updNavUser();
go('home');


