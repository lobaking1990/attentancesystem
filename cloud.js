const KEY_STUDENTS = 'pemulihan_students_v1';
const KEY_ATT = 'pemulihan_attendance_v1';
const KEY_PIN = 'pemulihan_teacher_pin_v1';
const KEY_SCANS = 'pemulihan_qr_scans_v1';
const DEFAULT_PIN = '1234';
const KEY_GOOGLE_EXEC_URL = 'pemulihan_google_exec_url_v11';
const KEY_GOOGLE_SYNC_KEY = 'pemulihan_google_sync_key_v11';
const CLOUD_BRIDGE_SOURCE = 'pemulihan-cloud-v11';
const CLOUD_REQUEST_TIMEOUT_MS = 20000;

const KEY_GOOGLE_DIRTY = 'pemulihan_google_cloud_dirty_v1';
const CLOUD_POLL_MS = 15000;

let cloudLoading = false;
let cloudPollTimer = null;
let cloudPendingWrites = 0;
let cloudDirty = localStorage.getItem(KEY_GOOGLE_DIRTY) === '1';
let lastCloudSyncAt = '';
let lastCloudError = '';

let selectedPhotoStudentId = null;
const DEFAULT_STUDENTS = [];
let students = JSON.parse(localStorage.getItem(KEY_STUDENTS) || 'null');
if(!Array.isArray(students) || students.length===0){
  students = DEFAULT_STUDENTS.map(s=>({...s}));
  localStorage.setItem(KEY_STUDENTS, JSON.stringify(students));
}
let attendance = JSON.parse(localStorage.getItem(KEY_ATT) || '{}');
let scanTimes = JSON.parse(localStorage.getItem(KEY_SCANS) || '{}');
let qrScanner = null;
let qrCameraRunning = false;
let currentQrStudentId = null;
let lastQrValue = '';
let lastQrAt = 0;

const statusOptions = [
  {key:'present', label:'Hadir'},
  {key:'late', label:'Lewat'},
  {key:'absent', label:'Tidak Hadir'},
  {key:'mc', label:'MC'},
  {key:'leave', label:'Cuti'}
];
const datePicker = document.getElementById('datePicker');

function getCloudConfig(){
  return {
    url:(localStorage.getItem(KEY_GOOGLE_EXEC_URL)||'').trim(),
    key:(localStorage.getItem(KEY_GOOGLE_SYNC_KEY)||'').trim()
  };
}
function normalizeExecUrl(url){
  url=String(url||'').trim();
  if(!url) return '';
  return url.replace(/\/+$/,'');
}
function isGoogleCloudAvailable(){
  const c=getCloudConfig();
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/(exec|dev)$/i.test(c.url) && c.key.length>=16;
}
function setCloudDirty(value){
  cloudDirty = !!value;
  if(cloudDirty) localStorage.setItem(KEY_GOOGLE_DIRTY,'1');
  else localStorage.removeItem(KEY_GOOGLE_DIRTY);
}
function setCloudStatus(mode,text){
  const badge=document.getElementById('cloudBadge');
  if(!badge) return;
  badge.className='cloud-badge '+mode;
  badge.textContent='● '+text;
  const acct=document.getElementById('cloudAccountText');
  if(acct){
    const suffix=lastCloudSyncAt ? ` • Sync terakhir ${lastCloudSyncAt}` : '';
    acct.textContent=text+suffix;
  }
}
function fillCloudForm(){
  const c=getCloudConfig();
  const urlInput=document.getElementById('googleExecUrlInput');
  const keyInput=document.getElementById('googleSyncKeyInput');
  if(urlInput) urlInput.value=c.url;
  if(keyInput) keyInput.value=c.key;
  const acct=document.getElementById('cloudAccountText');
  if(!acct) return;
  if(!c.url || !c.key) acct.textContent='Masukkan Web App URL /exec dan Sync Key.';
  else if(lastCloudError) acct.textContent='Ralat Cloud: '+lastCloudError;
  else acct.textContent=lastCloudSyncAt ? `Sambungan disimpan • Sync terakhir ${lastCloudSyncAt}` : 'Sambungan disimpan. Tekan Uji Cloud.';
}
function openCloudDialog(){
  fillCloudForm();
  document.getElementById('cloudDialog').showModal();
}
function saveCloudConfig(){
  const url=normalizeExecUrl(document.getElementById('googleExecUrlInput').value);
  const key=document.getElementById('googleSyncKeyInput').value.trim();
  if(!/^https:\/\/script\.google\.com\/macros\/s\/.+\/(exec|dev)$/i.test(url)){
    alert('Masukkan URL Google Apps Script Web App yang berakhir dengan /exec.');
    return false;
  }
  if(key.length<16){
    alert('Sync Key tidak sah. Gunakan Sync Key yang dipaparkan oleh setupPemulihan().');
    return false;
  }
  localStorage.setItem(KEY_GOOGLE_EXEC_URL,url);
  localStorage.setItem(KEY_GOOGLE_SYNC_KEY,key);
  lastCloudError='';
  setCloudStatus('offline','Sedia untuk diuji');
  fillCloudForm();
  toast('Sambungan Google disimpan');
  return true;
}

const cloudRequests=new Map();
window.addEventListener('message',event=>{
  const msg=event.data;
  if(!msg || msg.source!==CLOUD_BRIDGE_SOURCE || !msg.requestId) return;
  const pending=cloudRequests.get(msg.requestId);
  if(!pending || pending.nonce!==msg.nonce) return;
  cloudRequests.delete(msg.requestId);
  clearTimeout(pending.timer);
  try{ pending.iframe?.remove(); }catch(e){}
  try{ pending.form?.remove(); }catch(e){}
  if(msg.ok) pending.resolve(msg.result);
  else pending.reject(new Error(msg.error||'Ralat Google Cloud'));
});
function randomToken(){
  if(window.crypto && crypto.getRandomValues){
    const a=new Uint32Array(4); crypto.getRandomValues(a);
    return Array.from(a,x=>x.toString(16).padStart(8,'0')).join('');
  }
  return Date.now().toString(16)+Math.random().toString(16).slice(2)+Math.random().toString(16).slice(2);
}
function gsCall(functionName,...args){
  return new Promise((resolve,reject)=>{
    const c=getCloudConfig();
    if(!isGoogleCloudAvailable()){
      reject(new Error('Cloud belum diset. Masukkan Web App URL /exec dan Sync Key dalam Cloud Sync.'));
      return;
    }
    if(location.protocol!=='https:'){
      reject(new Error('Buka sistem melalui GitHub Pages HTTPS.'));
      return;
    }
    const requestId='r_'+randomToken();
    const nonce=randomToken();
    const frameName='pemulihan_cloud_'+requestId;
    const iframe=document.createElement('iframe');
    iframe.name=frameName;
    iframe.style.display='none';
    iframe.setAttribute('aria-hidden','true');
    document.body.appendChild(iframe);
    const form=document.createElement('form');
    form.method='POST';
    form.action=c.url;
    form.target=frameName;
    form.style.display='none';
    const fields={mode:'bridge',source:CLOUD_BRIDGE_SOURCE,requestId,nonce,origin:location.origin,key:c.key,functionName,args:JSON.stringify(args)};
    Object.entries(fields).forEach(([name,value])=>{
      const input=document.createElement('input');
      input.type='hidden'; input.name=name; input.value=value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    const timer=setTimeout(()=>{
      cloudRequests.delete(requestId);
      try{iframe.remove();}catch(e){}
      try{form.remove();}catch(e){}
      reject(new Error('Cloud timeout. Semak deployment Apps Script: Execute as Me, access Anyone, dan gunakan URL /exec.'));
    },CLOUD_REQUEST_TIMEOUT_MS);
    cloudRequests.set(requestId,{resolve,reject,nonce,timer,iframe,form});
    form.submit();
  });
}
function noteCloudSync(){
  lastCloudError='';
  lastCloudSyncAt=new Date().toLocaleTimeString('ms-MY',{hour:'2-digit',minute:'2-digit'});
}
async function testCloudConnection(){
  if(!isGoogleCloudAvailable()){
    if(!saveCloudConfig()) return;
  }
  setCloudStatus('syncing','Menguji sambungan...');
  try{
    const result=await gsCall('ping');
    noteCloudSync();
    setCloudStatus('online','Google Cloud aktif');
    fillCloudForm();
    alert('Sambungan berjaya. Database: '+(result.spreadsheetName||'Google Sheet'));
  }catch(err){
    lastCloudError=err && err.message ? err.message : String(err);
    setCloudStatus('offline','Cloud gagal');
    fillCloudForm();
    alert('Sambungan gagal:\n\n'+lastCloudError);
  }
}
function applyCloudRows(rows){
  if(!rows) return;
  students=(rows.students||[]).map(r=>({id:r.student_id,name:r.name,...(r.photo?{photo:r.photo}:{})}));
  attendance={}; scanTimes={};
  (rows.attendance||[]).forEach(r=>{
    if(!attendance[r.date]) attendance[r.date]={};
    attendance[r.date][r.student_id]=r.status;
    if(r.scan_time){ if(!scanTimes[r.date]) scanTimes[r.date]={}; scanTimes[r.date][r.student_id]=r.scan_time; }
  });
  if(rows.settings && rows.settings.teacher_pin) localStorage.setItem(KEY_PIN,rows.settings.teacher_pin);
  saveStudents(); saveAttendance(); saveScanTimes(); render(); noteCloudSync();
}
function flattenAttendance(){
  const rows=[];
  Object.entries(attendance).forEach(([date,rec])=>{
    Object.entries(rec||{}).forEach(([studentId,status])=>{
      if(!status) return;
      rows.push({date,student_id:studentId,status,scan_time:(scanTimes[date]||{})[studentId]||null});
    });
  });
  return rows;
}
function cloudPayload(){
  return {students:students.map(s=>({student_id:s.id,name:s.name,photo:s.photo||null})),attendance:flattenAttendance(),teacher_pin:currentPin()};
}
async function cloudUploadCurrentAll(replace=false){
  if(!isGoogleCloudAvailable()){ setCloudDirty(true); return; }
  setCloudStatus('syncing','Menyimpan ke Google...');
  try{
    await gsCall(replace?'replaceAllData':'mergeAllData',cloudPayload());
    setCloudDirty(false); noteCloudSync(); setCloudStatus('online','Google Cloud aktif');
  }catch(err){
    console.error(err); setCloudDirty(true); setCloudStatus('offline','Sync gagal'); throw err;
  }
}
async function cloudInitialSync(){
  if(!isGoogleCloudAvailable()){ setCloudStatus('offline','Cloud belum diset'); return; }
  if(cloudLoading) return;
  cloudLoading=true; setCloudStatus('syncing','Menyambung Google...');
  try{
    if(cloudDirty){ await gsCall('mergeAllData',cloudPayload()); setCloudDirty(false); }
    const rows=await gsCall('getAllData');
    const cloudEmpty=((rows.students||[]).length===0 && (rows.attendance||[]).length===0);
    if(cloudEmpty && (students.length || flattenAttendance().length)){ await gsCall('mergeAllData',cloudPayload()); noteCloudSync(); }
    else applyCloudRows(rows);
    setCloudStatus('online','Google Cloud aktif');
  }catch(err){
    console.error(err); lastCloudError=err && err.message ? err.message : String(err); setCloudStatus('offline','Google Cloud gagal'); fillCloudForm();
  }finally{ cloudLoading=false; }
}
async function cloudWrite(functionName,...args){
  if(!isGoogleCloudAvailable()){ setCloudDirty(true); setCloudStatus('offline','Local • belum sync'); return; }
  cloudPendingWrites++; setCloudStatus('syncing','Menyimpan...');
  try{ await gsCall(functionName,...args); noteCloudSync(); setCloudStatus('online','Google Cloud aktif'); }
  catch(err){ console.error(err); setCloudDirty(true); setCloudStatus('offline','Local • belum sync'); }
  finally{ cloudPendingWrites=Math.max(0,cloudPendingWrites-1); }
}
function cloudUpsertStudent(s){ if(s) cloudWrite('upsertStudent',{student_id:s.id,name:s.name,photo:s.photo||null}); }
function cloudDeleteStudentData(id){ cloudWrite('deleteStudentData',id); }
function cloudUpsertAttendance(date,id,status,scanTime=null){ cloudWrite('upsertAttendance',date,id,status||'',scanTime||''); }
function cloudUpsertManyAttendance(date,ids,status){
  const rows=(ids||[]).map(id=>({student_id:id,status,scan_time:(scanTimes[date]||{})[id]||''}));
  cloudWrite('upsertManyAttendance',date,rows);
}
function cloudDeleteDay(date){ cloudWrite('deleteDay',date); }
function cloudSavePin(pin){ cloudWrite('saveTeacherPin',pin); }
async function syncCloudNow(){
  if(!isGoogleCloudAvailable()){ openCloudDialog(); return; }
  setCloudStatus('syncing','Sync...');
  try{
    if(cloudDirty) await cloudUploadCurrentAll(false);
    const rows=await gsCall('getAllData');
    applyCloudRows(rows); setCloudStatus('online','Google Cloud aktif'); fillCloudForm(); toast('Google Cloud sudah sync');
  }catch(err){ setCloudStatus('offline','Sync gagal'); alert('Sync gagal: '+err.message); }
}
async function uploadDeviceToCloud(){
  if(!isGoogleCloudAvailable()){ openCloudDialog(); return; }
  if(!confirm('Gantikan data Google Cloud dengan data pada device ini?\n\nGunakan fungsi ini jika data device ini ialah salinan yang paling lengkap.')) return;
  try{ await cloudUploadCurrentAll(true); fillCloudForm(); toast('Data device dihantar ke Google Cloud'); }
  catch(err){ alert('Upload gagal: '+err.message); }
}
async function downloadCloudToDevice(){
  if(!isGoogleCloudAvailable()){ openCloudDialog(); return; }
  if(!confirm('Gantikan data pada device ini dengan data terkini dari Google Cloud?')) return;
  try{
    const rows=await gsCall('getAllData'); applyCloudRows(rows); setCloudDirty(false); setCloudStatus('online','Google Cloud aktif'); fillCloudForm(); toast('Data Google Cloud dimuat turun');
  }catch(err){ alert('Download gagal: '+err.message); }
}
function startCloudPolling(){
  clearInterval(cloudPollTimer);
  if(!isGoogleCloudAvailable()) return;
  cloudPollTimer=setInterval(async()=>{
    if(document.hidden || cloudLoading || cloudPendingWrites>0) return;
    try{
      if(cloudDirty){ await cloudUploadCurrentAll(false); return; }
      const rows=await gsCall('getAllData'); applyCloudRows(rows); setCloudStatus('online','Google Cloud aktif');
    }catch(err){ console.error(err); setCloudStatus('offline','Sync terganggu'); }
  },CLOUD_POLL_MS);
}
async function initCloud(){
  if(!isGoogleCloudAvailable()){ setCloudStatus('offline','Cloud belum diset'); return; }
  await cloudInitialSync(); startCloudPolling();
}
window.addEventListener('online',async()=>{
  if(isGoogleCloudAvailable()){
    try{ if(cloudDirty) await cloudUploadCurrentAll(false); await cloudInitialSync(); }catch(e){}
  }
});
window.addEventListener('focus',()=>{
  if(isGoogleCloudAvailable() && !cloudLoading && cloudPendingWrites===0) cloudInitialSync();
});
