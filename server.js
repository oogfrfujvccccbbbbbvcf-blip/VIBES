const express=require('express');
const session=require('express-session');
const fs=require('fs');
const path=require('path');

const app=express();
const PORT=process.env.PORT||3000;
const ADMIN_USER=process.env.ADMIN_USER;
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD;
const SESSION_SECRET=process.env.SESSION_SECRET;
if(!ADMIN_USER || !ADMIN_PASSWORD || !SESSION_SECRET){
  throw new Error('Missing required environment variables: ADMIN_USER, ADMIN_PASSWORD, SESSION_SECRET');
}

const DATA_FILE=path.join(__dirname,'vibes-data.json');
const defaults={
 name:'VIBES (PlayStation & Café)',
 rating:'5.0',
 tagline:'PlayStation & Café في شبرا الخيمة — جيمينج، مشروبات وسناكس، وقعدة معمولة عشان تستمتع بكل لحظة.',
 whatsapp:'201028582811',
 address:'16 أمين مشهور، بيجام، قسم أول شبرا الخيمة، محافظة القليوبية',
 plusCode:'47JH+9R — قسم أول شبرا الخيمة',
 ps5Price:'حسب الساعة'
};
const defaultMenu=[
 {id:1,name:'قهوة / مشروبات ساخنة',price:'من — ج.م',category:'مشروبات',description:'قهوة ومشروبات ساخنة متنوعة',visible:true},
 {id:2,name:'مشروبات باردة',price:'من — ج.م',category:'مشروبات',description:'مشروبات منعشة أثناء اللعب',visible:true},
 {id:3,name:'Snacks',price:'من — ج.م',category:'سناكس',description:'سناكس خفيفة للجلسات الطويلة',visible:true},
 {id:4,name:'Meals',price:'من — ج.م',category:'وجبات',description:'اختيارات مناسبة للـ gaming sessions',visible:true}
];
function loadData(){
 try{
   if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE,JSON.stringify({settings:defaults,bookings:[],menu:defaultMenu},null,2),'utf8');
   const d=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
   d.settings={...defaults,...(d.settings||{})}; d.bookings=d.bookings||[]; d.menu=Array.isArray(d.menu)?d.menu:defaultMenu;
   return d;
 }catch(e){return {settings:{...defaults},bookings:[],menu:defaultMenu};}
}
function saveData(d){fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2),'utf8');}
let data=loadData();

app.use(express.json());
app.use(session({secret:SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax'}}));
app.use(express.static(path.join(__dirname,'public')));

function auth(req,res,next){if(!req.session.admin)return res.status(401).json({error:'unauthorized'});next()}

app.post('/api/login',(req,res)=>{
 const {username,password}=req.body||{};
 if(username===ADMIN_USER && password===ADMIN_PASSWORD){req.session.admin=true;return res.json({ok:true})}
 res.status(401).json({error:'invalid'});
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>res.json({loggedIn:!!req.session.admin}));


app.get('/api/menu',(req,res)=>res.json(data.menu.filter(x=>x.visible!==false)));
app.get('/api/menu/all',auth,(req,res)=>res.json(data.menu));
app.post('/api/menu',auth,(req,res)=>{
 const {name,price,category,description,visible}=req.body||{};
 if(!String(name||'').trim()) return res.status(400).json({error:'name_required'});
 const item={id:Date.now()+Math.floor(Math.random()*1000),name:String(name).trim(),price:String(price??''),category:String(category??''),description:String(description??''),visible:visible!==false};
 data.menu.push(item); saveData(data); res.json({ok:true,item});
});
app.put('/api/menu/:id',auth,(req,res)=>{
 const item=data.menu.find(x=>Number(x.id)===Number(req.params.id)); if(!item)return res.status(404).json({error:'not_found'});
 for(const k of ['name','price','category','description']) if(Object.prototype.hasOwnProperty.call(req.body,k)) item[k]=String(req.body[k]??'');
 if(Object.prototype.hasOwnProperty.call(req.body,'visible')) item.visible=!!req.body.visible;
 saveData(data); res.json({ok:true,item});
});
app.delete('/api/menu/:id',auth,(req,res)=>{const before=data.menu.length; data.menu=data.menu.filter(x=>Number(x.id)!==Number(req.params.id)); if(data.menu.length===before)return res.status(404).json({error:'not_found'}); saveData(data); res.json({ok:true});});
app.post('/api/menu/import',auth,(req,res)=>{
 const rows=Array.isArray(req.body?.rows)?req.body.rows:[];
 const mode=req.body?.mode==='replace'?'replace':'append';
 const clean=rows.map((r,i)=>({id:Date.now()+i,name:String(r.name??r['الاسم']??r.Name??'').trim(),price:String(r.price??r['السعر']??r.Price??''),category:String(r.category??r['التصنيف']??r.Category??''),description:String(r.description??r['الوصف']??r.Description??''),visible:!(String(r.visible??r['ظاهر']??r.Visible??'').trim().toLowerCase()==='false'||String(r.visible??r['ظاهر']??r.Visible??'').trim()==='0'||String(r.visible??r['ظاهر']??r.Visible??'').trim()==='لا')})).filter(r=>r.name);
 if(!clean.length)return res.status(400).json({error:'no_valid_rows'});
 data.menu=mode==='replace'?clean:data.menu.concat(clean); saveData(data); res.json({ok:true,count:clean.length,menu:data.menu});
});

app.get('/api/settings',(req,res)=>res.json(data.settings));
app.put('/api/settings',auth,(req,res)=>{
 for(const k of Object.keys(defaults)){
   if(Object.prototype.hasOwnProperty.call(req.body,k)) data.settings[k]=String(req.body[k]??'');
 }
 saveData(data); res.json({ok:true});
});

app.post('/api/bookings',(req,res)=>{
 const {name,phone,date,time,hours,type,notes}=req.body||{};
 if(!name||!phone||!date||!time)return res.status(400).json({error:'missing'});
 data.bookings.unshift({id:Date.now(),name,phone,date,time,hours:hours||'',type:type||'',notes:notes||'',status:'pending',rejection_reason:'',created_at:new Date().toISOString()});
 data.bookings=data.bookings.slice(0,500);
 saveData(data);
 res.json({ok:true,id:data.bookings[0].id});
});
app.get('/api/bookings',auth,(req,res)=>res.json(data.bookings.slice(0,100)));
app.put('/api/bookings/:id',auth,(req,res)=>{
 const id=Number(req.params.id); const b=data.bookings.find(x=>x.id===id);
 if(!b) return res.status(404).json({error:'not_found'});
 const status=String(req.body?.status||'pending');
 if(!['pending','confirmed','rejected'].includes(status)) return res.status(400).json({error:'bad_status'});
 b.status=status;
 b.rejection_reason=status==='rejected' ? String(req.body?.rejection_reason||'') : '';
 b.updated_at=new Date().toISOString();
 saveData(data);
 res.json({ok:true,booking:b});
});

app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.listen(PORT,()=>console.log(`VIBES running on http://localhost:${PORT}`));