function qrPayloadFor(id){
  return `PEMULIHAN|${id}`;
}
function parseQrPayload(text){
  const value=String(text||'').trim();
  if(!value.startsWith('PEMULIHAN|')) return null;
  return value.slice('PEMULIHAN|'.length);
}
function showStudentQR(id){
  const s=students.find(x=>x.id===id);
  if(!s) return;
  if(typeof QRCode==='undefined') return toast('QR library belum tersedia. Pastikan internet aktif.');
  currentQrStudentId=id;
  document.getElementById('qrStudentName').textContent=s.name;
  const box=document.getElementById('qrCodeBox');
  box.innerHTML='';
  new QRCode(box,{text:qrPayloadFor(id),width:210,height:210,correctLevel:QRCode.CorrectLevel.H});
  document.getElementById('qrDialog').showModal();
}
function printCurrentQR(){
  const s=students.find(x=>x.id===currentQrStudentId);
  const box=document.getElementById('qrCodeBox');
  if(!s || !box) return;
  const canvas=box.querySelector('canvas');
  const img=box.querySelector('img');
  const src=canvas ? canvas.toDataURL('image/png') : (img ? img.src : '');
  if(!src) return toast('QR belum siap');
  const w=window.open('','_blank','width=500,height=650');
  w.document.write(`
    <html><head><title>Kad QR - ${escapeHtml(s.name)}</title>
    <style>body{font-family:Arial,sans-serif;text-align:center;padding:35px}.card{border:2px solid #222;border-radius:18px;padding:24px;max-width:320px;margin:auto}img{width:220px;height:220px}h2{margin:14px 0 4px;font-size:22px}p{margin:0;color:#555}</style></head>
    <body><div class="card"><img src="${src}" alt="QR"><h2>${escapeHtml(s.name)}</h2><p>Kelas Pemulihan</p></div>
    <script>window.onload=()=>{window.print();}<\/script></body></html>`);
  w.document.close();
}
function printAllQR(){
  if(!students.length) return toast('Tiada murid');
  if(typeof QRCode==='undefined') return toast('QR library belum tersedia. Pastikan internet aktif.');
  const w=window.open('','_blank');
  w.document.write(`
    <html><head><title>Kad QR Kelas Pemulihan</title>
    <style>body{font-family:Arial,sans-serif;padding:20px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.card{border:1.5px solid #222;border-radius:14px;padding:14px;text-align:center;break-inside:avoid}.qr{display:flex;justify-content:center;min-height:180px}.qr canvas,.qr img{width:180px!important;height:180px!important}h3{margin:8px 0 2px;font-size:17px}p{margin:0;font-size:12px;color:#555}@media print{body{padding:0}.grid{gap:10px}}</style></head><body><div class="grid" id="allQrGrid"></div></body></html>`);
  w.document.close();
  const build=()=>{
    const grid=w.document.getElementById('allQrGrid');
    students.forEach(s=>{
      const card=w.document.createElement('div'); card.className='card';
      const q=w.document.createElement('div'); q.className='qr';
      const name=w.document.createElement('h3'); name.textContent=s.name;
      const p=w.document.createElement('p'); p.textContent='Kelas Pemulihan';
      card.appendChild(q); card.appendChild(name); card.appendChild(p); grid.appendChild(card);
      const temp=document.createElement('div'); temp.style.position='fixed'; temp.style.left='-9999px'; document.body.appendChild(temp);
      new QRCode(temp,{text:qrPayloadFor(s.id),width:180,height:180,correctLevel:QRCode.CorrectLevel.H});
      setTimeout(()=>{
        const c=temp.querySelector('canvas'); const im=temp.querySelector('img');
        const out=w.document.createElement('img'); out.src=c?c.toDataURL('image/png'):(im?im.src:''); out.width=180; out.height=180;
        q.innerHTML=''; q.appendChild(out); temp.remove();
      },120);
    });
    setTimeout(()=>w.print(),900);
  };
  setTimeout(build,120);
}
function playSuccessSound(){
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if(!AudioCtx) return;
    const ctx = new AudioCtx(); const now = ctx.currentTime;
    [{f:523.25,t:0.00,d:0.12},{f:659.25,t:0.10,d:0.12},{f:783.99,t:0.20,d:0.18}].forEach(n=>{
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type='sine'; osc.frequency.setValueAtTime(n.f,now+n.t);
      gain.gain.setValueAtTime(0.0001,now+n.t); gain.gain.exponentialRampToValueAtTime(0.20,now+n.t+0.015); gain.gain.exponentialRampToValueAtTime(0.0001,now+n.t+n.d);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(now+n.t); osc.stop(now+n.t+n.d+0.02);
    });
    setTimeout(()=>ctx.close(),700);
  }catch(e){}
}
function recordQrAttendance(raw){
  const now=Date.now();
  if(raw===lastQrValue && now-lastQrAt<1800) return;
  lastQrValue=raw; lastQrAt=now;
  const id=parseQrPayload(raw);
  if(!id){ updateScanStatus('QR tidak dikenali. Gunakan Kad QR yang dijana oleh sistem ini.', false); return; }
  const s=students.find(x=>x.id===id);
  if(!s){ updateScanStatus('QR sah tetapi murid ini tiada dalam senarai.', false); return; }
  const date=datePicker.value; const rec=dayRecord(date); const already=rec[id]==='present'; rec[id]='present';
  if(!scanTimes[date]) scanTimes[date]={};
  const time=new Date().toLocaleTimeString('ms-MY',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  scanTimes[date][id]=time; saveAttendance(); saveScanTimes(); render(); cloudUpsertAttendance(date,id,'present',time); playSuccessSound();
  updateScanStatus(`${already?'✓ Sudah direkod':'✓ Kehadiran direkod'}: ${s.name} • ${time}`, true); renderScanLog();
}
function updateScanStatus(msg,ok=true){
  const el=document.getElementById('scanStatus'); el.textContent=msg; el.style.background=ok?'#dcfce7':'#fee2e2'; el.style.color=ok?'#166534':'#991b1b';
}
function renderScanLog(){
  const date=datePicker.value; const data=scanTimes[date]||{};
  const entries=Object.entries(data).map(([id,time])=>({s:students.find(x=>x.id===id),time})).filter(x=>x.s).sort((a,b)=>String(b.time).localeCompare(String(a.time))).slice(0,8);
  const wrap=document.getElementById('scanLogList');
  if(!entries.length){ wrap.innerHTML='Belum ada scan.'; return; }
  wrap.innerHTML=entries.map(x=>`<div class="scan-log-item"><span><b>${escapeHtml(x.s.name)}</b></span><span>${x.time}</span></div>`).join('');
}
function openScanner(){
  document.getElementById('scannerDialog').showModal(); updateScanStatus('Tekan “Mula Kamera” atau guna gambar QR.', true); renderScanLog();
}
async function startQrCamera(){
  if(typeof Html5Qrcode==='undefined'){ updateScanStatus('QR scanner library belum tersedia. Pastikan internet aktif.', false); return; }
  if(qrCameraRunning) return;
  try{
    qrScanner = qrScanner || new Html5Qrcode('qrReader');
    await qrScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:230,height:230}},decodedText=>recordQrAttendance(decodedText),()=>{});
    qrCameraRunning=true; updateScanStatus('Kamera aktif. Halakan pada QR murid.', true);
  }catch(err){ updateScanStatus('Kamera tidak dapat dibuka. Cuba “Scan dari Gambar” atau buka site melalui HTTPS.', false); }
}
async function stopQrCamera(){
  if(qrScanner && qrCameraRunning){ try{ await qrScanner.stop(); }catch(e){} qrCameraRunning=false; updateScanStatus('Kamera dihentikan.', true); }
}
async function closeScanner(){ await stopQrCamera(); document.getElementById('scannerDialog').close(); }
document.getElementById('qrFileInput').addEventListener('change', async e=>{
  const file=e.target.files && e.target.files[0]; if(!file) return;
  if(typeof Html5Qrcode==='undefined'){ updateScanStatus('QR scanner library belum tersedia. Pastikan internet aktif.', false); return; }
  try{
    if(qrCameraRunning) await stopQrCamera();
    qrScanner = qrScanner || new Html5Qrcode('qrReader');
    const decoded=await qrScanner.scanFile(file,true); recordQrAttendance(decoded);
  }catch(err){ updateScanStatus('QR tidak dapat dibaca daripada gambar itu.', false); }
  e.target.value='';
});
function processManualQr(){
  const input=document.getElementById('manualQrInput'); const value=input.value.trim(); if(!value) return; recordQrAttendance(value); input.value=''; input.focus();
}
document.getElementById('manualQrInput').addEventListener('keydown',e=>{ if(e.key==='Enter') processManualQr(); });
