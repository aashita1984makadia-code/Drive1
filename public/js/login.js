const form=document.getElementById("loginForm"), error=document.getElementById("loginError");
fetch("/api/me").then(r=>r.json()).then(x=>{if(x.loggedIn) location.href="/dashboard.html"});
form.addEventListener("submit",async e=>{
  e.preventDefault(); error.textContent="";
  const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:username.value,password:password.value})});
  const d=await r.json();
  if(r.ok) location.href="/dashboard.html"; else error.textContent=d.error||"Login failed";
});