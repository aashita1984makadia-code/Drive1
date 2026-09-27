let currentFolder="/";
const fileList=document.getElementById("fileList");
const message=document.getElementById("message");
const fileInput=document.getElementById("fileInput");
const dropzone=document.getElementById("dropzone");

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function formatSize(n){if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(1)+" KB";if(n<1073741824)return (n/1048576).toFixed(1)+" MB";return (n/1073741824).toFixed(2)+" GB"}
function icon(m,n){if(m==="application/x-folder")return "📁";if((m||"").startsWith("image/"))return "🖼️";if((m||"").includes("pdf"))return "📕";if((m||"").includes("zip"))return "🗜️";return "📄"}

async function load(){
 const me=await fetch("/api/me").then(r=>r.json());
 if(!me.loggedIn){location.href="/";return}
 document.getElementById("userName").textContent=me.username;
 const q=document.getElementById("search").value.trim();
 const rows=await fetch("/api/files?folder="+encodeURIComponent(currentFolder)+"&q="+encodeURIComponent(q)).then(r=>r.json());
 document.getElementById("breadcrumb").textContent=currentFolder;
 fileList.innerHTML="";
 if(!rows.length){fileList.innerHTML='<div class="empty">No files here yet.</div>';return}
 rows.forEach(f=>{
  const row=document.createElement("div");row.className="file-row";
  const folder=f.mime_type==="application/x-folder";
  row.innerHTML=`<div class="icon">${icon(f.mime_type,f.original_name)}</div>
  <div class="file-info"><div class="name">${esc(f.original_name)}</div><div class="meta">${folder?"Folder":formatSize(f.size)} · ${new Date(f.uploaded_at).toLocaleString()}</div></div>
  <div class="row-actions">
  ${folder?`<button title="Open">Open</button>`:`<button title="Download">Download</button>`}
  <button class="danger" title="Delete">Delete</button></div>`;
  row.querySelectorAll("button")[0].onclick=()=>folder?(currentFolder=(currentFolder+f.original_name+"/").replace("//","/"),load()):download(f.id);
  row.querySelector(".danger").onclick=()=>removeFile(f.id,f.original_name);
  fileList.appendChild(row);
 });
}
function download(id){location.href="/api/download/"+id}
async function removeFile(id,name){if(!confirm("Delete "+name+"?"))return;await fetch("/api/files/"+id,{method:"DELETE"});load();storage()}
async function upload(files){
 if(!files.length)return;
 const fd=new FormData();fd.append("folder",currentFolder);[...files].forEach(f=>fd.append("files",f));
 message.innerHTML='<div class="msg success">Uploading...</div>';
 const r=await fetch("/api/upload",{method:"POST",body:fd});const d=await r.json();
 message.innerHTML=r.ok?'<div class="msg success">Uploaded '+d.count+' file(s).</div>':'<div class="msg error">'+esc(d.error||"Upload failed")+"</div>";
 fileInput.value="";load();storage();
}
async function storage(){
 const d=await fetch("/api/storage").then(r=>r.json());
 const max=1024*1024*1024;
 document.getElementById("storageBar").style.width=Math.min(100,d.used/max*100)+"%";
 document.getElementById("storageText").textContent=formatSize(d.used)+" used · "+d.count+" files";
}
document.getElementById("uploadBtn").onclick=()=>fileInput.click();
fileInput.onchange=e=>upload(e.target.files);
document.getElementById("logout").onclick=async()=>{await fetch("/api/logout",{method:"POST"});location.href="/"};
document.getElementById("search").oninput=load;
document.getElementById("newFolderBtn").onclick=async()=>{
 const name=prompt("Folder name:");
 if(!name)return;
 await fetch("/api/folders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({parent:currentFolder,name})});
 load();
};
dropzone.ondragover=e=>{e.preventDefault();dropzone.style.borderStyle="solid"};
dropzone.ondragleave=()=>dropzone.style.borderStyle="dashed";
dropzone.ondrop=e=>{e.preventDefault();dropzone.style.borderStyle="dashed";upload(e.dataTransfer.files)};
load();storage();