document.getElementById('backupImportInput').addEventListener('change',e=>{
  const file=e.target.files && e.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const parsed=JSON.parse(ev.target.result);
      const checked=validateBackup(parsed);
      const backupDate=checked.exportedAt ? new Date(checked.exportedAt).toLocaleString('ms-MY') : 'Tidak diketahui';
      const ok=confirm(
        `RESTORE FULL BACKUP\n\n`+
        `Backup dibuat: ${backupDate}\n`+
        `Jumlah murid: ${checked.students.length}\n\n`+
        `Data pada device ini akan digantikan dengan data daripada backup.\n`+
        `Teruskan?`
      );
      if(!ok) return;
      restoreFullBackup(checked);
      alert(
        `Restore selesai.\n\n`+
        `Murid: ${students.length}\n`+
        `Rekod kehadiran, gambar murid, QR ID, masa scan dan PIN Guru telah dipulihkan.\n\n`+
        `Anda mungkin perlu unlock semula menggunakan PIN daripada backup.`
      );
    }catch(err){
      alert('Restore gagal: '+(err.message||err));
    }finally{
      e.target.value='';
    }
  };
  reader.onerror=()=>{
    alert('Fail backup tidak dapat dibaca.');
    e.target.value='';
  };
  reader.readAsText(file,'UTF-8');
});

function parseCSVLine(line){
  const out=[];
  let cur='', inQuotes=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(inQuotes && line[i+1]==='"'){
        cur+='"';
        i++;
      }else{
        inQuotes=!inQuotes;
      }
    }else if(ch===',' && !inQuotes){
      out.push(cur);
      cur='';
    }else{
      cur+=ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeStatusLabel(value){
  const v=String(value||'').trim().toLowerCase();
  const map={
    'hadir':'present',
    'present':'present',
    'lewat':'late',
    'late':'late',
    'tidak hadir':'absent',
    'absent':'absent',
    'mc':'mc',
    'cuti':'leave',
    'leave':'leave'
  };
  return map[v] || null;
}

function normalizeName(name){
  return String(name||'').trim().replace(/\s+/g,' ').toLowerCase();
}

function createImportedStudent(name){
  const clean=String(name||'').trim().replace(/\s+/g,' ');
  const id='imp_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  const s={id,name:clean};
  students.push(s);
  return s;
}

function importAttendanceCSV(text){
  text=String(text||'').replace(/^\uFEFF/,'').trim();
  if(!text) throw new Error('Fail CSV kosong.');
  const lines=text.split(/\r?\n/).filter(x=>x.trim()!=='');
  if(lines.length<2) throw new Error('CSV tidak mempunyai rekod.');
  const header=parseCSVLine(lines[0]).map(x=>x.trim().toLowerCase());
  const dateIdx=header.indexOf('tarikh');
  const nameIdx=header.indexOf('nama murid');
  const statusIdx=header.indexOf('status');
  if(dateIdx<0 || nameIdx<0 || statusIdx<0){
    throw new Error('Format CSV tidak dikenali. Gunakan fail yang dieksport dari sistem ini.');
  }
  let imported=0, skipped=0, newStudents=0;
  const nameMap=new Map(students.map(s=>[normalizeName(s.name),s]));
  for(let i=1;i<lines.length;i++){
    const cols=parseCSVLine(lines[i]);
    const date=(cols[dateIdx]||'').trim();
    const name=(cols[nameIdx]||'').trim();
    const status=normalizeStatusLabel(cols[statusIdx]);
    if(!date || !name || !status || !/^\d{4}-\d{2}-\d{2}$/.test(date)){
      skipped++;
      continue;
    }
    let student=nameMap.get(normalizeName(name));
    if(!student){
      student=createImportedStudent(name);
      nameMap.set(normalizeName(name),student);
      newStudents++;
    }
    if(!attendance[date]) attendance[date]={};
    attendance[date][student.id]=status;
    imported++;
  }
  saveStudents();
  saveAttendance();
  render();
  if(isGoogleCloudAvailable()){
    cloudUploadCurrentAll(false).catch(err=>console.error(err));
  }
  return {imported, skipped, newStudents};
}

document.getElementById('csvImportInput').addEventListener('change', e=>{
  const file=e.target.files && e.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const result=importAttendanceCSV(ev.target.result);
      let msg=`Import berjaya: ${result.imported} rekod`;
      if(result.newStudents) msg+=`, ${result.newStudents} murid baharu`;
      if(result.skipped) msg+=`, ${result.skipped} baris diabaikan`;
      toast(msg);
      alert(
        `Import CSV selesai.\n\n`+
        `Rekod dipulihkan: ${result.imported}\n`+
        `Murid baharu ditambah: ${result.newStudents}\n`+
        `Baris diabaikan: ${result.skipped}\n\n`+
        `Nota: gambar murid, PIN Guru dan masa scan QR tidak disimpan dalam CSV.`
      );
    }catch(err){
      alert('Import gagal: '+(err.message||err));
    }finally{
      e.target.value='';
    }
  };
  reader.onerror=()=>{
    alert('Fail CSV tidak dapat dibaca.');
    e.target.value='';
  };
  reader.readAsText(file,'UTF-8');
});

datePicker.addEventListener('change',render);
document.getElementById('studentName').addEventListener('keydown',e=>{
  if(e.key==='Enter') addStudent();
});

render();
initLock();
initCloud();
