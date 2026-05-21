import{_ as w}from"./D_c0OiqP.js";import{u as C}from"./CSBeWOnn.js";import{u as k}from"./BlSFUzaC.js";import{g as S,j as z,c as h,a as e,t as a,x as s,F as W,r as _,d as c,b as H,w as I,z as R,o as x,p as l}from"./CpnPXyIl.js";import"./CUegjb4Q.js";const T={class:"page-wrapper"},P={class:"card",style:{"margin-bottom":"24px"}},B={style:{position:"relative"}},$={class:"code-block",style:{"white-space":"pre-wrap","padding-right":"80px"}},L={class:"card",style:{"margin-bottom":"24px"}},M={style:{position:"relative"}},E={class:"code-block",style:{"white-space":"pre-wrap","padding-right":"80px"}},N={class:"card",style:{"margin-bottom":"24px"}},O={style:{position:"relative"}},U={class:"code-block",style:{"white-space":"pre-wrap","padding-right":"80px"}},D={class:"card",style:{"margin-bottom":"24px"}},Q={style:{display:"flex","flex-direction":"column",gap:"16px","margin-top":"16px"}},F={style:{width:"28px",height:"28px","border-radius":"50%",background:"rgba(34, 197, 94, 0.15)",border:"1px solid rgba(34, 197, 94, 0.3)",color:"#22c55e","font-size":"13px","font-weight":"600",display:"flex","align-items":"center","justify-content":"center","flex-shrink":"0","margin-top":"2px"}},j={style:{"font-size":"14px",color:"var(--text-primary)","font-weight":"500","margin-bottom":"6px"}},V=["innerHTML"],q={class:"card"},G={style:{position:"relative"}},K={class:"code-block",style:{"white-space":"pre-wrap","padding-right":"80px"}},Y={style:{"margin-top":"16px"}},oe=S({__name:"skills",setup(J){const{init:y,apiKey:r}=C(),{error:b}=k(),d=l(()=>typeof window<"u"?window.location.origin:""),n=R({send:!1,broadcast:!1,status:!1,mcp:!1}),u=l(()=>{const o=d.value,t=r.value;return`---
name: waha-send
description: Send WhatsApp messages via WAHA API
triggers:
  - send whatsapp
  - whatsapp message
---

Send a WhatsApp message via WAHA.

Steps:
1. Ask the user for:
   - Session name (default: "default")
   - Recipient phone number or chatId (e.g. "15551234567@c.us")
   - Message text to send

2. Call the WAHA API:
   POST ${o}/api/sendText
   Headers:
     Content-Type: application/json
     Authorization: Bearer ${t}
   Body:
     {
       "session": "<session>",
       "chatId": "<phone>@c.us",
       "text": "<message>"
     }

3. Show the API response to the user. If successful, confirm the message was sent.
   If an error occurs, explain what went wrong and suggest checking the session status.`}),m=l(()=>{const o=d.value,t=r.value;return`---
name: waha-broadcast
description: Broadcast WhatsApp messages to multiple contacts via WAHA API
triggers:
  - broadcast whatsapp
  - send to multiple
  - bulk whatsapp
---

Broadcast a WhatsApp message to multiple contacts via WAHA.

Steps:
1. Ask the user for:
   - Session name (default: "default")
   - List of recipient phone numbers (comma-separated or one per line)
   - Message text to send
   - Delay between messages in ms (default: 500, to avoid rate limiting)

2. Format the phone numbers as chatIds (add "@c.us" if not already present).

3. Call the WAHA broadcast API:
   POST ${o}/api/broadcast/text
   Headers:
     Content-Type: application/json
     Authorization: Bearer ${t}
   Body:
     {
       "session": "<session>",
       "chatIds": ["<phone1>@c.us", "<phone2>@c.us"],
       "text": "<message>",
       "delayMs": 500
     }

4. Show the result to the user: how many messages were sent successfully and any failures.`}),g=l(()=>{const o=d.value,t=r.value;return`---
name: waha-status
description: Check WAHA session status and get QR code for authentication
triggers:
  - waha status
  - whatsapp status
  - session qr
---

Check the status of a WAHA WhatsApp session.

Steps:
1. Ask the user for the session name (default: "default").

2. Fetch session info:
   GET ${o}/api/sessions/<session>
   Headers:
     Authorization: Bearer ${t}

3. Report the session status to the user:
   - WORKING: Session is connected and ready
   - STARTING: Session is initializing
   - SCAN_QR_CODE: User needs to scan a QR code
   - STOPPED: Session is not running
   - FAILED: Session encountered an error

4. If status is SCAN_QR_CODE, provide the QR code URL:
   ${o}/api/<session>/auth/qr
   Tell the user to open this URL in a browser to scan the QR code with their WhatsApp app.

5. If status is STOPPED or FAILED, offer to start/restart the session by calling:
   POST ${o}/api/sessions/start
   Body: { "name": "<session>" }`}),f=l(()=>JSON.stringify({mcpServers:{waha:{type:"sse",url:`${d.value}/api/mcp`,headers:{Authorization:`Bearer ${r.value}`}}}},null,2)),v=[{num:1,title:"Copy a skill above",desc:'Click "Copy" on any skill definition to copy the markdown content to your clipboard.'},{num:2,title:"Create the skill file",desc:`Save the copied content to <code style="font-family: var(--font-mono); font-size: 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 4px; padding: 1px 6px; color: #4ade80;">~/.claude/skills/waha-send.md</code> (or the appropriate skill name). Create the directory if it doesn't exist: <code style="font-family: var(--font-mono); font-size: 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 4px; padding: 1px 6px; color: #4ade80;">mkdir -p ~/.claude/skills</code>`},{num:3,title:"Set your WAHA URL",desc:'Update the <code style="font-family: var(--font-mono); font-size: 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 4px; padding: 1px 6px; color: #4ade80;">WAHA_URL</code> and <code style="font-family: var(--font-mono); font-size: 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 4px; padding: 1px 6px; color: #4ade80;">API_KEY</code> placeholders in the skill file with your actual WAHA instance URL and API key.'},{num:4,title:"Use in Claude Code",desc:'Run <code style="font-family: var(--font-mono); font-size: 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 4px; padding: 1px 6px; color: #4ade80;">/waha-send</code> in Claude Code to invoke the skill. Claude will ask for the required details and send the message.'}];async function p(o,t){try{await navigator.clipboard.writeText(o),n[t]=!0,setTimeout(()=>{n[t]=!1},1500)}catch{b("Failed to copy to clipboard")}}return z(()=>y()),(o,t)=>{const A=w;return x(),h("div",T,[t[16]||(t[16]=e("div",{class:"page-header"},[e("div",{class:"page-title"},"🧠 Claude Skills"),e("div",{class:"page-subtitle"}," Ready-to-use Claude Code skill definitions for WhatsApp automation ")],-1)),e("div",P,[t[4]||(t[4]=e("div",{style:{display:"flex","align-items":"center",gap:"12px","margin-bottom":"12px"}},[e("span",{style:{"font-family":"var(--font-mono)","font-size":"16px",color:"#4ade80","font-weight":"500"}},"/waha-send"),e("span",{class:"badge badge-active"},"Send Messages")],-1)),t[5]||(t[5]=e("p",{style:{"font-size":"13px",color:"var(--text-muted)","margin-bottom":"16px","line-height":"1.5"}}," Send WhatsApp messages directly from Claude. Ask Claude to send a message and it will call the WAHA API automatically. ",-1)),e("div",B,[e("div",$,a(s(u)),1),e("button",{class:"btn-secondary",style:{position:"absolute",top:"10px",right:"10px","font-size":"12px",padding:"4px 10px"},onClick:t[0]||(t[0]=i=>p(s(u),"send"))},a(s(n).send?"Copied!":"Copy"),1)])]),e("div",L,[t[6]||(t[6]=e("div",{style:{display:"flex","align-items":"center",gap:"12px","margin-bottom":"12px"}},[e("span",{style:{"font-family":"var(--font-mono)","font-size":"16px",color:"#4ade80","font-weight":"500"}},"/waha-broadcast"),e("span",{class:"badge badge-active"},"Broadcast")],-1)),t[7]||(t[7]=e("p",{style:{"font-size":"13px",color:"var(--text-muted)","margin-bottom":"16px","line-height":"1.5"}}," Broadcast a message to multiple WhatsApp contacts at once. Claude will ask for the contact list and message, then send to all of them. ",-1)),e("div",M,[e("div",E,a(s(m)),1),e("button",{class:"btn-secondary",style:{position:"absolute",top:"10px",right:"10px","font-size":"12px",padding:"4px 10px"},onClick:t[1]||(t[1]=i=>p(s(m),"broadcast"))},a(s(n).broadcast?"Copied!":"Copy"),1)])]),e("div",N,[t[8]||(t[8]=e("div",{style:{display:"flex","align-items":"center",gap:"12px","margin-bottom":"12px"}},[e("span",{style:{"font-family":"var(--font-mono)","font-size":"16px",color:"#4ade80","font-weight":"500"}},"/waha-status"),e("span",{class:"badge badge-active"},"Session Status")],-1)),t[9]||(t[9]=e("p",{style:{"font-size":"13px",color:"var(--text-muted)","margin-bottom":"16px","line-height":"1.5"}}," Check WAHA session status and get the QR code for authentication. Claude will report the session state and show the QR code URL if needed. ",-1)),e("div",O,[e("div",U,a(s(g)),1),e("button",{class:"btn-secondary",style:{position:"absolute",top:"10px",right:"10px","font-size":"12px",padding:"4px 10px"},onClick:t[2]||(t[2]=i=>p(s(g),"status"))},a(s(n).status?"Copied!":"Copy"),1)])]),e("div",D,[t[10]||(t[10]=e("div",{class:"section-title"},"How to Install",-1)),e("div",Q,[(x(),h(W,null,_(v,i=>e("div",{key:i.num,style:{display:"flex",gap:"16px","align-items":"flex-start"}},[e("div",F,a(i.num),1),e("div",null,[e("div",j,a(i.title),1),e("div",{style:{"font-size":"13px",color:"var(--text-muted)","line-height":"1.5"},innerHTML:i.desc},null,8,V)])])),64))])]),e("div",q,[t[12]||(t[12]=e("div",{class:"section-title"},"Alternative: WAHA MCP Connection",-1)),t[13]||(t[13]=e("p",{style:{"font-size":"13px",color:"var(--text-muted)","margin-bottom":"16px","line-height":"1.5"}}," Instead of individual skills, connect Claude Code directly to WAHA via MCP for full tool access. This gives Claude access to all 15 WAHA tools without any skill files. ",-1)),t[14]||(t[14]=e("div",{class:"form-label",style:{"margin-bottom":"8px"}},[c(" Claude Code Settings ("),e("code",{style:{"font-family":"var(--font-mono)",color:"var(--accent)"}},"~/.claude/settings.json"),c(") ")],-1)),e("div",G,[e("div",K,a(s(f)),1),e("button",{class:"btn-secondary",style:{position:"absolute",top:"10px",right:"10px","font-size":"12px",padding:"4px 10px"},onClick:t[3]||(t[3]=i=>p(s(f),"mcp"))},a(s(n).mcp?"Copied!":"Copy"),1)]),t[15]||(t[15]=e("p",{style:{"font-size":"12px",color:"rgba(134, 239, 172, 0.5)","margin-top":"12px"}}," After adding this config, restart Claude Code. You'll see all waha_* tools available automatically. ",-1)),e("p",Y,[H(A,{to:"/plus/mcp",style:{color:"var(--accent)","font-size":"13px"}},{default:I(()=>[...t[11]||(t[11]=[c("→ View full MCP documentation",-1)])]),_:1})])])])}}});export{oe as default};
