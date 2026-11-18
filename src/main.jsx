import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const tipos = ["Imagem", "Editar foto", "Animar foto", "Vídeo", "Roteiro", "Aplicativo", "Outro"];
const destinos = ["Genérico", "ChatGPT", "Gemini", "Claude", "Lovable", "Gerador de imagem", "Gerador de vídeo"];
const key = "vozprompt.demo.history.v1";

function construirPrompt({ idea, referenceDescription, category, target, strength, hasImage }) {
  const bloco = strength === "Simples"
    ? "Seja claro e objetivo."
    : strength === "Detalhado"
    ? "Descreva cenário, estilo, composição, ações, iluminação, enquadramento e formato final quando forem pertinentes."
    : "Atue como especialista em direção criativa e engenharia de prompts. Organize objetivo, contexto, requisitos, composição, restrições e resultado esperado. Use linguagem inequívoca e consistente.";
  return [
    `TAREFA: ${category}. Plataforma-alvo: ${target}.`,
    `OBJETIVO DA PESSOA: ${idea.trim()}.`,
    hasImage ? "REFERÊNCIA VISUAL: a pessoa selecionou uma imagem no VOZPROMPT. Esta versão de demonstração NÃO analisou nem transmite automaticamente os pixels para a plataforma de destino. Anexe a imagem também na ferramenta de destino." : "",
    referenceDescription.trim() ? `DESCRIÇÃO DA REFERÊNCIA FORNECIDA PELA PESSOA: ${referenceDescription.trim()}.` : "",
    bloco,
    "Preserve fielmente somente os elementos explicitamente solicitados; não invente atributos ausentes. Se uma informação indispensável não estiver disponível, solicite esclarecimento em vez de afirmar que foi observada.",
    category === "Animar foto" || category === "Vídeo" ? "Descreva movimento natural, sequência de ações, movimentação de câmera e duração caso informada." : "",
    "FORMATO: entregue instruções prontas para uso, com detalhes suficientes para executar a tarefa e sem apresentar suposições como fatos."
  ].filter(Boolean).join("\n\n");
}

function App() {
  const [files, setFiles] = useState([]);
  const [idea, setIdea] = useState("");
  const [referenceDescription, setReferenceDescription] = useState("");
  const [category, setCategory] = useState("Editar foto");
  const [target, setTarget] = useState("Genérico");
  const [strength, setStrength] = useState("Detalhado");
  const [result, setResult] = useState("");
  const [notice, setNotice] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [saved, setSaved] = useState([]);
  const recorder = useRef(null);
  const stream = useRef(null);
  const chunks = useRef([]);
  const recognition = useRef(null);
  const input = useRef(null);
  useEffect(() => {
    try { setSaved(JSON.parse(localStorage.getItem(key) || "[]")); } catch { setSaved([]); }
    return () => {
      stream.current?.getTracks()?.forEach(t => t.stop());
      recognition.current?.stop?.();
    };
  }, []);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  function addImages(event) {
    const incoming = [...(event.target.files || [])];
    const good = incoming.filter(f => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024);
    if (good.length < incoming.length) setNotice("Alguns arquivos foram ignorados. Escolha fotos de até 10 MB.");
    if (!good.length) return;
    setFiles(previous => [...previous, ...good.slice(0, Math.max(0, 4 - previous.length)).map(f => ({ name: f.name, url: URL.createObjectURL(f) }))]);
    event.target.value = "";
  }
  function removeImage(url) { setFiles(current => current.filter(f => f.url !== url)); URL.revokeObjectURL(url); }

  async function record() {
    if (recording) { recorder.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice("Seu navegador não permite gravação direta. Use Enviar áudio ou escreva sua ideia.");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      const rec = new MediaRecorder(media);
      recorder.current = rec;
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        media.getTracks().forEach(track => track.stop());
        setRecording(false);
        setNotice("Áudio gravado. Para gerar o prompt nesta demonstração, descreva sua ideia no campo de texto. A transcrição por IA será integrada depois.");
      };
      rec.start();
      setRecording(true);
      setNotice("Gravando. Toque novamente para encerrar.");
    } catch {
      setNotice("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  }
  function transcreverNavegador() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice("Transcrição por voz do navegador indisponível neste dispositivo. Use texto ou envie seu áudio.");
      return;
    }
    try {
      const sr = new SpeechRecognition();
      recognition.current = sr;
      sr.lang = "pt-BR"; sr.interimResults = false; sr.continuous = false;
      sr.onresult = event => setIdea(old => [old.trim(), [...event.results].map(r => r[0].transcript).join(" ")].filter(Boolean).join(" "));
      sr.onerror = () => setNotice("Não foi possível reconhecer a fala. Tente novamente ou digite.");
      sr.onend = () => setNotice("Confira e edite o texto reconhecido antes de gerar.");
      sr.start();
      setNotice("Fale agora. A transcrição usa o reconhecimento disponibilizado pelo seu navegador.");
    } catch { setNotice("Não foi possível iniciar o reconhecimento de fala."); }
  }
  function uploadAudio(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setNotice("O limite de áudio nesta demonstração é 25 MB."); return; }
    setAudioUrl(URL.createObjectURL(file));
    setNotice("Áudio carregado para reprodução. Transcrição automática de arquivos ainda não está conectada; escreva ou dite sua ideia.");
  }
  function generate() {
    if (!idea.trim()) { setNotice("Escreva ou dite primeiro o que deseja fazer."); return; }
    setResult(construirPrompt({ idea, referenceDescription, category, target, strength, hasImage: files.length > 0 }));
    setNotice("Prompt estruturado gerado em modo demonstração. Não foi usada análise de imagem por IA.");
  }
  function save() {
    if (!result) return;
    const updated = [{ id: Date.now(), category, text: result, title: idea.slice(0, 70) }, ...saved].slice(0, 30);
    try { localStorage.setItem(key, JSON.stringify(updated)); setSaved(updated); setNotice("Prompt salvo neste navegador."); } catch { setNotice("Não foi possível salvar neste navegador."); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(result); setNotice("Prompt copiado."); }
    catch { setNotice("Não foi possível copiar automaticamente. Selecione o texto do resultado."); }
  }
  return <main className="page">
    <header className="top"><div className="brand"><span className="brand-icon">✦</span><div><b>VOZPROMPT</b><small>Criador inteligente de prompts</small></div></div><span className="pill">Protótipo • sem publicação</span></header>
    <section className="hero"><span className="eyebrow">SUAS IDEIAS, MAIS CLARAS</span><h1>Imagine, fale ou mostre uma foto.<br/><em>Transforme em prompt.</em></h1><p>Um lugar simples para transformar sua ideia em instruções prontas para ferramentas de IA.</p></section>
    <section className="panel">
      <div className="sectionTitle"><span className="step">1</span><div><h2>Adicione uma imagem de referência</h2><p>Opcional • até 4 imagens de 10 MB</p></div></div>
      <input ref={input} aria-label="Escolher imagens" className="hidden" type="file" accept="image/*" multiple onChange={addImages}/>
      <button className="upload" type="button" onClick={() => input.current?.click()}><span className="upload-icon">▧</span><strong>+ Adicionar imagem</strong><small>Escolher da galeria ou tirar foto</small></button>
      {files.length > 0 && <div className="images">{files.map(f => <div className="image" key={f.url}><img src={f.url} alt={f.name}/><button type="button" aria-label={"Remover " + f.name} onClick={() => removeImage(f.url)}>×</button></div>)}</div>}
      <label htmlFor="reference">O que é importante preservar ou observar nessa imagem?</label><textarea id="reference" value={referenceDescription} onChange={e => setReferenceDescription(e.target.value)} placeholder="Ex.: manter o rosto, óculos e roupas, mudar o fundo para um estúdio..."/>
      <p className="hint">Nesta primeira versão, a imagem aparece para você conferir, mas não é analisada automaticamente por IA.</p>
    </section>
    <section className="panel">
      <div className="sectionTitle"><span className="step">2</span><div><h2>Conte o que você quer criar</h2><p>Fale, envie um áudio ou escreva</p></div></div>
      <div className="actions"><button type="button" className={"btn secondary " + (recording ? "active" : "")} onClick={record}>{recording ? "■ Parar gravação" : "● Gravar áudio"}</button><button type="button" className="btn secondary" onClick={transcreverNavegador}>🎙 Ditar texto</button><label className="btn secondary uploadAudio">↑ Enviar áudio<input type="file" accept="audio/*" onChange={uploadAudio}/></label></div>
      {audioUrl && <audio controls src={audioUrl} aria-label="Reproduzir áudio anexado"/>}
      <label htmlFor="idea">Sua ideia ou texto transcrito</label><textarea id="idea" className="large" value={idea} onChange={e => setIdea(e.target.value)} placeholder="Ex.: quero animar essa foto, mantendo as feições e fazendo a pessoa acenar para a câmera..."/>
    </section>
    <section className="panel">
      <div className="sectionTitle"><span className="step">3</span><div><h2>Personalize o prompt</h2><p>Escolha o objetivo e o nível de detalhe</p></div></div>
      <div className="two"><div><label htmlFor="category">O que você quer criar?</label><select id="category" value={category} onChange={e => setCategory(e.target.value)}>{tipos.map(t => <option key={t}>{t}</option>)}</select></div><div><label htmlFor="target">Ferramenta de destino</label><select id="target" value={target} onChange={e => setTarget(e.target.value)}>{destinos.map(t => <option key={t}>{t}</option>)}</select></div></div>
      <div className="levels">{["Simples", "Detalhado", "Profissional"].map(x => <button key={x} type="button" aria-pressed={strength === x} className={strength === x ? "selected" : ""} onClick={() => setStrength(x)}>{x}</button>)}</div>
      <button className="btn primary" type="button" onClick={generate}>✦ Gerar meu prompt</button>
      {notice && <p className="notice" role="status">{notice}</p>}
    </section>
    {result && <section className="panel result"><div className="sectionTitle"><span className="step">✓</span><div><h2>Seu prompt está pronto</h2><p>Versão estruturada • demonstração sem IA</p></div></div><textarea aria-label="Prompt gerado, editável" className="resultText" value={result} onChange={e => setResult(e.target.value)}/><div className="actions"><button className="btn primary compact" type="button" onClick={copy}>Copiar prompt</button><button className="btn secondary" type="button" onClick={save}>Salvar</button></div></section>}
    {saved.length > 0 && <section className="panel"><h2>Prompts salvos neste dispositivo</h2>{saved.map(s => <button type="button" key={s.id} className="saved" onClick={() => {setResult(s.text);setNotice("Prompt recuperado do histórico local.");}}><b>{s.category}</b><span>{s.title}</span></button>)}</section>}
    <footer>Privacidade: nenhuma imagem ou áudio é enviado a um servidor nesta demonstração. Prompts salvos ficam somente neste navegador. A análise visual real e a transcrição de arquivos exigirão backend seguro e consentimento.</footer>
  </main>;
}
createRoot(document.getElementById("root")).render(<App/>);
