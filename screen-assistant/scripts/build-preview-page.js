'use strict';

/* Builds a self-contained preview.html (all screenshots inlined as data URIs)
   into the path given as argv[2]. Dev/documentation tool. */

const fs = require('fs');
const path = require('path');

const SHOTS = path.join(__dirname, 'preview-shots');
const out = process.argv[2] || path.join(__dirname, 'preview.html');

function dataUri(name) {
  const b = fs.readFileSync(path.join(SHOTS, name));
  return 'data:image/png;base64,' + b.toString('base64');
}

const img = {
  wIdle: dataUri('w1-idle.png'),
  wRun: dataUri('w2-running.png'),
  wApprove: dataUri('w3-approval.png'),
  teach: dataUri('1-teach.png'),
  watch: dataUri('2-watch.png'),
  skills: dataUri('3-skills.png'),
  workflows: dataUri('4-workflows.png'),
  assistant: dataUri('5-assistant.png'),
  settings: dataUri('6-settings.png'),
  onboarding: dataUri('8-onboarding.png'),
};

const dash = [
  ['teach', 'Teach', 'Record yourself doing a task, name it — Claude generalizes the technique into a reusable skill.'],
  ['skills', 'Skill library', 'Every taught skill, with the steps the model inferred and the phrases that trigger it.'],
  ['workflows', 'Workflows', 'Chain skills and one-off goals into a named routine that runs with a single phrase.'],
  ['assistant', 'Assistant + live run', 'Ask by voice or text; watch the action log stream as it works — with a high-risk approval gate.'],
  ['settings', 'Settings', 'Paste your API key (stored encrypted), pick the model, tune the step cap and paranoid mode.'],
  ['onboarding', 'First-run onboarding', 'A fresh install walks you through the key and OS permissions before anything runs.'],
];

const html = `<style>
  :root{
    --bg:#0a0e16; --panel:#121826; --edge:rgba(120,170,255,.16);
    --text:#e8edf6; --muted:#8ea0bd; --cyan:#22d3ee; --blue:#3aa0ff;
    --amber:#ffb020; --red:#ff5c5c; --green:#4bd18a;
    --maxw:1120px;
  }
  *{box-sizing:border-box}
  .wrap{background:
      radial-gradient(1200px 700px at 15% -5%, rgba(58,160,255,.14), transparent 55%),
      radial-gradient(900px 600px at 100% 0%, rgba(34,211,238,.10), transparent 50%),
      var(--bg);
    color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    line-height:1.5; padding:0 24px 80px; margin:0 -0px;}
  .inner{max-width:var(--maxw); margin:0 auto}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace}
  .eyebrow{font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; letter-spacing:4px;
    text-transform:uppercase; color:var(--cyan)}
  h1{font-size:clamp(34px,6vw,64px); line-height:1.02; letter-spacing:-.02em; margin:14px 0 0;
    text-wrap:balance; font-weight:800}
  h1 .grad{background:linear-gradient(100deg,var(--cyan),var(--blue)); -webkit-background-clip:text;
    background-clip:text; color:transparent}
  .lede{font-size:clamp(16px,2vw,20px); color:var(--muted); max-width:60ch; margin:18px 0 0}

  header.hero{display:grid; grid-template-columns:1.1fr .9fr; gap:32px; align-items:center;
    padding:72px 0 48px}
  @media(max-width:820px){header.hero{grid-template-columns:1fr; text-align:left}}
  .chips{display:flex; flex-wrap:wrap; gap:8px; margin-top:26px}
  .chip{border:1px solid var(--edge); background:rgba(255,255,255,.03); color:var(--muted);
    border-radius:999px; padding:7px 13px; font-size:13px}
  .chip b{color:var(--text); font-weight:600}
  .hero-shot{display:flex; justify-content:center}
  .hero-shot img{width:300px; max-width:100%; filter:drop-shadow(0 30px 80px rgba(34,211,238,.28))}

  section{padding:40px 0}
  .sec-head{display:flex; align-items:baseline; gap:14px; margin-bottom:8px; flex-wrap:wrap}
  h2{font-size:clamp(22px,3vw,30px); letter-spacing:-.01em; margin:0; font-weight:750}
  .sec-sub{color:var(--muted); max-width:64ch; margin:6px 0 26px}

  .states{display:grid; grid-template-columns:repeat(3,1fr); gap:20px}
  @media(max-width:820px){.states{grid-template-columns:1fr}}
  .state-card{background:var(--panel); border:1px solid var(--edge); border-radius:18px;
    padding:18px; text-align:center}
  .state-card img{width:210px; max-width:100%; height:auto; margin:0 auto}
  .state-tag{display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:600;
    margin-top:6px}
  .dot{width:9px; height:9px; border-radius:50%}
  .state-card p{color:var(--muted); font-size:13px; margin:6px 0 0}

  .grid{display:grid; grid-template-columns:1fr 1fr; gap:22px}
  @media(max-width:820px){.grid{grid-template-columns:1fr}}
  .card{background:var(--panel); border:1px solid var(--edge); border-radius:18px; overflow:hidden;
    display:flex; flex-direction:column}
  .card .shotwrap{background:#0b0f18; border-bottom:1px solid var(--edge); overflow:hidden}
  .card img{width:100%; height:auto; display:block}
  .card .body{padding:16px 18px}
  .card h3{margin:0; font-size:16px}
  .card p{margin:6px 0 0; color:var(--muted); font-size:14px}

  .flow{display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:8px}
  @media(max-width:820px){.flow{grid-template-columns:1fr}}
  .step{border:1px solid var(--edge); border-radius:16px; padding:20px; background:rgba(255,255,255,.02)}
  .step .n{font-family:ui-monospace,monospace; color:var(--cyan); font-size:13px; letter-spacing:2px}
  .step h4{margin:10px 0 6px; font-size:17px}
  .step p{margin:0; color:var(--muted); font-size:14px}

  .foot{margin-top:56px; border-top:1px solid var(--edge); padding-top:26px; color:var(--muted);
    display:flex; gap:24px; flex-wrap:wrap; align-items:center; justify-content:space-between}
  .run{font-family:ui-monospace,monospace; font-size:13px; background:#0b0f18; border:1px solid var(--edge);
    padding:10px 14px; border-radius:10px; color:var(--text)}
  .safe{display:flex; gap:8px; flex-wrap:wrap}
  .safe span{font-size:12px; border:1px solid var(--edge); border-radius:999px; padding:4px 10px}
</style>

<div class="wrap"><div class="inner">

  <header class="hero">
    <div>
      <div class="eyebrow">Screen Assistant · desktop AI operator</div>
      <h1>An assistant that <span class="grad">learns by watching</span>, then does it for you.</h1>
      <p class="lede">Show it a task once and name it. It generalizes the technique, remembers it,
        and — on command, by voice or text — takes real control of your mouse and keyboard to do it
        again. It lives on your screen as a floating core, and never touches anything risky without
        your say-so.</p>
      <div class="chips">
        <div class="chip"><b>Learn</b> by demonstration</div>
        <div class="chip"><b>Voice</b> &amp; text commands</div>
        <div class="chip"><b>Real</b> mouse &amp; keyboard control</div>
        <div class="chip"><b>Approval gate</b> + instant STOP</div>
      </div>
    </div>
    <div class="hero-shot"><img src="${img.wIdle}" alt="The floating assistant widget, idle"></div>
  </header>

  <section>
    <div class="sec-head"><div class="eyebrow" style="color:var(--blue)">The widget</div>
      <h2>A core that lives on top of your work</h2></div>
    <p class="sec-sub">Always-on-top and frameless, the widget's arc-reactor core shifts color with
      its state so you always know what it's doing at a glance — summon it anywhere with
      <span class="mono">Ctrl/Cmd+Shift+Space</span>.</p>
    <div class="states">
      <div class="state-card">
        <img src="${img.wIdle}" alt="Widget idle">
        <div class="state-tag"><span class="dot" style="background:var(--blue)"></span>Ready</div>
        <p>Standing by for a command.</p>
      </div>
      <div class="state-card">
        <img src="${img.wRun}" alt="Widget working">
        <div class="state-tag"><span class="dot" style="background:var(--amber)"></span>Working</div>
        <p>Driving the machine, streaming every action.</p>
      </div>
      <div class="state-card">
        <img src="${img.wApprove}" alt="Widget approval">
        <div class="state-tag"><span class="dot" style="background:var(--red)"></span>Approval needed</div>
        <p>Pauses and turns red before anything risky.</p>
      </div>
    </div>
  </section>

  <section>
    <div class="sec-head"><div class="eyebrow" style="color:var(--blue)">The workspace</div>
      <h2>See all your work, one click away</h2></div>
    <p class="sec-sub">Behind the widget is the full workspace — teach new skills, watch privately,
      browse your library, compose workflows, and command the assistant in conversation.</p>
    <div class="grid">
      ${dash
        .map(
          ([k, t, d]) => `<div class="card">
        <div class="shotwrap"><img src="${img[k]}" alt="${t}"></div>
        <div class="body"><h3>${t}</h3><p>${d}</p></div>
      </div>`
        )
        .join('\n      ')}
    </div>
  </section>

  <section>
    <div class="sec-head"><h2>How it works</h2></div>
    <div class="flow">
      <div class="step"><div class="n">01 · TEACH</div><h4>Show it once</h4>
        <p>Record yourself doing the task and give it a name. Claude studies the frames and writes
          the reusable technique — not a brittle pixel replay.</p></div>
      <div class="step"><div class="n">02 · RECALL</div><h4>Just ask</h4>
        <p>Say or type what you want. The router matches a skill, a workflow, or a one-off goal and
          hands it to the execution engine.</p></div>
      <div class="step"><div class="n">03 · ACT</div><h4>It does it — safely</h4>
        <p>It controls the real mouse and keyboard, verifying each step against a fresh screenshot,
          and pauses for your approval before anything destructive.</p></div>
    </div>
  </section>

  <div class="foot">
    <div class="run">cd screen-assistant &nbsp;·&nbsp; npm install &nbsp;·&nbsp; npm start</div>
    <div class="safe">
      <span>🔒 encrypted key</span><span>🖱 gated control</span><span>■ Ctrl/Cmd+Shift+X stop</span>
      <span>👁 private watch</span>
    </div>
  </div>

</div></div>`;

fs.writeFileSync(out, html);
console.log('Wrote ' + out + ' (' + (html.length / 1024).toFixed(0) + ' KB)');
