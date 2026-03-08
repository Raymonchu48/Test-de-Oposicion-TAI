/* PDF Web · data + render + modal (rutas correctas para /pdfweb -> /pdf) */

const LIB = {
  modules: [
    {
      id: "MF01",
      name: "MF01 · Navegación, búsqueda y tratamiento de la información",
      meta: "Resumen + fundamentos web (HTML/CSS/JS) + gestión de fuentes y datos",
      tags: "navegación hipertexto html css javascript fuentes información protección datos archivos propiedad intelectual",
      bullets: [
        "Herramientas: motores de búsqueda, navegadores, marcadores, RSS y filtros.",
        "Hipertexto y formatos: páginas web, PDFs; base técnica HTML/CSS/JS.",
        "Fuentes: internet/intranet/extranet/OER; criterios de confiabilidad.",
        "Gestión de datos: almacenamiento, copias, cifrado, sistemas de archivos.",
        "Normativa: propiedad intelectual y protección de datos."
      ],
      summaryPdf: "pdfweb/pdf/Resumen_modulo_1.pdf",
      fullPdf: "pdfweb/pdf/MF01.pdf"
    },
    {
      id: "MF02",
      name: "MF02 · Creación y publicación de contenidos",
      meta: "Edición de texto/imagen/vídeo, licencias, privacidad e identidad digital",
      tags: "contenidos edición publicación ofimática imágenes vídeo audio licencias privacidad identidad digital",
      bullets: [
        "Herramientas: ofimática, editores de imagen/vídeo, CMS.",
        "Edición: corrección, plantillas reutilizables, mejora de contenidos.",
        "Inserción: embebidos y enlaces a recursos relacionados.",
        "Licencias y protección de datos: cumplimiento al publicar/compartir.",
        "Comunicación y redes: control de exposición e identidad digital."
      ],
      summaryPdf: "../pdf/Resumen_modulo_2.pdf",
      fullPdf: "../pdf/MF02.pdf"
    },
    {
      id: "MF03",
      name: "MF03 · Incidencias hardware/software y mantenimiento",
      meta: "Arquitectura PC, detección de averías, periféricos y conectividad",
      tags: "hardware software incidencias mantenimiento cpu placa base ram disco ssd hdd puertos cables wifi bluetooth nfc",
      bullets: [
        "Sistema informático: hardware + software + componente humano.",
        "CPU, placa, RAM, almacenamiento: síntomas y resolución de problemas.",
        "Mantenimiento: temperatura/humedad, limpieza, drivers, periféricos.",
        "Conexionado: buses, cables, conectores y puertos; Wi-Fi/Bluetooth/NFC."
      ],
      summaryPdf: "../pdf/Resumen_modulo_3.pdf",
      fullPdf: "../pdf/MF03.pdf"
    },
    {
      id: "MF04",
      name: "MF04 · Seguridad y buenas prácticas",
      meta: "Antimalware, phishing, privacidad, HTTPS y contraseñas",
      tags: "seguridad confidencialidad integridad disponibilidad antivirus antimalware phishing spam cookies privacidad https firewall contraseñas",
      bullets: [
        "Triada CIA: confidencialidad, integridad, disponibilidad.",
        "Antivirus/antimalware: configuración, análisis y actualizaciones.",
        "Correo: detección de phishing/spam y respuesta.",
        "Navegación segura: privacidad, cookies, HTTPS y sitios confiables.",
        "Contraseñas y políticas de acceso seguro."
      ],
      summaryPdf: "../pdf/Resumen_modulo_4.pdf",
      fullPdf: "../pdf/MF04.pdf"
    },
    {
      id: "MF05",
      name: "MF05 · Inventario, almacenaje y fin de vida del equipo",
      meta: "Inventario, almacenaje seguro, reciclaje y borrado de datos",
      tags: "inventario etiquetado nomenclatura almacenaje economía circular borrado seguro protección datos",
      bullets: [
        "Registro e inventario: etiquetado, nomenclatura y control.",
        "Software de inventario: automatización y auditoría.",
        "Almacenaje seguro: condiciones y prevención de daños.",
        "Economía circular + reciclaje; borrado seguro antes de retirar equipos."
      ],
      summaryPdf: "../pdf/Resumen_modulo_5.pdf",
      fullPdf: "../pdf/MF05.pdf"
    }
  ],
  cases: [
    { id: "C01", name: "Casos · 01", tags: "casos 01 supuestos ejercicios", pdf: "../pdf/casos_01.pdf" },
    { id: "C02", name: "Casos · 02", tags: "casos 02 supuestos ejercicios", pdf: "../pdf/casos_02.pdf" },
    { id: "C04", name: "Casos · 04", tags: "casos 04 supuestos ejercicios", pdf: "../pdf/casos_04.pdf" },
    { id: "C05", name: "Casos · 05", tags: "casos 05 supuestos ejercicios", pdf: "../pdf/casos_05.pdf" },
  ]
};

const elModules = document.getElementById("modules");
const elCases = document.getElementById("cases");
const elQ = document.getElementById("q");
const elCount = document.getElementById("kCount");
const elShown = document.getElementById("kShown");

const pdfModal = document.getElementById("pdfModal");
const pdfFrame = document.getElementById("pdfFrame");
const pdfTitle = document.getElementById("pdfTitle");
const pdfClose = document.getElementById("pdfClose");

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function openPdf(url, title){
  if (!pdfModal || !pdfFrame || !pdfTitle) return;
  pdfTitle.textContent = title || "Documento";
  pdfFrame.src = url;
  pdfModal.classList.add("is-open");
  pdfModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closePdf(){
  if (!pdfModal || !pdfFrame) return;
  pdfModal.classList.remove("is-open");
  pdfModal.setAttribute("aria-hidden", "true");
  pdfFrame.src = "";
  document.body.style.overflow = "";
}

pdfModal?.addEventListener("click", (e)=>{ if (e.target?.dataset?.close) closePdf(); });
pdfClose?.addEventListener("click", closePdf);
document.addEventListener("keydown", (e)=>{ if (e.key === "Escape") closePdf(); });

function itemTemplate({ title, meta, tags, bullets = [], buttons = [] }){
  return `
    <article class="item" data-tags="${esc(tags || "")}">
      <button class="item__head" type="button">
        <div>
          <div class="item__name">${esc(title)}</div>
          <div class="item__meta">${esc(meta || "")}</div>
        </div>
        <span class="badge">Abrir</span>
      </button>

      <div class="item__body">
        ${bullets.length ? `<ul class="bullets">${bullets.map(b=>`<li>${esc(b)}</li>`).join("")}</ul>` : ""}

        <div class="actions">
          ${buttons.map(b => {
            if (b.kind === "pdf") {
              return `<button class="btn ${b.primary ? "btn--primary":"btn--ghost"}" data-open="pdf" data-href="${esc(b.href)}" data-title="${esc(b.title)}" type="button">${esc(b.label)}</button>`;
            }
            if (b.kind === "link") {
              return `<a class="btn ${b.primary ? "btn--primary":"btn--ghost"}" href="${esc(b.href)}" target="_blank" rel="noopener">${esc(b.label)}</a>`;
            }
            return "";
          }).join("")}
        </div>
      </div>
    </article>
  `;
}

function wireAccordion(root){
  root.querySelectorAll(".item__head").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const item = btn.closest(".item");
      item.classList.toggle("is-open");
      const badge = item.querySelector(".badge");
      if (badge) badge.textContent = item.classList.contains("is-open") ? "Cerrar" : "Abrir";
    });
  });
}

function wirePdfButtons(root){
  root.querySelectorAll('[data-open="pdf"]').forEach(btn=>{
    btn.addEventListener("click", ()=>{
      openPdf(btn.dataset.href, btn.dataset.title);
    });
  });
}

function render(query=""){
  const q = (query || "").trim().toLowerCase();

  const mods = LIB.modules.filter(m => {
    if (!q) return true;
    const hay = (m.tags + " " + m.name + " " + m.meta).toLowerCase();
    return hay.includes(q);
  });

  const cases = LIB.cases.filter(c => {
    if (!q) return true;
    const hay = (c.tags + " " + c.name).toLowerCase();
    return hay.includes(q);
  });

  elModules.innerHTML = mods.map(m => itemTemplate({
    title: m.name,
    meta: m.meta,
    tags: m.tags,
    bullets: m.bullets,
    buttons: [
      { kind:"pdf", label:"Ver Resumen", title:`Resumen ${m.id}`, href:m.summaryPdf, primary:true },
      { kind:"pdf", label:"Ver PDF completo", title:`${m.id} completo`, href:m.fullPdf, primary:false },
    ]
  })).join("") || `<div class="hint">No hay módulos para ese filtro.</div>`;

  elCases.innerHTML = cases.map(c => itemTemplate({
    title: c.name,
    meta: "Ejercicios/casos para entrenar como examen",
    tags: c.tags,
    bullets: [],
    buttons: [
      { kind:"pdf", label:"Abrir en visor", title:c.name, href:c.pdf, primary:true },
      { kind:"link", label:"Abrir en pestaña", href:c.pdf, primary:false },
    ]
  })).join("") || `<div class="hint">No hay casos para ese filtro.</div>`;

  wireAccordion(elModules);
  wireAccordion(elCases);
  wirePdfButtons(elModules);
  wirePdfButtons(elCases);

  const total = LIB.modules.length + LIB.cases.length;
  const shown = mods.length + cases.length;
  if (elCount) elCount.textContent = String(total);
  if (elShown) elShown.textContent = String(shown);
}

elQ?.addEventListener("input", (e)=> render(e.target.value));
render("");


