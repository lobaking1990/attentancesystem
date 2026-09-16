function choosePhoto(id){
  selectedPhotoStudentId = id;
  const input = document.getElementById('photoInput');
  input.value = '';
  input.click();
}

document.getElementById('photoInput').addEventListener('change', e=>{
  const file = e.target.files && e.target.files[0];
  if(!file || !selectedPhotoStudentId) return;
  if(!file.type.startsWith('image/')) return toast('Sila pilih fail gambar');

  const reader = new FileReader();
  reader.onload = ev=>{
    const img = new Image();
    img.onload = ()=>{
      let max = 220;
      let quality = 0.68;
      let data = '';
      for(let attempt=0;attempt<5;attempt++){
        let w = img.width, h = img.height;
        if(w > h){
          if(w > max){ h = Math.round(h * max / w); w = max; }
        }else{
          if(h > max){ w = Math.round(w * max / h); h = max; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        data = canvas.toDataURL('image/jpeg',quality);
        if(data.length < 45000) break;
        max = Math.max(120,Math.round(max*0.82));
        quality = Math.max(0.45,quality-0.08);
      }
      if(data.length >= 50000){
        selectedPhotoStudentId = null;
        return toast('Gambar masih terlalu besar. Cuba gambar lain.');
      }
      const s = students.find(x=>x.id===selectedPhotoStudentId);
      if(s){
        s.photo = data;
        try{
          saveStudents();
          render();
          cloudUpsertStudent(s);
          toast('Gambar murid disimpan');
        }catch(err){
          toast('Storan penuh. Cuba gambar lebih kecil.');
        }
      }
      selectedPhotoStudentId = null;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

function currentPin(){
  return localStorage.getItem(KEY_PIN) || DEFAULT_PIN;
}
function isValidPin(pin){
  return /^\d{4,8}$/.test(pin);
}
function lockApp(){
  sessionStorage.removeItem('pemulihan_unlocked');
  document.getElementById('unlockPin').value='';
  document.getElementById('lockError').textContent='';
  document.getElementById('lockScreen').classList.remove('hidden');
  setTimeout(()=>document.getElementById('unlockPin').focus(),50);
}
function unlockApp(){
  const pin=document.getElementById('unlockPin').value.trim();
  if(pin===currentPin()){
    sessionStorage.setItem('pemulihan_unlocked','1');
    document.getElementById('lockScreen').classList.add('hidden');
    document.getElementById('lockError').textContent='';
    document.getElementById('unlockPin').value='';
  }else{
    document.getElementById('lockError').textContent='PIN tidak betul.';
    document.getElementById('unlockPin').select();
  }
}
function openPinDialog(){
  document.getElementById('oldPin').value='';
  document.getElementById('newPin').value='';
  document.getElementById('confirmPin').value='';
  document.getElementById('pinDialog').showModal();
  setTimeout(()=>document.getElementById('oldPin').focus(),50);
}
function closePinDialog(){document.getElementById('pinDialog').close()}
function changePin(){
  const oldPin=document.getElementById('oldPin').value.trim();
  const newPin=document.getElementById('newPin').value.trim();
  const confirmPin=document.getElementById('confirmPin').value.trim();
  if(oldPin!==currentPin()) return toast('PIN semasa tidak betul');
  if(!isValidPin(newPin)) return toast('PIN baharu mesti 4–8 digit');
  if(newPin!==confirmPin) return toast('Pengesahan PIN tidak sama');
  localStorage.setItem(KEY_PIN,newPin);
  cloudSavePin(newPin);
  closePinDialog();
  toast('PIN Guru berjaya ditukar');
}
document.getElementById('unlockPin').addEventListener('keydown', e=>{
  if(e.key==='Enter') unlockApp();
});
function initLock(){
  if(sessionStorage.getItem('pemulihan_unlocked')==='1'){
    document.getElementById('lockScreen').classList.add('hidden');
  }else{
    document.getElementById('lockScreen').classList.remove('hidden');
  }
}

function exportFullBackup(){
  try{
    const payload={
      app:"Rekod Kehadiran Kelas Pemulihan",
      backupVersion:1,
      exportedAt:new Date().toISOString(),
      students:students,
      attendance:attendance,
      scanTimes:scanTimes,
      teacherPin:currentPin()
    };
    const data=JSON.stringify(payload,null,2);
    const blob=new Blob([data],{type:'application/json;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const date=localDateString();
    a.href=url;
    a.download=`pemulihan_full_backup_${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Full backup berjaya dibuat');
  }catch(err){
    alert('Backup gagal: '+(err.message||err));
  }
}

function validateBackup(data){
  if(!data || typeof data!=='object') throw new Error('Fail backup tidak sah.');
  if(data.app!=='Rekod Kehadiran Kelas Pemulihan') throw new Error('Fail ini bukan backup daripada sistem ini.');
  if(!Array.isArray(data.students)) throw new Error('Senarai murid tidak sah.');
  if(!data.attendance || typeof data.attendance!=='object') throw new Error('Data kehadiran tidak sah.');
  if(!data.scanTimes || typeof data.scanTimes!=='object') data.scanTimes={};
  if(typeof data.teacherPin!=='string' || !/^\d{4,8}$/.test(data.teacherPin)) data.teacherPin=DEFAULT_PIN;
  data.students.forEach((s,i)=>{
    if(!s || typeof s!=='object' || !s.id || !s.name){
      throw new Error(`Data murid pada rekod ${i+1} tidak sah.`);
    }
  });
  return data;
}

function restoreFullBackup(data){
  const backup=validateBackup(data);
  students=backup.students;
  attendance=backup.attendance;
  scanTimes=backup.scanTimes;
  localStorage.setItem(KEY_STUDENTS,JSON.stringify(students));
  localStorage.setItem(KEY_ATT,JSON.stringify(attendance));
  localStorage.setItem(KEY_SCANS,JSON.stringify(scanTimes));
  localStorage.setItem(KEY_PIN,backup.teacherPin);
  render();
  if(isGoogleCloudAvailable()){
    cloudUploadCurrentAll(true).catch(err=>{
      console.error(err);
      alert('Restore pada device berjaya, tetapi Google Cloud restore gagal: '+err.message);
    });
  }
  toast('Backup berjaya dipulihkan');
}
