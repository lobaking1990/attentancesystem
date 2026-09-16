function localDateString(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off*60*1000).toISOString().slice(0,10);
}
datePicker.value = localDateString();

function saveStudents(){
  localStorage.setItem(KEY_STUDENTS, JSON.stringify(students));
}
function saveAttendance(){
  localStorage.setItem(KEY_ATT, JSON.stringify(attendance));
}
function saveScanTimes(){
  localStorage.setItem(KEY_SCANS, JSON.stringify(scanTimes));
}
function dayRecord(date){
  if(!attendance[date]) attendance[date] = {};
  return attendance[date];
}
function initials(name){
  return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('');
}
function formatDate(dateStr){
  if(!dateStr) return '';
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(y,m-1,d);
  return dt.toLocaleDateString('ms-MY',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1800);
}

function render(){
  const date = datePicker.value;
  document.getElementById('dateLabel').textContent = formatDate(date);
  const dayScans = scanTimes[date] || {};
  const latest = Object.entries(dayScans).sort((a,b)=>String(b[1]).localeCompare(String(a[1])))[0];
  document.getElementById('lastScanLabel').textContent = latest ? `Scan QR terakhir: ${latest[1]}` : '';
  const wrap = document.getElementById('studentList');
  const rec = dayRecord(date);

  if(!students.length){
    wrap.innerHTML = `
      <div class="empty">
        <div class="big">👩‍🏫</div>
        <b>Belum ada murid.</b><br>
        Tekan <b>Tambah Murid</b> untuk mula.
      </div>`;
  } else {
    wrap.innerHTML = students.map((s,i)=>{
      const active = rec[s.id] || '';
      return `
      <div class="student-row">
        <div class="student-info">
          <div class="photo-wrap">
            ${s.photo
              ? `<img class="student-photo" src="${s.photo}" alt="${escapeHtml(s.name)}">`
              : `<div class="avatar">${initials(s.name)}</div>`}
            <button class="photo-btn" title="Tambah / tukar gambar" onclick="choosePhoto('${s.id}')">📷</button>
          </div>
          <div>
            <div class="student-name">${escapeHtml(s.name)}</div>
            <div class="panel-note">Murid ${i+1}</div>
          </div>
        </div>
        <div>
          <div class="status-group">
            ${statusOptions.map(o=>`
              <button class="status ${o.key} ${active===o.key?'active':''}"
                onclick="setStatus('${s.id}','${o.key}')">${o.label}</button>
            `).join('')}
          </div>
          <div class="qr-actions" style="margin-top:6px">
            <button class="qr-mini" onclick="showStudentQR('${s.id}')">▦ Kad QR</button>
          </div>
        </div>
        <button class="delete" title="Padam murid" onclick="deleteStudent('${s.id}')">✕</button>
      </div>`;
    }).join('');
  }

  updateStats();
  renderHistory();
}
function escapeHtml(str){
  return str.replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function setStatus(id,status){
  const date=datePicker.value;
  const rec = dayRecord(date);
  rec[id] = rec[id] === status ? '' : status;
  saveAttendance();
  render();
  cloudUpsertAttendance(date,id,rec[id]||null,(scanTimes[date]||{})[id]||null);
}
function updateStats(){
  const rec = dayRecord(datePicker.value);
  const values = Object.values(rec);
  document.getElementById('totalCount').textContent = students.length;
  document.getElementById('presentCount').textContent = values.filter(x=>x==='present').length;
  document.getElementById('lateCount').textContent = values.filter(x=>x==='late').length;
  document.getElementById('absentCount').textContent = values.filter(x=>x==='absent').length;
  document.getElementById('otherCount').textContent = values.filter(x=>x==='mc'||x==='leave').length;
}

function openAdd(){
  document.getElementById('addDialog').showModal();
  setTimeout(()=>document.getElementById('studentName').focus(),50);
}
function closeAdd(){document.getElementById('addDialog').close()}
function addStudent(){
  const input=document.getElementById('studentName');
  const name=input.value.trim();
  if(!name) return;
  const newStudent={id:'s'+Date.now()+Math.random().toString(16).slice(2), name};
  students.push(newStudent);
  saveStudents();
  cloudUpsertStudent(newStudent);
  input.value='';
  closeAdd();
  render();
  toast('Murid ditambah');
}
function deleteStudent(id){
  const s=students.find(x=>x.id===id);
  if(!s) return;
  if(!confirm(`Padam ${s.name} daripada senarai murid?`)) return;
  students=students.filter(x=>x.id!==id);
  Object.keys(attendance).forEach(d=>{ if(attendance[d]) delete attendance[d][id]; });
  Object.keys(scanTimes).forEach(d=>{ if(scanTimes[d]) delete scanTimes[d][id]; });
  saveStudents(); saveAttendance(); saveScanTimes(); render();
  cloudDeleteStudentData(id);
  toast('Murid dipadam');
}
function markAllPresent(){
  if(!students.length) return toast('Tambah murid dahulu');
  const rec=dayRecord(datePicker.value);
  students.forEach(s=>rec[s.id]='present');
  saveAttendance(); render();
  cloudUpsertManyAttendance(datePicker.value,students.map(s=>s.id),'present');
  toast('Semua murid ditanda hadir');
}
function clearDay(){
  if(!confirm('Kosongkan semua rekod kehadiran untuk tarikh ini?')) return;
  attendance[datePicker.value]={};
  scanTimes[datePicker.value]={};
  saveAttendance(); saveScanTimes(); render();
  cloudDeleteDay(datePicker.value);
  toast('Rekod tarikh dikosongkan');
}

function renderHistory(){
  const tbody=document.getElementById('historyBody');
  const dates=Object.keys(attendance)
    .filter(d=>Object.values(attendance[d]||{}).some(Boolean))
    .sort((a,b)=>b.localeCompare(a))
    .slice(0,10);

  if(!dates.length){
    tbody.innerHTML='<tr><td colspan="5" style="color:#64748b;text-align:center;padding:24px">Belum ada rekod.</td></tr>';
    return;
  }
  tbody.innerHTML=dates.map(d=>{
    const vals=Object.values(attendance[d]||{});
    const p=vals.filter(x=>x==='present').length;
    const l=vals.filter(x=>x==='late').length;
    const a=vals.filter(x=>x==='absent').length;
    const o=vals.filter(x=>x==='mc'||x==='leave').length;
    return `<tr>
      <td><b>${formatDate(d)}</b></td>
      <td><span class="tag present">${p}</span></td>
      <td><span class="tag late">${l}</span></td>
      <td><span class="tag absent">${a}</span></td>
      <td><span class="tag mc">${o}</span></td>
    </tr>`;
  }).join('');
}

function csvEscape(v){
  const s=String(v??'');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function exportCSV(){
  if(!students.length) return toast('Tiada murid untuk dieksport');
  const statusLabel = Object.fromEntries(statusOptions.map(x=>[x.key,x.label]));
  const dates=Object.keys(attendance).sort();
  let rows=[['Tarikh','Nama Murid','Status']];
  dates.forEach(d=>{
    students.forEach(s=>{
      const st=(attendance[d]||{})[s.id];
      if(st) rows.push([d,s.name,statusLabel[st]||st]);
    });
  });
  if(rows.length===1) return toast('Belum ada rekod kehadiran');
  const csv='\uFEFF'+rows.map(r=>r.map(csvEscape).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='rekod_kehadiran_pemulihan.csv';
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(url);
  toast('CSV dieksport');
}
