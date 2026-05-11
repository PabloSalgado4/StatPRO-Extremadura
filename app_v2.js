import { supabase } from './supabaseClient.js';

let jugadorEditandoId = null;
let miEquipoId = null;
let miEquipoActual = null;
let isAdminMode = false;
window.partidosDataTemp = {};

let partidoEnDirectoId = null;
let eventosDraft = [];
let marcadorDraft = { local: 0, visitante: 0 };
let actaEquipoRol = 'local';
let actaJugadorSeleccionado = null;
let actaJugadoresLocal = [];
let actaJugadoresVisita = [];

let timerSeconds = 0;
let timerInterval = null;
let isTimerRunning = false;

let chartPosiciones = null;
let chartRacha = null;
let canalEventosActivo = null;

function mostrarNotificacion(mensaje, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;

    let icono = 'ℹ️';
    if (tipo === 'error') icono = '⚠️';
    if (tipo === 'success') icono = '✅';

    toast.innerHTML = `<span>${icono}</span> <span>${mensaje}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOutToast 0.3s ease forwards';
        setTimeout(() => {
            if (container.contains(toast)) container.removeChild(toast);
        }, 300);
    }, 3500);
}

window.addEventListener('error', function (e) {
    console.error("Error global atrapado: ", e.message);
});

function onClickSafe(id, callback) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', callback);
}

function onChangeSafe(id, callback) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', callback);
}

async function subirArchivoStorage(inputId, bucketName) {
    const fileInput = document.getElementById(inputId);
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return null;

    const file = fileInput.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage.from(bucketName).upload(fileName, file);
    if (error) {
        mostrarNotificacion("Error subiendo el archivo al servidor", "error");
        return null;
    }

    const { data: publicData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    return publicData.publicUrl;
}

onChangeSafe('sel-categoria', function (e) {
    const selCompeticion = document.getElementById('sel-competicion');
    if (!selCompeticion) return;
    if (e.target.value.includes('Senior')) {
        selCompeticion.innerHTML = `<option value="liga">Liga Regular</option><option value="copa">Copa de Extremadura</option>`;
    } else {
        selCompeticion.innerHTML = `<option value="liga">Liga Regular</option>`;
    }
});

function openMenu() {
    const sideMenu = document.getElementById('side-menu');
    const menuOverlay = document.getElementById('menu-overlay');
    if (sideMenu) sideMenu.classList.add('open');
    if (menuOverlay) menuOverlay.classList.add('open');
}

function closeMenu() {
    const sideMenu = document.getElementById('side-menu');
    const menuOverlay = document.getElementById('menu-overlay');
    if (sideMenu) sideMenu.classList.remove('open');
    if (menuOverlay) menuOverlay.classList.remove('open');
}

onClickSafe('btn-menu-toggle', openMenu);
onClickSafe('btn-close-menu', closeMenu);
onClickSafe('menu-overlay', closeMenu);

function mostrarSeccion(id) {
    document.querySelectorAll('.app-section').forEach(s => s.style.display = 'none');
    const seccion = document.getElementById(id);
    if (seccion) seccion.style.display = 'block';
}

onClickSafe('logo-inicio', () => mostrarSeccion('vista-inicio'));
onClickSafe('btn-ir-login', () => mostrarSeccion('vista-login'));

onClickSafe('btn-nav-solicitar-rol', () => {
    closeMenu();
    mostrarSeccion('vista-solicitar-rol');
});

onClickSafe('btn-nav-goleadores', () => {
    closeMenu();
    mostrarSeccion('vista-goleadores');
    cargarGoleadores();
});

onClickSafe('btn-nav-equipo', () => {
    closeMenu();
    isAdminMode = false;
    const panelBtn = document.getElementById('btn-volver-admin-panel');
    if (panelBtn) panelBtn.style.display = 'none';
    verificarEquipoEntrenador();
});

onClickSafe('btn-nav-admin', () => {
    closeMenu();
    isAdminMode = true;
    mostrarSeccion('vista-admin');
    cambiarTabAdmin('solicitudes');
});

onClickSafe('btn-nav-galeria', () => {
    closeMenu();
    mostrarSeccion('vista-galeria');
    cargarGaleria();
});

async function cargarGaleria() {
    const grid = document.getElementById('grid-galeria');
    if (!grid) return;
    grid.innerHTML = '<p style="color:var(--muted);">Cargando fotos...</p>';
    
    // 1. Obtenemos el usuario actual
    const { data: { user } } = await supabase.auth.getUser();
    
    // 2. Comprobamos si el usuario es Admin REAL mirando directo en la base de datos
    let esAdminReal = false;
    if (user) {
        // Pedimos el perfil entero para asegurarnos
        const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', user.id).single();
        if (perfil && perfil.is_admin) {
            esAdminReal = true;
        }
    }
    
    const { data } = await supabase.from('galeria').select('*').order('created_at', { ascending: false });
    grid.innerHTML = '';

    if (data && data.length > 0) {
        data.forEach(foto => {
            const fecha = new Date(foto.created_at).toLocaleDateString();
            
            // 3. Lógica de permisos V2: ¿Eres el dueño? OR ¿Eres Admin Supremo en BD? OR ¿Estás en modo admin?
            const esDueño = user && user.id === foto.user_id;
            const puedeBorrar = esDueño || esAdminReal || isAdminMode; 
            
            let btnBorrarHtml = '';

            if (puedeBorrar) {
                // Limpiamos la URL por si tiene parámetros raros y sacamos el nombre limpio
                const urlSinParametros = foto.url.split('?')[0];
                const partesUrl = urlSinParametros.split('/');
                const nombreArchivo = partesUrl[partesUrl.length - 1];

                btnBorrarHtml = `
                    <button onclick="event.stopPropagation(); borrarFotoGaleria('${foto.id}', '${nombreArchivo}')" 
                            class="btn-danger" 
                            style="position:absolute; top:8px; right:8px; padding:6px; border-radius:50%; z-index:10; font-size:1.1rem; box-shadow:0 2px 10px rgba(0,0,0,0.5); width:35px; height:35px; display:flex; align-items:center; justify-content:center;">
                        🗑️
                    </button>
                `;
            }

            grid.innerHTML += `
                <div class="gallery-card" onclick="abrirFotoGaleria('${foto.url}', '${foto.descripcion}')" style="position:relative;">
                    ${btnBorrarHtml}
                    <img src="${foto.url}" class="gallery-img">
                    <div class="gallery-info">
                        <p class="gallery-desc">${foto.descripcion || 'Sin descripción'}</p>
                        <p class="gallery-date">${fecha}</p>
                    </div>
                </div>
            `;
        });
    } else {
        grid.innerHTML = '<p style="grid-column:1/-1; color:var(--muted); text-align:center;">Aún no hay fotos en la galería.</p>';
    }
}

// =========================================================
// ================= BORRAR FOTOS ==========================
// =========================================================
window.borrarFotoGaleria = async function(idFoto, nombreArchivo) {
    if (!confirm("⚠️ ¿Estás seguro de que quieres borrar esta foto? No podrás recuperarla.")) return;

    try {
        // 1. Borramos el registro de la base de datos primero
        const { error: errorDb } = await supabase.from('galeria').delete().eq('id', idFoto);
        if (errorDb) throw errorDb;

        // 2. Borramos el archivo físico del Storage de Supabase
        const { error: errorStorage } = await supabase.storage.from('galeria').remove([nombreArchivo]);
        if (errorStorage) throw errorStorage;

        mostrarNotificacion("¡Foto borrada con éxito!", "success");
        cargarGaleria(); // Recargamos para que desaparezca al instante

    } catch (err) {
        mostrarNotificacion("Error al borrar la foto: " + err.message, "error");
    }
};

onClickSafe('btn-subir-galeria', async function (e) {
    const btn = e.currentTarget;
    const fileInput = document.getElementById('galeria-file');
    const descInput = document.getElementById('galeria-desc');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        return mostrarNotificacion('Selecciona una foto primero.', 'error');
    }

    btn.innerText = 'Subiendo...';
    btn.disabled = true;
    const urlFoto = await subirArchivoStorage('galeria-file', 'galeria');

    if (urlFoto) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('galeria').insert([{ url: urlFoto, descripcion: descInput ? descInput.value : '', user_id: user?.id }]);
        fileInput.value = '';
        if (descInput) descInput.value = '';
        cargarGaleria();
        mostrarNotificacion('Foto subida con éxito.', 'success');
    } else {
        mostrarNotificacion("Error al subir la foto.", "error");
    }
    btn.innerText = 'Subir Foto';
    btn.disabled = false;
});

window.abrirFotoGaleria = function (url, desc) {
    const srcEl = document.getElementById('img-zoom-src');
    const descEl = document.getElementById('img-zoom-desc');
    const modalEl = document.getElementById('modal-foto-zoom');
    if (srcEl) srcEl.src = url;
    if (descEl) descEl.innerText = desc === 'null' ? '' : desc;
    if (modalEl) modalEl.style.display = 'flex';
};

onClickSafe('btn-continuar-consulta', () => {
    const catGenSelect = document.getElementById('sel-categoria');
    const catGen = catGenSelect ? catGenSelect.value : '';
    const arr = catGen.split(' ');
    const cat = arr[0];
    const gen = arr[1];

    const modSelect = document.getElementById('sel-modalidad');
    const mod = modSelect ? modSelect.value : '';

    const titulo = document.getElementById('titulo-clasificacion');
    if (titulo) titulo.innerText = `Clasificación - ${catGen}`;

    mostrarSeccion('vista-clasificacion');
    cargarClasificacionEquipos(cat, mod, gen);
});

async function cargarClasificacionEquipos(cat, mod, gen) {
    const tbody = document.getElementById('tabla-body-equipos');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Cargando...</td></tr>';

    const { data } = await supabase.from('equipos').select('*').eq('categoria', cat).eq('modalidad', mod).eq('genero', gen).order('puntos', { ascending: false });
    tbody.innerHTML = '';

    if (data && data.length > 0) {
        data.forEach((e, i) => {
            const logoHtml = e.escudo_url ? `<img src="${e.escudo_url}" class="team-logo-small">` : '';
            tbody.innerHTML += `
                <tr>
                    <td class="rank-col">#${i + 1}</td>
                    <td class="name-col" style="display:flex; align-items:center; border:none;">${logoHtml} ${e.nombre_equipo}</td>
                    <td>${e.jugados || 0}</td><td>${e.victorias || 0}</td><td>${e.empates || 0}</td><td>${e.derrotas || 0}</td><td>${e.goles_favor || 0}</td><td>${e.goles_contra || 0}</td><td class="goals-col">${e.puntos || 0}</td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--muted);">No hay equipos registrados</td></tr>';
    }
}

async function cargarGoleadores() {
    const catGenSelect = document.getElementById('sel-categoria');
    const catGen = catGenSelect ? catGenSelect.value : '';
    const arr = catGen.split(' ');
    const cat = arr[0];
    const gen = arr[1];

    const titulo = document.getElementById('titulo-goleadores');
    if (titulo) titulo.innerText = `Máximo Goleador - ${catGen}`;

    const tbody = document.getElementById('tabla-body-goleadores');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando...</td></tr>';

    const { data } = await supabase.from('jugadores').select('nombre, goles, equipos!inner(nombre_equipo, categoria, genero, escudo_url)').eq('equipos.categoria', cat).eq('equipos.genero', gen).order('goles', { ascending: false }).limit(20);
    tbody.innerHTML = '';

    if (data && data.length > 0) {
        data.forEach((j, i) => {
            const logoHtml = j.equipos.escudo_url ? `<img src="${j.equipos.escudo_url}" class="team-logo-small">` : '';
            tbody.innerHTML += `
                <tr>
                    <td class="rank-col">${i + 1}º</td><td class="name-col">${j.nombre}</td>
                    <td style="display:flex; align-items:center; border:none;">${logoHtml} ${j.equipos.nombre_equipo}</td><td class="goals-col">${j.goles || 0}</td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--muted);">Aún no hay goleadores</td></tr>';
    }
}

onClickSafe('btn-ver-resultados', () => {
    const catGenSelect = document.getElementById('sel-categoria');
    const catGen = catGenSelect ? catGenSelect.value : '';
    const titulo = document.getElementById('titulo-resultados');
    if (titulo) titulo.innerText = `Resultados - ${catGen}`;

    const selJornada = document.getElementById('sel-filtro-jornada');
    if (selJornada && selJornada.options.length === 0) {
        for (let i = 1; i <= 30; i++) selJornada.innerHTML += `<option value="${i}">Jornada ${i}</option>`;
    }

    mostrarSeccion('vista-resultados');
    cargarPartidosJornada();
});

onChangeSafe('sel-filtro-jornada', () => cargarPartidosJornada());

async function cargarPartidosJornada() {
    const catGenSelect = document.getElementById('sel-categoria');
    const catGen = catGenSelect ? catGenSelect.value : '';
    const arr = catGen.split(' ');
    const cat = arr[0];
    const gen = arr[1];
    const modSelect = document.getElementById('sel-modalidad');
    const mod = modSelect ? modSelect.value : '';
    const jornadaSelect = document.getElementById('sel-filtro-jornada');
    const jornada = jornadaSelect ? jornadaSelect.value : '';

    const div = document.getElementById('contenedor-partidos');
    if (!div) return;
    div.innerHTML = '<p style="text-align:center;">Cargando resultados...</p>';

    const { data } = await supabase.from('partidos').select('*').eq('categoria', cat).eq('genero', gen).eq('modalidad', mod).eq('jornada', jornada).order('created_at', { ascending: false });
    div.innerHTML = '';

    if (data && data.length > 0) {
        data.forEach(p => {
            let liveTag = p.estado === 'en_curso' ? '<div style="width:100%; text-align:center; margin-bottom:10px;"><span class="live-badge">🔴 En Directo</span></div>' : '';
            div.innerHTML += `
                <div class="match-card" id="match-card-${p.id}">
                    ${liveTag}
                    <div class="match-row-main">
                        <div class="match-team">${p.nombre_local}</div>
                        <div class="match-score-container" id="score-container-${p.id}">
                            <span class="match-score" id="score-local-${p.id}">${p.goles_local}</span>
                            <span class="match-divider">VS</span>
                            <span class="match-score" id="score-vis-${p.id}">${p.goles_visitante}</span>
                        </div>
                        <div class="match-team">${p.nombre_visitante}</div>
                    </div>
                    <button class="btn-ver-acta" onclick="abrirActaDetallada('${p.id}', '${p.nombre_local}', '${p.nombre_visitante}', ${p.goles_local}, ${p.goles_visitante}, '${p.equipo_local_id}', '${p.equipo_visitante_id}')">📄 VER ACTA DETALLADA</button>
                </div>
            `;
        });
    } else {
        div.innerHTML = '<p style="text-align:center; color:var(--muted); padding: 30px;">No hay resultados registrados en esta jornada.</p>';
    }
}

function suscribirseAMinutoAMinuto(partidoId, idLocal) {
    if (canalEventosActivo) supabase.removeChannel(canalEventosActivo);

    canalEventosActivo = supabase.channel(`public:eventos_partido:${partidoId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos_partido', filter: `partido_id=eq.${partidoId}` }, payload => {
            const ev = payload.new;
            const container = document.getElementById('timeline-container');
            if (container) {
                if (container.innerHTML.includes('Este partido se registró sin eventos')) container.innerHTML = '';
                let tipoLabel = ""; let claseColor = ""; let icono = "";
                if (ev.tipo_evento === 'gol' || ev.tipo_evento === 'gol1') { tipoLabel = "GOL (+1)"; claseColor = "event-gol"; icono = "⚽"; }
                if (ev.tipo_evento === 'gol2') { tipoLabel = "GOL DOBLE (+2)"; claseColor = "event-gol2"; icono = "🚀"; }
                if (ev.tipo_evento === 'amarilla') { tipoLabel = "AMARILLA"; claseColor = "event-amarilla"; icono = "🟨"; }
                if (ev.tipo_evento === '2min' || ev.tipo_evento === 'exclusion') { tipoLabel = "EXCLUSIÓN"; claseColor = "event-2min"; icono = "⏱️"; }
                if (ev.tipo_evento === 'roja') { tipoLabel = "ROJA"; claseColor = "event-roja"; icono = "🟥"; }

                const ladoClase = (ev.equipo_id === idLocal) ? 'local' : 'visitante';
                const nuevoEventoHtml = `
                <div class="timeline-item ${ladoClase}" style="animation: highlightNew 2s ease;">
                    <div class="timeline-icon">${ev.minuto}'</div>
                    <div class="timeline-content">
                        <h4 style="font-size:0.8rem; margin-bottom:2px;">${icono} ${ev.nombre_jugador} <small style="color:var(--accent)">(#${ev.dorsal})</small></h4>
                        <p><span class="tipo-evento ${claseColor}" style="font-size:0.6rem;">${tipoLabel}</span></p>
                    </div>
                </div>`;
                container.insertAdjacentHTML('afterbegin', nuevoEventoHtml);
            }
        }).subscribe();
}

window.abrirActaDetallada = async function (partidoId, nombreLocal, nombreVis, gl, gv, idLocal, idVis) {
    const elEquipos = document.getElementById('acta-info-equipos');
    if (elEquipos) elEquipos.innerText = `${nombreLocal} vs ${nombreVis}`;

    const elResultado = document.getElementById('acta-resultado-final');
    if (elResultado) elResultado.innerText = `${gl} - ${gv}`;

    const container = document.getElementById('timeline-container');
    const tablaLocalContainer = document.getElementById('acta-tabla-local-container');
    const tablaVisContainer = document.getElementById('acta-tabla-vis-container');

    if (container) container.innerHTML = '<p style="text-align:center; color:var(--muted);">Cargando acta...</p>';
    if (tablaLocalContainer) tablaLocalContainer.innerHTML = '<p style="text-align:center; color:var(--muted);">Cargando...</p>';
    if (tablaVisContainer) tablaVisContainer.innerHTML = '<p style="text-align:center; color:var(--muted);">Cargando...</p>';

    const modal = document.getElementById('modal-ver-acta');
    if (modal) modal.style.display = 'flex';

    const { data: partidoActual } = await supabase.from('partidos').select('estado').eq('id', partidoId).single();
    const isLive = partidoActual && partidoActual.estado === 'en_curso';

    const liveIndicator = document.getElementById('live-indicator');
    if (liveIndicator) liveIndicator.style.display = isLive ? 'block' : 'none';

    if (isLive) {
        suscribirseAMinutoAMinuto(partidoId, idLocal);
    } else {
        if (canalEventosActivo) supabase.removeChannel(canalEventosActivo);
    }

    const { data: eventos } = await supabase.from('eventos_partido').select('*').eq('partido_id', partidoId).order('minuto', { ascending: false });
    const { data: rosterLocal } = await supabase.from('jugadores').select('*').eq('equipo_id', idLocal).order('dorsal', { ascending: true });
    const { data: rosterVis } = await supabase.from('jugadores').select('*').eq('equipo_id', idVis).order('dorsal', { ascending: true });

    function generarTabla(roster, equipoNombre) {
        let html = `<h4 style="color:var(--accent); margin-bottom:10px; font-size:0.85rem; text-transform:uppercase;">${equipoNombre}</h4><table class="stats-table" style="min-width:100%; font-size:0.75rem;"><thead><tr><th style="padding:8px; width:10%;">#</th><th style="padding:8px; width:50%; text-align:left;">Jugador</th><th style="padding:8px; text-align:center;">G</th><th style="padding:8px; text-align:center;">🟨</th><th style="padding:8px; text-align:center;">⏱️</th><th style="padding:8px; text-align:center;">🟥</th></tr></thead><tbody>`;

        if (roster && roster.length > 0) {
            roster.forEach(jugador => {
                let goles = 0; let ama = 0; let dosmin = 0; let roja = 0;
                if (eventos) {
                    eventos.forEach(ev => {
                        if (ev.jugador_id === jugador.id) {
                            if (ev.tipo_evento === 'gol' || ev.tipo_evento === 'gol1') goles += 1;
                            if (ev.tipo_evento === 'gol2') goles += 2;
                            if (ev.tipo_evento === 'amarilla') ama += 1;
                            if (ev.tipo_evento === '2min' || ev.tipo_evento === 'exclusion') dosmin += 1;
                            if (ev.tipo_evento === 'roja') roja += 1;
                        }
                    });
                }
                html += `<tr><td style="padding:8px; font-weight:bold; border-bottom:1px solid rgba(255,255,255,0.05);">${jugador.dorsal}</td><td style="padding:8px; white-space:normal; line-height:1.2; border-bottom:1px solid rgba(255,255,255,0.05); text-align:left;">${jugador.nombre}</td><td style="padding:8px; text-align:center; font-weight:bold; color:var(--success); border-bottom:1px solid rgba(255,255,255,0.05);">${goles > 0 ? goles : ''}</td><td style="padding:8px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.05);">${ama > 0 ? ama : ''}</td><td style="padding:8px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.05);">${dosmin > 0 ? dosmin : ''}</td><td style="padding:8px; text-align:center; color:var(--danger); border-bottom:1px solid rgba(255,255,255,0.05);">${roja > 0 ? roja : ''}</td></tr>`;
            });
        } else {
            html += `<tr><td colspan="6" style="text-align:center; padding:10px;">Plantilla no registrada</td></tr>`;
        }
        html += `</tbody></table>`;
        return html;
    }

    if (tablaLocalContainer) tablaLocalContainer.innerHTML = generarTabla(rosterLocal, nombreLocal);
    if (tablaVisContainer) tablaVisContainer.innerHTML = generarTabla(rosterVis, nombreVis);

    if (container) {
        container.innerHTML = '';
        if (eventos && eventos.length > 0) {
            eventos.forEach(ev => {
                let tipoLabel = ""; let claseColor = ""; let icono = "";
                if (ev.tipo_evento === 'gol' || ev.tipo_evento === 'gol1') { tipoLabel = "GOL (+1)"; claseColor = "event-gol"; icono = "⚽"; }
                if (ev.tipo_evento === 'gol2') { tipoLabel = "GOL DOBLE (+2)"; claseColor = "event-gol2"; icono = "🚀"; }
                if (ev.tipo_evento === 'amarilla') { tipoLabel = "AMARILLA"; claseColor = "event-amarilla"; icono = "🟨"; }
                if (ev.tipo_evento === '2min' || ev.tipo_evento === 'exclusion') { tipoLabel = "EXCLUSIÓN"; claseColor = "event-2min"; icono = "⏱️"; }
                if (ev.tipo_evento === 'roja') { tipoLabel = "ROJA"; claseColor = "event-roja"; icono = "🟥"; }

                const ladoClase = (ev.equipo_id === idLocal) ? 'local' : 'visitante';
                container.innerHTML += `<div class="timeline-item ${ladoClase}"><div class="timeline-icon">${ev.minuto}'</div><div class="timeline-content"><h4 style="font-size:0.8rem; margin-bottom:2px;">${icono} ${ev.nombre_jugador} <small style="color:var(--accent)">(#${ev.dorsal})</small></h4><p><span class="tipo-evento ${claseColor}" style="font-size:0.6rem;">${tipoLabel}</span></p></div></div>`;
            });
        } else {
            container.innerHTML = '<p style="text-align:center; color:var(--muted); margin-top:20px; font-size:0.8rem;">Este partido se registró sin eventos minuto a minuto.</p>';
        }
    }
};

onClickSafe('btn-descargar-pdf', async function (e) {
    const btn = e.currentTarget;
    btn.innerText = "Preparando documento oficial...";
    btn.disabled = true;

    const tituloEquipos = document.getElementById('acta-info-equipos').innerText;
    const resultadoFinal = document.getElementById('acta-resultado-final').innerText;
    const tablaLocalHTML = document.getElementById('acta-tabla-local-container').innerHTML;
    const tablaVisHTML = document.getElementById('acta-tabla-vis-container').innerHTML;
    const timelineHTML = document.getElementById('timeline-container').innerHTML;

    const limpiarParaImpresion = (htmlString) => {
        return htmlString.replace(/class="stats-table"/g, 'class="pdf-table"').replace(/class="timeline-item/g, 'class="pdf-timeline-item').replace(/class="timeline-icon/g, 'class="pdf-timeline-icon').replace(/class="timeline-content/g, 'class="pdf-timeline-content').replace(/var\(--success\)/g, '#10b981').replace(/var\(--danger\)/g, '#ef4444').replace(/var\(--accent\)/g, '#000000').replace(/rgba\(255,255,255,0.05\)/g, '#dddddd').replace(/color:\s*var\(--text\)/g, 'color: #000000');
    };

    const printContainer = document.createElement('div');
    printContainer.innerHTML = `
        <div style="padding: 20px 30px; background: #ffffff; color: #000000; font-family: Arial, sans-serif; width: 700px; box-sizing: border-box; margin: 0 auto;">
            <style>
                .pdf-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; table-layout: fixed; }
                .pdf-table th, .pdf-table td { border-bottom: 1px solid #ddd; padding: 6px 2px; text-align: center; color: #000; word-wrap: break-word; }
                .pdf-table th:nth-child(2), .pdf-table td:nth-child(2) { text-align: left; width: 45%; }
                .pdf-table th:nth-child(1), .pdf-table td:nth-child(1) { width: 10%; }
                .pdf-timeline-item { margin-bottom: 8px; display: flex; align-items: flex-start; page-break-inside: avoid; }
                .pdf-timeline-icon { font-weight: bold; width: 35px; color: #000; font-size: 12px; flex-shrink: 0; }
                .pdf-timeline-content { flex: 1; }
                .pdf-timeline-content h4 { margin: 0; font-size: 12px; color: #000; }
                .pdf-timeline-content p { margin: 0; font-size: 10px; color: #555; }
            </style>
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="margin: 0; font-size: 24px; color: #000; text-transform: uppercase;">Acta Oficial del Partido</h1>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Federación Extremeña de Balonmano - StatPro</p>
            </div>
            <div style="text-align: center; margin-bottom: 25px;"><h2 style="font-size: 20px; color: #000; margin: 0;">${tituloEquipos}</h2><h1 style="font-size: 36px; font-weight: 900; margin: 10px 0; color: #000;">${resultadoFinal}</h1></div>
            <div style="display: flex; justify-content: space-between; gap: 15px; margin-bottom: 25px; page-break-inside: avoid;">
                <div style="flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 10px; background: #fafafa; overflow: hidden;">${limpiarParaImpresion(tablaLocalHTML)}</div>
                <div style="flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 10px; background: #fafafa; overflow: hidden;">${limpiarParaImpresion(tablaVisHTML)}</div>
            </div>
            <div style="border-top: 2px solid #000; padding-top: 15px;">
                <h3 style="margin-bottom: 15px; font-size: 14px; color: #000; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Eventos del Partido (Minuto a Minuto)</h3>
                <div style="column-count: 2; column-gap: 30px;">${limpiarParaImpresion(timelineHTML)}</div>
            </div>
        </div>
    `;

    document.body.appendChild(printContainer);

    const opt = { margin: [10, 10, 10, 10], filename: `Acta.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, logging: false }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };

    try {
        await html2pdf().set(opt).from(printContainer.firstElementChild).save();
        mostrarNotificacion("PDF generado con éxito", "success");
    } catch (err) {
        mostrarNotificacion("Error generando PDF", "error");
    }

    document.body.removeChild(printContainer);
    btn.innerText = "📄 Descargar Acta en PDF";
    btn.disabled = false;
});

// =========================================================
// ================ PANEL ADMINISTRADOR (REPARADO) =========
// =========================================================

// Listeners de las pestañas
onClickSafe('tab-admin-solicitudes', () => cambiarTabAdmin('solicitudes'));
onClickSafe('tab-admin-equipos', () => cambiarTabAdmin('equipos'));

function cambiarTabAdmin(tab) {
    // Gestionar clases activas en los botones
    const tabS = document.getElementById('tab-admin-solicitudes');
    const tabE = document.getElementById('tab-admin-equipos');
    if (tabS) tabS.classList.remove('active');
    if (tabE) tabE.classList.remove('active');

    const activeTab = document.getElementById(`tab-admin-${tab}`);
    if (activeTab) activeTab.classList.add('active');

    // Gestionar visibilidad de los contenidos
    const contentS = document.getElementById('admin-content-solicitudes');
    const contentE = document.getElementById('admin-content-equipos');
    const contentP = document.getElementById('admin-content-partidos'); // Por si acaso sigue en el HTML

    if (contentS) contentS.style.display = 'none';
    if (contentE) contentE.style.display = 'none';
    if (contentP) contentP.style.display = 'none';

    const block = document.getElementById(`admin-content-${tab}`);
    if (block) block.style.display = 'block';

    // Cargar los datos según la pestaña
    if (tab === 'solicitudes') cargarAdminSolicitudes();
    if (tab === 'equipos') cargarAdminEquipos();
}

// --- 1. GESTIÓN DE SOLICITUDES Y ROLES ---
async function cargarAdminSolicitudes() {
    const tbody = document.getElementById('tabla-body-solicitudes');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">Cargando usuarios...</td></tr>';

    const { data, error } = await supabase.from('perfiles').select('*');

    if (error) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--danger);">Error: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(u => {
            let rolTexto = "Espectador"; 
            let estadoBadge = `<span style="color: var(--muted); font-weight:bold;">Sin Rol</span>`; 
            let botonesAccion = `<span style="color:var(--muted); font-size: 0.7rem;">Ninguna</span>`;

            if (u.is_admin) { 
                rolTexto = "Admin"; 
                estadoBadge = `<span style="color: var(--accent); font-weight:bold;">👑 ADMIN</span>`; 
                botonesAccion = `<span style="color:var(--muted); font-size: 0.7rem;">Intocable</span>`; 
            }
            else if (u.is_coach) { 
                rolTexto = "Entrenador"; 
                estadoBadge = `<span style="color: var(--success); font-weight:bold;">✅ Activo</span>`; 
                botonesAccion = `<button onclick="revocarRol('${u.id}', 'Entrenador')" class="btn-danger" style="padding:5px 10px; font-size:0.7rem;">Quitar Rol</button>`; 
            }
            else if (u.is_mesa) { 
                rolTexto = "Mesa"; 
                estadoBadge = `<span style="color: var(--success); font-weight:bold;">✅ Activo</span>`; 
                botonesAccion = `<button onclick="revocarRol('${u.id}', 'Mesa')" class="btn-danger" style="padding:5px 10px; font-size:0.7rem;">Quitar Rol</button>`; 
            }
            else if (u.solicita_entrenador) { 
                rolTexto = "Entrenador"; 
                estadoBadge = `<span style="color: #f59e0b; font-weight:bold;">⏳ Pendiente</span>`; 
                botonesAccion = `<button onclick="aprobarRol('${u.id}', 'Entrenador')" class="btn-ghost" style="background:var(--success); padding:5px 10px; font-size:0.7rem; margin-right:5px;">✔️ Aceptar</button> <button onclick="rechazarRol('${u.id}', 'Entrenador')" class="btn-danger" style="padding:5px 10px; font-size:0.7rem;">❌ Rechazar</button>`; 
            }
            else if (u.solicita_mesa) { 
                rolTexto = "Mesa"; 
                estadoBadge = `<span style="color: #f59e0b; font-weight:bold;">⏳ Pendiente</span>`; 
                botonesAccion = `<button onclick="aprobarRol('${u.id}', 'Mesa')" class="btn-ghost" style="background:var(--success); padding:5px 10px; font-size:0.7rem; margin-right:5px;">✔️ Aceptar</button> <button onclick="rechazarRol('${u.id}', 'Mesa')" class="btn-danger" style="padding:5px 10px; font-size:0.7rem;">❌ Rechazar</button>`; 
            }

            tbody.innerHTML += `<tr><td class="name-col">${u.email}<br><small style="color:var(--accent)">Rol: ${rolTexto}</small></td><td>${estadoBadge}</td><td>${botonesAccion}</td></tr>`;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:var(--muted);">No hay usuarios registrados</td></tr>';
    }
}

window.aprobarRol = async function (id, tipo) {
    if (confirm(`¿Aprobar permisos de ${tipo}?`)) {
        try {
            if (tipo === 'Entrenador') await supabase.from('perfiles').update({ is_coach: true, solicita_entrenador: false }).eq('id', id);
            if (tipo === 'Mesa') await supabase.from('perfiles').update({ is_mesa: true, solicita_mesa: false }).eq('id', id);
            mostrarNotificacion("Permiso concedido", "success");
            cargarAdminSolicitudes();
        } catch (err) { mostrarNotificacion("Error al aprobar rol", "error"); }
    }
};

window.rechazarRol = async function (id, tipo) {
    if (confirm("¿Rechazar solicitud?")) {
        try {
            if (tipo === 'Entrenador') await supabase.from('perfiles').update({ solicita_entrenador: false }).eq('id', id);
            if (tipo === 'Mesa') await supabase.from('perfiles').update({ solicita_mesa: false }).eq('id', id);
            mostrarNotificacion("Solicitud denegada", "info");
            cargarAdminSolicitudes();
        } catch (err) { mostrarNotificacion("Error de conexión", "error"); }
    }
};

window.revocarRol = async function (id, tipo) {
    if (confirm(`⚠️ ¿Seguro que quieres QUITARLE el rol de ${tipo}?`)) {
        try {
            if (tipo === 'Entrenador') await supabase.from('perfiles').update({ is_coach: false, solicita_entrenador: false }).eq('id', id);
            if (tipo === 'Mesa') await supabase.from('perfiles').update({ is_mesa: false, solicita_mesa: false }).eq('id', id);
            mostrarNotificacion(`Rol revocado`, "success");
            cargarAdminSolicitudes();
        } catch (err) { mostrarNotificacion("Error al revocar rol", "error"); }
    }
};

// --- 2. GESTIÓN DE TODOS LOS EQUIPOS ---
async function cargarAdminEquipos() {
    const contentE = document.getElementById('admin-content-equipos');
    if (!contentE) return;

    contentE.innerHTML = `
        <h3 style="color:var(--text); margin-bottom:15px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">Equipos Registrados</h3>
        <div class="table-responsive">
            <table class="stats-table" style="width:100%;">
                <thead>
                    <tr>
                        <th style="text-align:left;">Equipo</th>
                        <th style="text-align:left;">Categoría</th>
                        <th style="text-align:center;">Acción</th>
                    </tr>
                </thead>
                <tbody id="tbody-admin-equipos-dinamico">
                    <tr><td colspan="3" style="text-align:center; padding: 20px;">Cargando equipos...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    const tbody = document.getElementById('tbody-admin-equipos-dinamico');
    const { data, error } = await supabase.from('equipos').select('*').order('nombre_equipo', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--danger);">Error: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(eq => {
            const logoHtml = eq.escudo_url 
                ? `<img src="${eq.escudo_url}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">` 
                : `🛡️`;
            tbody.innerHTML += `
                <tr>
                    <td style="display:flex; align-items:center; gap:10px; border:none;">${logoHtml} <strong>${eq.nombre_equipo}</strong></td>
                    <td>${eq.categoria} ${eq.genero}</td>
                    <td style="text-align:center;">
                        <button onclick="abrirDashboardEquipo('${eq.id}')" class="btn-primary-pro" style="padding:5px 10px; font-size:0.7rem; width:auto;">👁️ Ver</button>
                    </td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:var(--muted);">No hay equipos</td></tr>';
    }
}

window.aprobarRol = async function (id, tipo) {
    if (confirm(`¿Aprobar permisos de ${tipo}?`)) {
        try {
            if (tipo === 'Entrenador') await supabase.from('perfiles').update({ is_coach: true, solicita_entrenador: false }).eq('id', id);
            if (tipo === 'Mesa') await supabase.from('perfiles').update({ is_mesa: true, solicita_mesa: false }).eq('id', id);
            mostrarNotificacion("Permiso concedido", "success");
            cargarAdminSolicitudes();
        } catch (err) { mostrarNotificacion("Error al aprobar rol", "error"); }
    }
};

window.rechazarRol = async function (id, tipo) {
    if (confirm("¿Rechazar solicitud?")) {
        try {
            if (tipo === 'Entrenador') await supabase.from('perfiles').update({ solicita_entrenador: false }).eq('id', id);
            if (tipo === 'Mesa') await supabase.from('perfiles').update({ solicita_mesa: false }).eq('id', id);
            mostrarNotificacion("Solicitud denegada", "info");
            cargarAdminSolicitudes();
        } catch (err) { mostrarNotificacion("Error de conexión", "error"); }
    }
};

window.revocarRol = async function (id, tipo) {
    if (confirm(`⚠️ ¿Seguro que quieres QUITARLE el rol de ${tipo}?`)) {
        try {
            if (tipo === 'Entrenador') await supabase.from('perfiles').update({ is_coach: false, solicita_entrenador: false }).eq('id', id);
            if (tipo === 'Mesa') await supabase.from('perfiles').update({ is_mesa: false, solicita_mesa: false }).eq('id', id);
            mostrarNotificacion(`Rol revocado`, "success");
            cargarAdminSolicitudes();
        } catch (err) { mostrarNotificacion("Error al revocar rol", "error"); }
    }
};

// =========================================================
// ====== GESTIÓN DE MIS EQUIPOS (MULTI-TEAM DASHBOARD) ====
// =========================================================

async function verificarEquipoEntrenador() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return mostrarSeccion('vista-login');
    }

    const { data: equipos } = await supabase.from('equipos').select('*').eq('user_id', user.id).order('created_at', { ascending: false });

    if (equipos && equipos.length > 0) {
        mostrarSeccion('vista-mis-equipos');
        renderLobbyEquipos(equipos);
    } else {
        mostrarSeccion('vista-crear-equipo');
        const btnL = document.getElementById('btn-volver-lobby');
        if (btnL) btnL.style.display = 'none';
    }
}

function renderLobbyEquipos(equipos) {
    const grid = document.getElementById('grid-mis-equipos');
    if (!grid) return;

    grid.innerHTML = '';
    equipos.forEach(eq => {
        grid.innerHTML += `
            <div class="team-card" onclick="abrirDashboardEquipo('${eq.id}')">
                <h3 style="color:var(--text); font-size:1.3rem;">${eq.nombre_equipo}</h3>
                <p style="color:var(--muted); font-size:0.85rem;"><strong style="color:var(--accent)">${eq.modalidad}</strong> | ${eq.categoria} ${eq.genero}</p>
            </div>
        `;
    });
}

// =========================================================
// 📊 GRÁFICOS BIG DATA DEL EQUIPO
// =========================================================

async function cargarGraficosEquipo(equipoId) {
    const { data: jugadores } = await supabase.from('jugadores').select('posicion, goles').eq('equipo_id', equipoId);
    let statsPos = { 'Portero': 0, 'Central': 0, 'Lateral': 0, 'Extremo': 0, 'Pivote': 0 };

    if (jugadores) {
        jugadores.forEach(j => {
            if (statsPos[j.posicion] !== undefined) {
                statsPos[j.posicion] += (j.goles || 0);
            }
        });
    }

    const ctxPos = document.getElementById('chart-posiciones');
    if (chartPosiciones) {
        chartPosiciones.destroy();
    }

    Chart.defaults.color = '#a1a1aa';
    Chart.defaults.font.family = "'Inter', sans-serif";

    if (ctxPos) {
        chartPosiciones = new Chart(ctxPos, {
            type: 'doughnut',
            data: {
                labels: Object.keys(statsPos),
                datasets: [{
                    data: Object.values(statsPos),
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                },
                cutout: '75%'
            }
        });
    }

    const { data: partidos } = await supabase.from('partidos')
        .select('*')
        .or(`equipo_local_id.eq.${equipoId},equipo_visitante_id.eq.${equipoId}`)
        .eq('estado', 'finalizado')
        .order('created_at', { ascending: false })
        .limit(5);

    let labelsRacha = [];
    let dataGF = [];
    let dataGC = [];

    if (partidos && partidos.length > 0) {
        partidos.reverse().forEach((p, idx) => {
            labelsRacha.push(`P. ${idx + 1}`);
            if (p.equipo_local_id === equipoId) {
                dataGF.push(p.goles_local);
                dataGC.push(p.goles_visitante);
            } else {
                dataGF.push(p.goles_visitante);
                dataGC.push(p.goles_local);
            }
        });
    }

    const ctxRacha = document.getElementById('chart-racha');
    if (chartRacha) {
        chartRacha.destroy();
    }

    if (ctxRacha) {
        chartRacha = new Chart(ctxRacha, {
            type: 'bar',
            data: {
                labels: labelsRacha.length > 0 ? labelsRacha : ['Sin datos'],
                datasets: [
                    { label: 'Goles A Favor', data: dataGF.length > 0 ? dataGF : [0], backgroundColor: '#10b981', borderRadius: 4 },
                    { label: 'Goles En Contra', data: dataGC.length > 0 ? dataGC : [0], backgroundColor: '#ef4444', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
}

window.abrirDashboardEquipo = async function (idEquipo) {
    const { data } = await supabase.from('equipos').select('*').eq('id', idEquipo).single();

    if (data) {
        miEquipoId = data.id;
        miEquipoActual = data;

        const logoImg = document.getElementById('coach-team-logo');
        if (logoImg) {
            if (data.escudo_url) {
                logoImg.src = data.escudo_url;
                logoImg.style.display = 'block';
            } else {
                logoImg.style.display = 'none';
            }
        }

        const cName = document.getElementById('coach-team-name');
        if (cName) cName.innerText = data.nombre_equipo;

        const cInfo = document.getElementById('coach-team-info');
        if (cInfo) cInfo.innerText = `${data.categoria} ${data.genero} | ${data.modalidad}`;

        let staffText = `Entrenador: ${data.entrenador_principal}`;
        if (data.staff_1 || data.staff_2 || data.staff_3) {
            staffText += ` | Staff: ` + [data.staff_1, data.staff_2, data.staff_3].filter(Boolean).join(", ");
        }

        const cStaff = document.getElementById('coach-staff-info');
        if (cStaff) cStaff.innerText = staffText;

        if (!isAdminMode) {
            const btnEq = document.getElementById('btn-volver-mis-equipos');
            if (btnEq) btnEq.style.display = 'inline-block';

            const btnAd = document.getElementById('btn-volver-admin-panel');
            if (btnAd) btnAd.style.display = 'none';
        } else {
            const btnEq = document.getElementById('btn-volver-mis-equipos');
            if (btnEq) btnEq.style.display = 'none';

            const btnAd = document.getElementById('btn-volver-admin-panel');
            if (btnAd) btnAd.style.display = 'inline-block';
        }

        mostrarSeccion('vista-entrenador');
        cargarMiPlantilla();
        cargarGraficosEquipo(miEquipoId);
    }
};

onClickSafe('btn-editar-info-equipo', function () {
    if (!miEquipoActual) return;

    const i1 = document.getElementById('info-eq-nombre');
    if (i1) i1.value = miEquipoActual.nombre_equipo;

    const i2 = document.getElementById('info-eq-entrenador');
    if (i2) i2.value = miEquipoActual.entrenador_principal;

    const i3 = document.getElementById('info-eq-mod');
    if (i3) i3.value = miEquipoActual.modalidad;

    const i4 = document.getElementById('info-eq-gen');
    if (i4) i4.value = miEquipoActual.genero;

    const i5 = document.getElementById('info-eq-cat');
    if (i5) i5.value = miEquipoActual.categoria;

    const i6 = document.getElementById('info-eq-staff1');
    if (i6) i6.value = miEquipoActual.staff_1 || "";

    const i7 = document.getElementById('info-eq-staff2');
    if (i7) i7.value = miEquipoActual.staff_2 || "";

    const i8 = document.getElementById('info-eq-staff3');
    if (i8) i8.value = miEquipoActual.staff_3 || "";

    const mod = document.getElementById('modal-editar-info-equipo');
    if (mod) mod.style.display = 'flex';
});

onClickSafe('btn-editar-equipo-stats', function () {
    if (!miEquipoActual) return;

    const p1 = document.getElementById('edit-eq-pj');
    if (p1) p1.value = miEquipoActual.jugados || 0;

    const p2 = document.getElementById('edit-eq-ptos');
    if (p2) p2.value = miEquipoActual.puntos || 0;

    const p3 = document.getElementById('edit-eq-pg');
    if (p3) p3.value = miEquipoActual.victorias || 0;

    const p4 = document.getElementById('edit-eq-pe');
    if (p4) p4.value = miEquipoActual.empates || 0;

    const p5 = document.getElementById('edit-eq-pp');
    if (p5) p5.value = miEquipoActual.derrotas || 0;

    const p6 = document.getElementById('edit-eq-gf');
    if (p6) p6.value = miEquipoActual.goles_favor || 0;

    const p7 = document.getElementById('edit-eq-gc');
    if (p7) p7.value = miEquipoActual.goles_contra || 0;

    const mod = document.getElementById('modal-equipo-stats');
    if (mod) mod.style.display = 'flex';
});

onClickSafe('btn-guardar-info-equipo', async function (e) {
    const btn = e.currentTarget;
    btn.innerText = "Guardando...";
    btn.disabled = true;

    let urlEscudo = await subirArchivoStorage('info-eq-escudo', 'escudos');

    const i1 = document.getElementById('info-eq-nombre');
    const i2 = document.getElementById('info-eq-entrenador');
    const i3 = document.getElementById('info-eq-mod');
    const i4 = document.getElementById('info-eq-gen');
    const i5 = document.getElementById('info-eq-cat');
    const i6 = document.getElementById('info-eq-staff1');
    const i7 = document.getElementById('info-eq-staff2');
    const i8 = document.getElementById('info-eq-staff3');

    const upd = {
        nombre_equipo: i1 ? i1.value : '',
        entrenador_principal: i2 ? i2.value : '',
        modalidad: i3 ? i3.value : '',
        genero: i4 ? i4.value : '',
        categoria: i5 ? i5.value : '',
        staff_1: i6 ? i6.value : '',
        staff_2: i7 ? i7.value : '',
        staff_3: i8 ? i8.value : '',
    };

    if (urlEscudo) {
        upd.escudo_url = urlEscudo;
    }

    await supabase.from('equipos').update(upd).eq('id', miEquipoId);

    const mod = document.getElementById('modal-editar-info-equipo');
    if (mod) mod.style.display = 'none';

    btn.innerText = "💾 Guardar Información";
    btn.disabled = false;

    if (isAdminMode) {
        abrirDashboardEquipo(miEquipoId);
    } else {
        verificarEquipoEntrenador();
    }
});

onClickSafe('btn-guardar-equipo-stats', async function () {
    const p1 = document.getElementById('edit-eq-pj');
    const p2 = document.getElementById('edit-eq-ptos');
    const p3 = document.getElementById('edit-eq-pg');
    const p4 = document.getElementById('edit-eq-pe');
    const p5 = document.getElementById('edit-eq-pp');
    const p6 = document.getElementById('edit-eq-gf');
    const p7 = document.getElementById('edit-eq-gc');

    const upd = {
        jugados: parseInt(p1 ? p1.value : 0),
        puntos: parseInt(p2 ? p2.value : 0),
        victorias: parseInt(p3 ? p3.value : 0),
        empates: parseInt(p4 ? p4.value : 0),
        derrotas: parseInt(p5 ? p5.value : 0),
        goles_favor: parseInt(p6 ? p6.value : 0),
        goles_contra: parseInt(p7 ? p7.value : 0)
    };

    await supabase.from('equipos').update(upd).eq('id', miEquipoId);

    const mod = document.getElementById('modal-equipo-stats');
    if (mod) mod.style.display = 'none';

    if (isAdminMode) {
        abrirDashboardEquipo(miEquipoId);
    } else {
        verificarEquipoEntrenador();
    }
});

onClickSafe('btn-volver-admin-panel', () => {
    mostrarSeccion('vista-admin');
    cargarAdminEquipos();
});

onClickSafe('btn-volver-mis-equipos', () => verificarEquipoEntrenador());

onClickSafe('btn-ir-crear-equipo', () => {
    mostrarSeccion('vista-crear-equipo');
    const btn = document.getElementById('btn-volver-lobby');
    if (btn) btn.style.display = 'inline-block';
});

onClickSafe('btn-volver-lobby', () => verificarEquipoEntrenador());

onClickSafe('btn-guardar-equipo', async function (e) {
    const btn = e.currentTarget;
    btn.innerText = "Creando...";
    btn.disabled = true;

    const inputNombre = document.getElementById('new-equipo-nombre');
    const inputEntrenador = document.getElementById('new-equipo-entrenador');
    const inputMod = document.getElementById('new-equipo-mod');
    const inputGen = document.getElementById('new-equipo-gen');
    const inputCat = document.getElementById('new-equipo-cat');

    const nombre = inputNombre ? inputNombre.value : '';
    const entrenador = inputEntrenador ? inputEntrenador.value : '';
    const mod = inputMod ? inputMod.value : '';
    const gen = inputGen ? inputGen.value : '';
    const cat = inputCat ? inputCat.value : '';

    if (!nombre || !entrenador) {
        btn.innerText = "💾 Guardar Equipo";
        btn.disabled = false;
        return mostrarNotificacion("Nombre de equipo y entrenador son obligatorios", "error");
    }

    let urlEscudo = await subirArchivoStorage('new-equipo-escudo', 'escudos');
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase.from('equipos').insert([{
        nombre_equipo: nombre,
        modalidad: mod,
        genero: gen,
        categoria: cat,
        entrenador_principal: entrenador,
        user_id: user.id,
        escudo_url: urlEscudo
    }]).select().single();

    btn.innerText = "💾 Guardar Equipo";
    btn.disabled = false;

    const eqName = document.getElementById('new-equipo-nombre');
    if (eqName) eqName.value = '';

    const eqEsc = document.getElementById('new-equipo-escudo');
    if (eqEsc) eqEsc.value = '';

    if (!error) {
        abrirDashboardEquipo(data.id);
    } else {
        mostrarNotificacion(error.message, "error");
    }
});

onClickSafe('btn-borrar-equipo', async function () {
    if (confirm("⚠️ ¿Seguro que quieres borrar este equipo? Se borrarán TODOS los jugadores y estadísticas.")) {
        await supabase.from('equipos').delete().eq('id', miEquipoId);
        miEquipoId = null;
        miEquipoActual = null;

        if (isAdminMode) {
            mostrarSeccion('vista-admin');
            cargarAdminEquipos();
        } else {
            verificarEquipoEntrenador();
        }
    }
});

// =========================================================
// ================ GESTIÓN DE PLANTILLA ===================
// =========================================================

async function cargarMiPlantilla() {
    if (!miEquipoId) return;

    const { data } = await supabase.from('jugadores').select('*, equipos(categoria, genero)').eq('equipo_id', miEquipoId).order('dorsal', { ascending: true });
    const grid = document.getElementById('lista-mis-jugadores');
    if (!grid) return;

    grid.innerHTML = '';

    if (data && data.length > 0) {
        data.forEach(j => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.innerHTML = `
                <div class="player-badge">${j.equipos?.categoria || ''}</div>
                <div class="player-number">${j.dorsal}</div>
                <div class="player-info">
                    <h4>${j.nombre}</h4>
                    <p>${j.posicion}</p>
                </div>
            `;
            card.onclick = () => abrirEstadisticas(j);
            grid.appendChild(card);
        });
    } else {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1; padding: 20px; color: var(--muted);">Plantilla vacía.</div>';
    }
}

onClickSafe('btn-add-jugador', async function (e) {
    const btn = e.currentTarget;
    btn.innerText = "Añadiendo...";
    btn.disabled = true;

    const inputNombre = document.getElementById('add-nombre');
    const inputDorsal = document.getElementById('add-dorsal');
    const inputPosicion = document.getElementById('add-posicion');

    const nombre = inputNombre ? inputNombre.value : '';
    const dorsal = inputDorsal ? inputDorsal.value : '';
    const posicion = inputPosicion ? inputPosicion.value : '';

    if (!nombre || !dorsal) {
        btn.innerText = "✚ Dar de Alta";
        btn.disabled = false;
        return mostrarNotificacion("Datos incompletos", "error");
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('jugadores').insert([{
        nombre,
        dorsal: parseInt(dorsal),
        posicion,
        equipo_id: miEquipoId,
        user_id: user.id
    }]);

    btn.innerText = "✚ Dar de Alta";
    btn.disabled = false;

    if (!error) {
        const addN = document.getElementById('add-nombre');
        if (addN) addN.value = '';

        const addD = document.getElementById('add-dorsal');
        if (addD) addD.value = '';

        cargarMiPlantilla();
    } else {
        mostrarNotificacion(error.message, "error");
    }
});

function abrirEstadisticas(j) {
    jugadorEditandoId = j.id;

    const d1 = document.getElementById('modal-dorsal');
    if (d1) d1.innerText = j.dorsal;

    const d2 = document.getElementById('modal-nombre');
    if (d2) d2.innerText = j.nombre;

    const d3 = document.getElementById('modal-posicion');
    if (d3) d3.innerText = j.posicion;

    const s1 = document.getElementById('stat-goles');
    if (s1) s1.innerText = j.goles || 0;

    const s2 = document.getElementById('stat-partidos');
    if (s2) s2.innerText = j.partidos || 0;

    const s3 = document.getElementById('stat-exclusiones');
    if (s3) s3.innerText = j.exclusiones || 0;

    const s4 = document.getElementById('stat-amarillas');
    if (s4) s4.innerText = j.amarillas || 0;

    const s5 = document.getElementById('stat-rojas');
    if (s5) s5.innerText = j.rojas || 0;

    const e1 = document.getElementById('edit-nombre');
    if (e1) e1.value = j.nombre;

    const e2 = document.getElementById('edit-dorsal-input');
    if (e2) e2.value = j.dorsal;

    const e3 = document.getElementById('edit-posicion-input');
    if (e3) e3.value = j.posicion;

    const v1 = document.getElementById('stats-vista');
    if (v1) v1.style.display = 'grid';

    const v2 = document.getElementById('stats-edicion');
    if (v2) v2.style.display = 'none';

    const b1 = document.getElementById('btn-borrar-jugador');
    if (b1) b1.style.display = 'block';

    const b2 = document.getElementById('btn-editar-stats');
    if (b2) b2.style.display = 'block';

    const b3 = document.getElementById('btn-guardar-stats');
    if (b3) b3.style.display = 'none';

    const mod = document.getElementById('modal-estadisticas');
    if (mod) mod.style.display = 'flex';
}

onClickSafe('btn-editar-stats', function () {
    const editGoles = document.getElementById('edit-goles');
    if (editGoles) {
        const statGoles = document.getElementById('stat-goles');
        editGoles.value = statGoles ? statGoles.innerText : 0;
    }

    const editPartidos = document.getElementById('edit-partidos');
    if (editPartidos) {
        const statPartidos = document.getElementById('stat-partidos');
        editPartidos.value = statPartidos ? statPartidos.innerText : 0;
    }

    const editExc = document.getElementById('edit-exclusiones');
    if (editExc) {
        const statExc = document.getElementById('stat-exclusiones');
        editExc.value = statExc ? statExc.innerText : 0;
    }

    const editAma = document.getElementById('edit-amarillas');
    if (editAma) {
        const statAma = document.getElementById('stat-amarillas');
        editAma.value = statAma ? statAma.innerText : 0;
    }

    const editRoj = document.getElementById('edit-rojas');
    if (editRoj) {
        const statRoj = document.getElementById('stat-rojas');
        editRoj.value = statRoj ? statRoj.innerText : 0;
    }

    const v1 = document.getElementById('stats-vista');
    if (v1) v1.style.display = 'none';

    const v2 = document.getElementById('stats-edicion');
    if (v2) v2.style.display = 'block';

    const b1 = document.getElementById('btn-borrar-jugador');
    if (b1) b1.style.display = 'none';

    const b2 = document.getElementById('btn-editar-stats');
    if (b2) b2.style.display = 'none';

    const b3 = document.getElementById('btn-guardar-stats');
    if (b3) b3.style.display = 'block';
});

onClickSafe('btn-guardar-stats', async function (e) {
    const btn = e.currentTarget;
    btn.innerText = "Guardando...";
    btn.disabled = true;

    const inputNombre = document.getElementById('edit-nombre');
    const inputDorsal = document.getElementById('edit-dorsal-input');
    const inputPosicion = document.getElementById('edit-posicion-input');
    const inputGoles = document.getElementById('edit-goles');
    const inputPartidos = document.getElementById('edit-partidos');
    const inputExc = document.getElementById('edit-exclusiones');
    const inputAma = document.getElementById('edit-amarillas');
    const inputRoj = document.getElementById('edit-rojas');

    const upd = {
        nombre: inputNombre ? inputNombre.value : '',
        dorsal: parseInt(inputDorsal ? inputDorsal.value : 0),
        posicion: inputPosicion ? inputPosicion.value : '',
        goles: parseInt(inputGoles ? inputGoles.value : 0),
        partidos: parseInt(inputPartidos ? inputPartidos.value : 0),
        exclusiones: parseInt(inputExc ? inputExc.value : 0),
        amarillas: parseInt(inputAma ? inputAma.value : 0),
        rojas: parseInt(inputRoj ? inputRoj.value : 0)
    };

    const { error } = await supabase.from('jugadores').update(upd).eq('id', jugadorEditandoId);

    btn.innerText = "💾 Guardar Cambios";
    btn.disabled = false;

    if (error) {
        mostrarNotificacion(error.message, "error");
    } else {
        const mod = document.getElementById('modal-estadisticas');
        if (mod) mod.style.display = 'none';

        cargarMiPlantilla();
        cargarGraficosEquipo(miEquipoId);
    }
});

onClickSafe('btn-borrar-jugador', async function () {
    if (confirm("⚠️ ¿Estás seguro de que quieres eliminar a este jugador de la plantilla?")) {
        await supabase.from('jugadores').delete().eq('id', jugadorEditandoId);

        const mod = document.getElementById('modal-estadisticas');
        if (mod) mod.style.display = 'none';

        cargarMiPlantilla();
        cargarGraficosEquipo(miEquipoId);
    }
});

// =========================================================
// ====== MODO RECUPERACIÓN Y ACTA EN VIVO =================
// =========================================================

async function cargarPartidosEnCurso() {
    const zona = document.getElementById('zona-partidos-en-curso');
    const grid = document.getElementById('grid-en-curso');
    if (!zona || !grid) return;

    const { data } = await supabase.from('partidos').select('*').eq('estado', 'en_curso').order('created_at', { ascending: false });

    if (data && data.length > 0) {
        zona.style.display = 'block';
        grid.innerHTML = '';

        data.forEach(p => {
            grid.innerHTML += `
            <div style="background: var(--bg); padding: 10px 15px; border-radius: 8px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="color:var(--text); font-size:0.9rem;">${p.nombre_local} ${p.goles_local} - ${p.goles_visitante} ${p.nombre_visitante}</strong><br>
                    <small style="color:var(--muted);">${p.categoria} ${p.genero} | Jor. ${p.jornada}</small>
                </div>
                <button onclick="reanudarActa('${p.id}')" class="btn-primary-pro" style="width: auto; padding: 6px 12px; font-size: 0.75rem;">Reanudar</button>
            </div>
            `;
        });
    } else {
        zona.style.display = 'none';
        grid.innerHTML = '';
    }
}

function bloquearConfigActa(bloquear) {
    const ids = ['partido-mod', 'partido-gen', 'partido-cat', 'partido-comp', 'partido-jornada', 'partido-local', 'partido-visitante'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = bloquear;
    });
}

window.reanudarActa = async function (idPartido) {
    const { data: p } = await supabase.from('partidos').select('*').eq('id', idPartido).single();
    if (!p) return;

    partidoEnDirectoId = p.id;

    document.getElementById('partido-mod').value = p.modalidad;
    document.getElementById('partido-gen').value = p.genero;
    document.getElementById('partido-cat').value = p.categoria;
    document.getElementById('partido-comp').value = p.competicion || 'liga';

    await cargarEquiposParaPartido();

    document.getElementById('partido-jornada').value = p.jornada;
    document.getElementById('partido-local').value = p.equipo_local_id;
    document.getElementById('partido-visitante').value = p.equipo_visitante_id;

    const obs = document.getElementById('partido-observaciones');
    if (obs) obs.value = p.observaciones || '';

    await actualizarPlantillasActa();

    const { data: eventos } = await supabase.from('eventos_partido').select('*').eq('partido_id', p.id).order('minuto', { ascending: true });

    eventosDraft = [];
    if (eventos) {
        eventosDraft = eventos.map(ev => ({
            id_temporal: ev.id,
            minuto: ev.minuto,
            equipo_id: ev.equipo_id,
            rol_equipo: (ev.equipo_id === p.equipo_local_id) ? 'local' : 'visitante',
            jugador_id: ev.jugador_id,
            nombre_jugador: ev.nombre_jugador,
            dorsal: ev.dorsal,
            tipo_evento: ev.tipo_evento
        }));
    }

    marcadorDraft = { local: p.goles_local, visitante: p.goles_visitante };
    actualizarVistaDraft();

    timerSeconds = p.tiempo_segundos || 0;
    updateTimerDisplay();

    bloquearConfigActa(true);

    const btnTog = document.getElementById('btn-timer-toggle');
    if (btnTog) btnTog.innerText = "▶ Reanudar Crono";

    mostrarNotificacion("Partido recuperado. Puedes continuar anotando.", "success");
};

function formatTimer(totalSeconds) {
    let m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    let s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function updateTimerDisplay() {
    const disp = document.getElementById('timer-display');
    if (disp) disp.innerText = formatTimer(timerSeconds);
}

onClickSafe('btn-timer-toggle', async function (e) {
    const btn = e.currentTarget;
    if (isTimerRunning) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        btn.innerText = "▶ Reanudar Cronómetro";
        btn.classList.replace('btn-danger', 'primary');

        if (partidoEnDirectoId) {
            supabase.from('partidos').update({ tiempo_segundos: timerSeconds }).eq('id', partidoEnDirectoId).then();
        }
    } else {
        isTimerRunning = true;
        btn.innerText = "⏸ Pausar";
        btn.classList.replace('primary', 'btn-danger');

        if (!btn.classList.contains('btn-danger')) {
            btn.style.background = 'var(--danger)';
            btn.style.color = 'white';
        }

        const inputLocal = document.getElementById('partido-local');
        const inputVis = document.getElementById('partido-visitante');

        const idLocal = inputLocal ? inputLocal.value : '';
        const idVis = inputVis ? inputVis.value : '';

        if (!idLocal || !idVis) {
            mostrarNotificacion("Selecciona los equipos antes de iniciar.", "error");
            isTimerRunning = false;
            btn.innerText = "▶ Iniciar Cronómetro";
            btn.classList.replace('btn-danger', 'primary');
            btn.style.background = '';
            return;
        }

        if (!partidoEnDirectoId) {
            const inputMod = document.getElementById('partido-mod');
            const inputGen = document.getElementById('partido-gen');
            const inputCat = document.getElementById('partido-cat');
            const inputJor = document.getElementById('partido-jornada');

            const modSelect = inputMod ? inputMod.value : '';
            const genSelect = inputGen ? inputGen.value : '';
            const catSelect = inputCat ? inputCat.value : '';
            const jornada = inputJor ? inputJor.value : '';

            const selL = document.getElementById('partido-local');
            const nombreLocal = selL ? selL.options[selL.selectedIndex].text : '';

            const selV = document.getElementById('partido-visitante');
            const nombreVis = selV ? selV.options[selV.selectedIndex].text : '';

            const { data } = await supabase.from('partidos').insert([{
                jornada: jornada,
                equipo_local_id: idLocal,
                equipo_visitante_id: idVis,
                nombre_local: nombreLocal,
                nombre_visitante: nombreVis,
                goles_local: 0,
                goles_visitante: 0,
                tiempo_segundos: timerSeconds,
                categoria: catSelect,
                genero: genSelect,
                modalidad: modSelect,
                estado: 'en_curso'
            }]).select().single();

            if (data) {
                partidoEnDirectoId = data.id;
                bloquearConfigActa(true);
                cargarPartidosEnCurso();
            }
        }

        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            timerSeconds++;
            updateTimerDisplay();

            if (timerSeconds % 5 === 0 && partidoEnDirectoId) {
                supabase.from('partidos').update({ tiempo_segundos: timerSeconds }).eq('id', partidoEnDirectoId).then();
            }
        }, 1000);
    }
});

onClickSafe('btn-timer-reset', function () {
    if (confirm("¿Poner el cronómetro a 00:00?")) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        timerSeconds = 0;
        updateTimerDisplay();

        let btnToggle = document.getElementById('btn-timer-toggle');
        if (btnToggle) {
            btnToggle.innerText = "▶ Iniciar Cronómetro";
            btnToggle.style.background = '';
            btnToggle.classList.add('primary');
        }

        if (partidoEnDirectoId) {
            supabase.from('partidos').update({ tiempo_segundos: 0 }).eq('id', partidoEnDirectoId).then();
        }
    }
});

async function cargarEquiposParaPartido() {
    const inputMod = document.getElementById('partido-mod');
    const inputGen = document.getElementById('partido-gen');
    const inputCat = document.getElementById('partido-cat');

    const mod = inputMod ? inputMod.value : '';
    const gen = inputGen ? inputGen.value : '';
    const cat = inputCat ? inputCat.value : '';

    const { data: rivales } = await supabase.from('equipos').select('id, nombre_equipo').eq('categoria', cat).eq('genero', gen).eq('modalidad', mod);

    const selLocal = document.getElementById('partido-local');
    const selVis = document.getElementById('partido-visitante');

    if (selLocal) selLocal.innerHTML = '';
    if (selVis) selVis.innerHTML = '';

    if (rivales && rivales.length > 0) {
        rivales.forEach(r => {
            if (selLocal) selLocal.innerHTML += `<option value="${r.id}">${r.nombre_equipo}</option>`;
            if (selVis) selVis.innerHTML += `<option value="${r.id}">${r.nombre_equipo}</option>`;
        });
        if (rivales.length > 1 && selVis) {
            selVis.selectedIndex = 1;
        }
    } else {
        if (selLocal) selLocal.innerHTML = '<option value="">Sin equipos registrados</option>';
        if (selVis) selVis.innerHTML = '<option value="">Sin equipos registrados</option>';
    }

    renderBotonesAccion();
    await actualizarPlantillasActa();
}

onChangeSafe('partido-mod', cargarEquiposParaPartido);
onChangeSafe('partido-gen', cargarEquiposParaPartido);
onChangeSafe('partido-cat', cargarEquiposParaPartido);

async function actualizarPlantillasActa() {
    const inputL = document.getElementById('partido-local');
    const inputV = document.getElementById('partido-visitante');

    const idL = inputL ? inputL.value : '';
    const idV = inputV ? inputV.value : '';

    if (idL) {
        const { data } = await supabase.from('jugadores').select('*').eq('equipo_id', idL).order('dorsal', { ascending: true });
        actaJugadoresLocal = data || [];
    } else {
        actaJugadoresLocal = [];
    }

    if (idV) {
        const { data } = await supabase.from('jugadores').select('*').eq('equipo_id', idV).order('dorsal', { ascending: true });
        actaJugadoresVisita = data || [];
    } else {
        actaJugadoresVisita = [];
    }

    renderActaPlayers();
}

function renderActaPlayers() {
    const grid = document.getElementById('acta-jugadores-grid');
    if (!grid) return;

    grid.innerHTML = '';
    actaJugadorSeleccionado = null;

    const jugadores = actaEquipoRol === 'local' ? actaJugadoresLocal : actaJugadoresVisita;

    if (jugadores.length === 0) {
        grid.innerHTML = '<p style="color:var(--muted); font-size:0.8rem; padding: 10px;">No hay jugadores dados de alta en este equipo.</p>';
        return;
    }

    jugadores.forEach(j => {
        const btn = document.createElement('button');
        btn.className = 'acta-player-btn';
        btn.innerHTML = `<span class="num">${j.dorsal}</span><span class="name">${j.nombre}</span>`;

        btn.onclick = () => {
            document.querySelectorAll('.acta-player-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            actaJugadorSeleccionado = j;
        };

        grid.appendChild(btn);
    });
}

function renderBotonesAccion() {
    const actionsGrid = document.getElementById('acta-actions-grid');
    if (!actionsGrid) return;

    const inputMod = document.getElementById('partido-mod');
    const modSeleccionada = inputMod ? inputMod.value : '';

    if (modSeleccionada === 'BM Playa') {
        actionsGrid.innerHTML = `
            <button class="acta-action-btn btn-gol" data-tipo="gol1">⚽ GOL (+1)</button>
            <button class="acta-action-btn btn-gol2" data-tipo="gol2">🚀 GOL DOBLE (+2)</button>
            <button class="acta-action-btn btn-2min" data-tipo="exclusion">⏱️ EXCLUSIÓN</button>
            <button class="acta-action-btn btn-roj" data-tipo="roja">🟥 T. ROJA</button>
        `;
    } else {
        actionsGrid.innerHTML = `
            <button class="acta-action-btn btn-gol" data-tipo="gol">⚽ GOL (+1)</button>
            <button class="acta-action-btn btn-ama" data-tipo="amarilla">🟨 T. AMARILLA</button>
            <button class="acta-action-btn btn-2min" data-tipo="2min">⏱️ 2 MINUTOS</button>
            <button class="acta-action-btn btn-roj" data-tipo="roja">🟥 T. ROJA</button>
        `;
    }

    document.querySelectorAll('.acta-action-btn').forEach(btn => {
        btn.onclick = () => procesarClicAccion(btn.dataset.tipo);
    });
}

async function procesarClicAccion(tipo) {
    if (!actaJugadorSeleccionado) {
        return mostrarNotificacion('Por favor, selecciona primero el dorsal de un jugador.', 'info');
    }

    const minutoActual = Math.floor(timerSeconds / 60) + 1;

    const inputLocal = document.getElementById('partido-local');
    const inputVis = document.getElementById('partido-visitante');

    const idEquipoReal = actaEquipoRol === 'local' ? (inputLocal ? inputLocal.value : '') : (inputVis ? inputVis.value : '');

    if (!idEquipoReal) {
        return mostrarNotificacion("Falta seleccionar el equipo.", "error");
    }
    if (!partidoEnDirectoId) {
        return mostrarNotificacion("Por favor, dale a 'Iniciar Cronómetro' primero para crear el partido.", "error");
    }

    const { data: eventoGuardado, error } = await supabase.from('eventos_partido').insert([{
        partido_id: partidoEnDirectoId,
        minuto: minutoActual,
        equipo_id: idEquipoReal,
        jugador_id: actaJugadorSeleccionado.id,
        nombre_jugador: actaJugadorSeleccionado.nombre,
        dorsal: parseInt(actaJugadorSeleccionado.dorsal),
        tipo_evento: tipo
    }]).select().single();

    if (error) {
        return mostrarNotificacion("Error de red guardando evento.", "error");
    }

    eventosDraft.push({
        id_temporal: eventoGuardado.id,
        minuto: minutoActual,
        equipo_id: idEquipoReal,
        rol_equipo: actaEquipoRol,
        jugador_id: actaJugadorSeleccionado.id,
        nombre_jugador: actaJugadorSeleccionado.nombre,
        dorsal: parseInt(actaJugadorSeleccionado.dorsal),
        tipo_evento: tipo
    });

    if (tipo === 'gol' || tipo === 'gol1') {
        marcadorDraft[actaEquipoRol] += 1;
    }
    if (tipo === 'gol2') {
        marcadorDraft[actaEquipoRol] += 2;
    }

    eventosDraft.sort((a, b) => a.minuto - b.minuto);
    actualizarVistaDraft();

    document.querySelectorAll('.acta-player-btn').forEach(b => b.classList.remove('active'));
    actaJugadorSeleccionado = null;

    await supabase.from('partidos').update({
        goles_local: marcadorDraft.local,
        goles_visitante: marcadorDraft.visitante,
        tiempo_segundos: timerSeconds
    }).eq('id', partidoEnDirectoId);
}

onClickSafe('btn-acta-local', function () {
    actaEquipoRol = 'local';
    const btnL = document.getElementById('btn-acta-local');
    const btnV = document.getElementById('btn-acta-vis');

    if (btnL) btnL.classList.add('active');
    if (btnV) btnV.classList.remove('active');

    renderActaPlayers();
});

onClickSafe('btn-acta-vis', function () {
    actaEquipoRol = 'visitante';
    const btnV = document.getElementById('btn-acta-vis');
    const btnL = document.getElementById('btn-acta-local');

    if (btnV) btnV.classList.add('active');
    if (btnL) btnL.classList.remove('active');

    renderActaPlayers();
});

onClickSafe('btn-nav-acta', async function () {
    closeMenu();
    mostrarSeccion('vista-acta');

    partidoEnDirectoId = null;
    eventosDraft = [];
    marcadorDraft = { local: 0, visitante: 0 };
    bloquearConfigActa(false);

    clearInterval(timerInterval);
    isTimerRunning = false;
    timerSeconds = 0;
    updateTimerDisplay();

    const btnTog = document.getElementById('btn-timer-toggle');
    if (btnTog) {
        btnTog.innerText = "▶ Iniciar Cronómetro";
        btnTog.style.background = '';
    }

    const obs = document.getElementById('partido-observaciones');
    if (obs) {
        obs.value = '';
    }

    actualizarVistaDraft();
    cargarPartidosEnCurso();

    const selJornada = document.getElementById('partido-jornada');
    if (selJornada) {
        selJornada.innerHTML = '';
        for (let i = 1; i <= 30; i++) {
            selJornada.innerHTML += `<option value="${i}">Jornada ${i}</option>`;
        }
    }

    await cargarEquiposParaPartido();

    actaEquipoRol = 'local';

    const btnL = document.getElementById('btn-acta-local');
    const btnV = document.getElementById('btn-acta-vis');

    if (btnL) btnL.classList.add('active');
    if (btnV) btnV.classList.remove('active');
});

onClickSafe('btn-abrir-partido', () => {
    const btn = document.getElementById('btn-nav-acta');
    if (btn) btn.click();
});

function actualizarVistaDraft() {
    const pL = document.getElementById('preview-goles-local');
    if (pL) pL.innerText = marcadorDraft.local;

    const pV = document.getElementById('preview-goles-visitante');
    if (pV) pV.innerText = marcadorDraft.visitante;

    const gfL = document.getElementById('partido-gf-local');
    if (gfL) gfL.value = marcadorDraft.local;

    const gfV = document.getElementById('partido-gf-visitante');
    if (gfV) gfV.value = marcadorDraft.visitante;

    const container = document.getElementById('lista-eventos-draft');
    if (!container) return;

    container.innerHTML = '';

    if (eventosDraft.length === 0) {
        container.innerHTML = '<p style="color:var(--muted); font-size:0.8rem; text-align:center; padding:10px;">Aún no hay eventos registrados.</p>';
        return;
    }

    eventosDraft.forEach(ev => {
        let icono = "";
        let color = "";

        if (ev.tipo_evento === 'gol' || ev.tipo_evento === 'gol1') { icono = "⚽ Gol (+1)"; color = "var(--success)"; }
        if (ev.tipo_evento === 'gol2') { icono = "🚀 Gol Doble (+2)"; color = "#f97316"; }
        if (ev.tipo_evento === 'amarilla') { icono = "🟨 Amarilla"; color = "#facc15"; }
        if (ev.tipo_evento === '2min' || ev.tipo_evento === 'exclusion') { icono = "⏱️ Exclusión"; color = "#f59e0b"; }
        if (ev.tipo_evento === 'roja') { icono = "🟥 Roja"; color = "var(--danger)"; }

        const equipoTexto = ev.rol_equipo === 'local' ? '(L)' : '(V)';

        container.innerHTML += `
            <div class="draft-event-item">
                <div>
                    <span style="font-weight:bold; color:var(--accent);">Min ${ev.minuto}'</span> - 
                    <strong>#${ev.dorsal} ${ev.nombre_jugador}</strong> 
                    <span style="color:var(--muted); font-size:0.7rem;">${equipoTexto}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="color:${color}; font-weight:bold;">${icono}</span>
                    <button onclick="borrarEventoDraft(${ev.id_temporal}, '${ev.tipo_evento}', '${ev.rol_equipo}')" style="background:transparent; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem;">&times;</button>
                </div>
            </div>
        `;
    });
}

window.borrarEventoDraft = async function (idEventoDb, tipo, rolEquipo) {
    eventosDraft = eventosDraft.filter(e => e.id_temporal !== idEventoDb);

    if (tipo === 'gol' || tipo === 'gol1') {
        marcadorDraft[rolEquipo] -= 1;
    }
    if (tipo === 'gol2') {
        marcadorDraft[rolEquipo] -= 2;
    }

    actualizarVistaDraft();

    await supabase.from('eventos_partido').delete().eq('id', idEventoDb);

    if (partidoEnDirectoId) {
        supabase.from('partidos').update({
            goles_local: marcadorDraft.local,
            goles_visitante: marcadorDraft.visitante,
            tiempo_segundos: timerSeconds
        }).eq('id', partidoEnDirectoId).then();
    }
};

onClickSafe('btn-guardar-partido', async function (e) {
    const inputL = document.getElementById('partido-gf-local');
    const inputV = document.getElementById('partido-gf-visitante');
    const inputObs = document.getElementById('partido-observaciones');

    const gl = parseInt(inputL ? inputL.value : 0);
    const gv = parseInt(inputV ? inputV.value : 0);
    const observacionesData = inputObs ? inputObs.value : '';

    if (!partidoEnDirectoId) {
        return mostrarNotificacion("Inicia el cronómetro antes de finalizar para registrar el partido.", "error");
    }

    const btn = e.currentTarget;
    btn.innerText = "Guardando Partido...";
    btn.disabled = true;

    clearInterval(timerInterval);
    isTimerRunning = false;

    const { error: errPartido } = await supabase.from('partidos').update({
        goles_local: gl,
        goles_visitante: gv,
        estado: 'finalizado',
        observaciones: observacionesData
    }).eq('id', partidoEnDirectoId);

    if (errPartido) {
        btn.innerText = "Finalizar y Guardar Acta";
        btn.disabled = false;
        return mostrarNotificacion("Error: " + errPartido.message, "error");
    }

    if (eventosDraft.length > 0) {
        let statsPorJugador = {};

        eventosDraft.forEach(ev => {
            if (!statsPorJugador[ev.jugador_id]) {
                statsPorJugador[ev.jugador_id] = { goles: 0, amarillas: 0, rojas: 0, exclusiones: 0 };
            }

            let golesASumar = 0;
            if (ev.tipo_evento === 'gol' || ev.tipo_evento === 'gol1') {
                golesASumar = 1;
            }
            if (ev.tipo_evento === 'gol2') {
                golesASumar = 2;
            }

            statsPorJugador[ev.jugador_id].goles += golesASumar;

            if (ev.tipo_evento === 'amarilla') {
                statsPorJugador[ev.jugador_id].amarillas += 1;
            }
            if (ev.tipo_evento === '2min' || ev.tipo_evento === 'exclusion') {
                statsPorJugador[ev.jugador_id].exclusiones += 1;
            }
            if (ev.tipo_evento === 'roja') {
                statsPorJugador[ev.jugador_id].rojas += 1;
            }
        });

        for (const [jId, statsAñadir] of Object.entries(statsPorJugador)) {
            const { data: jActual } = await supabase.from('jugadores').select('*').eq('id', jId).single();

            if (jActual) {
                await supabase.from('jugadores').update({
                    partidos: (jActual.partidos || 0) + 1,
                    goles: (jActual.goles || 0) + statsAñadir.goles,
                    amarillas: (jActual.amarillas || 0) + statsAñadir.amarillas,
                    exclusiones: (jActual.exclusiones || 0) + statsAñadir.exclusiones,
                    rojas: (jActual.rojas || 0) + statsAñadir.rojas
                }).eq('id', jId);
            }
        }
    }

    const selLocal = document.getElementById('partido-local');
    const selVis = document.getElementById('partido-visitante');

    const idLocal = selLocal ? selLocal.value : '';
    const idVis = selVis ? selVis.value : '';

    const { data: eqL } = await supabase.from('equipos').select('*').eq('id', idLocal).single();
    const { data: eqV } = await supabase.from('equipos').select('*').eq('id', idVis).single();

    let ptsL = 0, pgL = 0, peL = 0, ppL = 0;
    let ptsV = 0, pgV = 0, peV = 0, ppV = 0;

    if (gl > gv) {
        ptsL = 2; pgL = 1; ppV = 1;
    } else if (gl === gv) {
        ptsL = 1; peL = 1; ptsV = 1; peV = 1;
    } else {
        ptsV = 2; pgV = 1; ppL = 1;
    }

    if (eqL) {
        await supabase.from('equipos').update({
            jugados: (eqL.jugados || 0) + 1,
            victorias: (eqL.victorias || 0) + pgL,
            empates: (eqL.empates || 0) + peL,
            derrotas: (eqL.derrotas || 0) + ppL,
            goles_favor: (eqL.goles_favor || 0) + gl,
            goles_contra: (eqL.goles_contra || 0) + gv,
            puntos: (eqL.puntos || 0) + ptsL
        }).eq('id', idLocal);
    }

    if (eqV) {
        await supabase.from('equipos').update({
            jugados: (eqV.jugados || 0) + 1,
            victorias: (eqV.victorias || 0) + pgV,
            empates: (eqV.empates || 0) + peV,
            derrotas: (eqV.derrotas || 0) + ppV,
            goles_favor: (eqV.goles_favor || 0) + gv,
            goles_contra: (eqV.goles_contra || 0) + gl,
            puntos: (eqV.puntos || 0) + ptsV
        }).eq('id', idVis);
    }

    const pObs = document.getElementById('partido-observaciones');
    if (pObs) {
        pObs.value = '';
    }

    partidoEnDirectoId = null;
    bloquearConfigActa(false);
    cargarPartidosEnCurso();

    btn.innerText = "Finalizar Partido y Guardar Acta";
    btn.disabled = false;

    mostrarNotificacion("¡Partido finalizado y Acta cerrada con éxito!", "success");

    const btnActas = document.getElementById('btn-nav-actas-registradas');
    if (btnActas) {
        btnActas.click();
    }
});

// =========================================================
// ================ FUNCIONES SECUNDARIAS ==================
// =========================================================

document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        if (this.id === 'btn-close-menu') return;
        if (this.parentElement && this.parentElement.parentElement) {
            this.parentElement.parentElement.style.display = 'none';
        }
    });
});

window.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal-overlay') && e.target.id !== 'menu-overlay') {
        e.target.style.display = 'none';
    }
});

// =========================================================
// ================ AUTH Y SISTEMA =========================
// =========================================================

async function comprobarEstado() {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {

        const btnAjustes = document.getElementById('btn-nav-ajustes');
        if (btnAjustes) btnAjustes.style.display = 'flex';

        const bl = document.getElementById('btn-ir-login');
        if (bl) bl.style.display = 'none';

        const bc = document.getElementById('btn-cerrar-sesion');
        if (bc) bc.style.display = 'inline-block';

        const aviso = document.getElementById('aviso-login');
        if (aviso) aviso.style.display = 'none';

        const zonaSubir = document.getElementById('zona-subir-foto');
        if (zonaSubir) zonaSubir.style.display = 'block';

        const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', user.id).single();

        if (perfil) {
            if (perfil.is_admin) {
                const b1 = document.getElementById('btn-nav-admin');
                if (b1) b1.style.display = 'flex';

                const b2 = document.getElementById('btn-nav-acta');
                if (b2) b2.style.display = 'flex';

                const b3 = document.getElementById('btn-nav-actas-registradas');
                if (b3) b3.style.display = 'flex';
            }
            if (perfil.is_coach || perfil.is_admin) {
                const b4 = document.getElementById('btn-nav-equipo');
                if (b4) b4.style.display = 'flex';

                const b5 = document.getElementById('btn-nav-goleadores');
                if (b5) b5.style.display = 'flex';
            }
            if (perfil.is_mesa || perfil.is_admin) {
                const b6 = document.getElementById('btn-nav-acta');
                if (b6) b6.style.display = 'flex';

                const b7 = document.getElementById('btn-nav-actas-registradas');
                if (b7) b7.style.display = 'flex';
            }

            if (perfil.solicita_entrenador && !perfil.is_coach) {
                mostrarNotificacion("Tu solicitud de ENTRENADOR está pendiente de ser aprobada.", "info");
            }
            if (perfil.solicita_mesa && !perfil.is_mesa) {
                mostrarNotificacion("Tu solicitud de MESA está pendiente de ser aprobada.", "info");
            }

            const b8 = document.getElementById('btn-nav-solicitar-rol');
            if (b8 && !perfil.is_admin) {
                b8.style.display = 'flex';
            }
        }
    } else {
        const bl = document.getElementById('btn-ir-login');
        if (bl) bl.style.display = 'inline-block';

        const bc = document.getElementById('btn-cerrar-sesion');
        if (bc) bc.style.display = 'none';
    }
}

onClickSafe('btn-entrar', async function (e) {
    const inputCorreo = document.getElementById('correo');
    const inputPass = document.getElementById('pass');
    const email = inputCorreo ? inputCorreo.value : '';
    const pass = inputPass ? inputPass.value : '';

    if (!email || !pass) return mostrarNotificacion("Rellena todos los campos.", "error");

    const btn = e.currentTarget;
    const textoOriginal = btn.innerText;
    btn.innerText = "Cargando...";
    btn.disabled = true;

    const { error } = await supabase.auth.signInWithPassword({ email: email, password: pass });

    if (error) {
        mostrarNotificacion(error.message, "error");
        btn.innerText = textoOriginal;
        btn.disabled = false;
    } else {
        mostrarNotificacion("Sesión iniciada", "success");
        setTimeout(() => location.reload(), 1000);
    }
});

onClickSafe('btn-crear-cuenta', async function (e) {
    const inputCorreo = document.getElementById('reg-correo');
    const inputPass = document.getElementById('reg-pass');
    const email = inputCorreo ? inputCorreo.value : '';
    const pass = inputPass ? inputPass.value : '';

    const checkEnt = document.getElementById('check-entrenador');
    const checkMesa = document.getElementById('check-mesa');
    const esEntrenador = checkEnt ? checkEnt.checked : false;
    const esMesa = checkMesa ? checkMesa.checked : false;

    if (!email || !pass) return mostrarNotificacion("Rellena correo y contraseña.", "error");

    const btn = e.currentTarget;
    const textoOriginal = btn.innerText;
    btn.innerText = "Creando...";
    btn.disabled = true;

    const { data, error } = await supabase.auth.signUp({ email, password: pass });

    if (error) {
        mostrarNotificacion(error.message, "error");
        btn.innerText = textoOriginal;
        btn.disabled = false;
    } else if (data.user) {
        await supabase.from('perfiles').insert([{
            id: data.user.id,
            email: email,
            solicita_entrenador: esEntrenador,
            solicita_mesa: esMesa
        }]);

        mostrarNotificacion("Cuenta creada. Iniciando sesión...", "success");
        setTimeout(() => location.reload(), 1500);
    }
});

onClickSafe('btn-cerrar-sesion', async function () {
    await supabase.auth.signOut();
    location.reload();
});

onClickSafe('tab-login', function () {
    const f1 = document.getElementById('form-login');
    if (f1) f1.style.display = 'block';
    const f2 = document.getElementById('form-registro');
    if (f2) f2.style.display = 'none';
});

onClickSafe('tab-registro', function () {
    const f1 = document.getElementById('form-login');
    if (f1) f1.style.display = 'none';
    const f2 = document.getElementById('form-registro');
    if (f2) f2.style.display = 'block';
});

onClickSafe('btn-enviar-solicitud-rol', async function (e) {
    const btn = e.currentTarget;
    const reqEnt = document.getElementById('req-entrenador')?.checked;
    const reqMesa = document.getElementById('req-mesa')?.checked;

    if (!reqEnt && !reqMesa) return mostrarNotificacion("Selecciona al menos un rol.", "error");

    btn.innerText = "Enviando...";
    btn.disabled = true;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Debes iniciar sesión primero para solicitar un rol.");

        let upd = {};
        let nombreRol = "";

        if (reqEnt) {
            upd.solicita_entrenador = true;
            nombreRol += "Entrenador ";
        }
        if (reqMesa) {
            upd.solicita_mesa = true;
            nombreRol += "Mesa";
        }

        // 1. Guardamos la solicitud en tu base de datos (Supabase)
        const { error } = await supabase.from('perfiles').update(upd).eq('id', user.id);
        if (error) throw error;

        // 2. Enviamos el correo de aviso usando EmailJS
        const templateParams = {
            user_email: user.email,
            rol_solicitado: nombreRol.trim()
        };

        // SUSTITUYE ESTOS TRES VALORES POR LOS TUYOS
        await window.emailjs.send(
            "service_8frsccd",
            "template_9etc0pa",
            templateParams,
            "e7NZwYxxmMdq3EX7B"
        );

        // Notificación limpia y profesional para el usuario
        mostrarNotificacion("¡Solicitud enviada! El administrador la revisará pronto.", "success");

        // Limpiamos los checks
        if (document.getElementById('req-entrenador')) document.getElementById('req-entrenador').checked = false;
        if (document.getElementById('req-mesa')) document.getElementById('req-mesa').checked = false;

    } catch (err) {
        // Si hay error, lo mostramos en tu sistema de notificaciones, no con un alert feo
        mostrarNotificacion("Error: " + err.message, "error");
    } finally {
        btn.innerText = "Enviar Solicitud";
        btn.disabled = false;
    }
});

comprobarEstado();

supabase.channel('public:partidos')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partidos' }, payload => {
        const p = payload.new;
        const scoreLocal = document.getElementById(`score-local-${p.id}`);
        const scoreVis = document.getElementById(`score-vis-${p.id}`);
        const container = document.getElementById(`score-container-${p.id}`);

        if (scoreLocal && scoreVis) {
            scoreLocal.innerText = p.goles_local;
            scoreVis.innerText = p.goles_visitante;
            if (container) {
                container.style.boxShadow = "0 0 20px var(--accent)";
                setTimeout(() => { container.style.boxShadow = "inset 0 2px 4px rgba(0,0,0,0.2)"; }, 1000);
            }
        }
    }).subscribe();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('PWA Fallo:', err));
    });
}

// =========================================================
// ==== VISTA ACTAS REGISTRADAS (SOLO PARA MESA / ADMIN) ===
// =========================================================

onClickSafe('btn-nav-actas-registradas', () => {
    closeMenu();
    mostrarSeccion('vista-actas-registradas');
    cargarActasRegistradas();
});

async function cargarActasRegistradas() {
    const tbody = document.getElementById('tabla-body-actas-registradas');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Cargando actas...</td></tr>';

    const { data: { user } } = await supabase.auth.getUser();
    let esAdminReal = false;
    if (user) {
        const { data: perfil } = await supabase.from('perfiles').select('is_admin').eq('id', user.id).single();
        if (perfil && perfil.is_admin) {
            esAdminReal = true;
        }
    }

    const { data, error } = await supabase.from('partidos').select('*');

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--danger);">Error de Supabase: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    window.partidosDataTemp = {};

    if (data && data.length > 0) {
        data.reverse().forEach(p => {
            window.partidosDataTemp[p.id] = p;

            const fecha = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Acta Guardada';

            // 1. Botón de informe mejorado (o etiqueta gris si no hay informe)
            let btnObs = p.observaciones ?
                `<button onclick="verObservacionesAdmin('${p.id}')" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid #f59e0b; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;">📝 Informe</button>` :
                `<span style="background: rgba(255, 255, 255, 0.05); color: var(--muted); border: 1px solid transparent; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; display: flex; align-items: center;">Sin informe</span>`;

            // 2. Botón de borrar con el mismo estilo exacto de altura/padding
            let btnBorrar = '';
            if (esAdminReal || isAdminMode) {
                btnBorrar = `<button onclick="borrarPartidoAdmin('${p.id}')" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;">🗑️ Borrar</button>`;
            }

            let estadoTexto = p.estado === 'en_curso' ? '<span style="color:var(--danger); font-weight:bold;">EN DIRECTO</span>' : 'Finalizado';

            // 3. Lo envolvemos TODO en un <div> con display:flex y gap para que queden perfectos
            tbody.innerHTML += `
                <tr>
                    <td>${fecha}<br><small>${estadoTexto}</small></td>
                    <td>${p.categoria} ${p.genero} (${p.modalidad})</td>
                    <td class="name-col">${p.nombre_local} <strong style="color:var(--accent)">${p.goles_local} - ${p.goles_visitante}</strong> ${p.nombre_visitante}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <button class="btn-primary-pro" style="margin:0; padding:6px 12px; font-size:0.75rem; width:auto; display:flex; align-items:center; gap:6px;" onclick="abrirActaDetallada('${p.id}', '${p.nombre_local}', '${p.nombre_visitante}', ${p.goles_local}, ${p.goles_visitante}, '${p.equipo_local_id}', '${p.equipo_visitante_id}')">📄 Acta</button>
                            ${btnObs}
                            ${btnBorrar}
                        </div>
                    </td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--muted);">No hay actas registradas en el sistema.</td></tr>';
    }
}

// =========================================================
// ================= BORRAR ACTA / PARTIDO (DEBUG) =========
// =========================================================
window.borrarPartidoAdmin = async function(idPartido) {

    if (!confirm("ATENCIÓN: ¿Estás seguro de que quieres borrar esta acta?")) {
        return;
    }

    try {
        
        const { error: errEventos } = await supabase.from('eventos_partido').delete().eq('partido_id', idPartido);
        if (errEventos) throw new Error("Fallo en eventos: " + errEventos.message);
        
        const { error: errPartido } = await supabase.from('partidos').delete().eq('id', idPartido);
        if (errPartido) throw new Error("Fallo en partido: " + errPartido.message);

        alert("¡ACTA BORRADA CORRECTAMENTE!");
        
        mostrarNotificacion("Acta borrada correctamente.", "success");
        cargarActasRegistradas(); 

    } catch (error) {
        alert("ERROR: \n" + error.message);
    }
};

// =========================================================
// ================= AJUSTES DE CUENTA =====================
// =========================================================

onClickSafe('btn-nav-ajustes', () => {
    closeMenu();
    mostrarSeccion('vista-ajustes');
});

onClickSafe('btn-guardar-password', async function (e) {
    const btn = e.currentTarget;
    const inputPass = document.getElementById('ajustes-pass-nueva');
    const inputConf = document.getElementById('ajustes-pass-confirmar');
    
    const pass1 = inputPass ? inputPass.value : '';
    const pass2 = inputConf ? inputConf.value : '';

    if (!pass1 || !pass2) return mostrarNotificacion("Rellena ambos campos.", "error");
    if (pass1 !== pass2) return mostrarNotificacion("Las contraseñas no coinciden.", "error");
    if (pass1.length < 6) return mostrarNotificacion("La contraseña debe tener al menos 6 caracteres.", "error");

    btn.innerText = "Guardando...";
    btn.disabled = true;

    // Supabase hace todo el trabajo sucio por nosotros aquí
    const { error } = await supabase.auth.updateUser({ password: pass1 });

    btn.innerText = "Actualizar Contraseña";
    btn.disabled = false;

    if (error) {
        mostrarNotificacion("Error: " + error.message, "error");
    } else {
        mostrarNotificacion("¡Contraseña actualizada con éxito!", "success");
        if (inputPass) inputPass.value = '';
        if (inputConf) inputConf.value = '';
    }
});

// =========================================================
// ================= VER INFORME / OBSERVACIONES ===========
// =========================================================
window.verObservacionesAdmin = function(idPartido) {
    // 1. Rescatamos los datos del partido
    const partido = window.partidosDataTemp[idPartido];
    
    if (!partido || !partido.observaciones) {
        return mostrarNotificacion("No hay observaciones registradas en este partido.", "info");
    }

    // 2. Creamos el Modal dinámico
    let modal = document.getElementById('modal-informe-dinamico');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-informe-dinamico';
        modal.className = 'modal-overlay';
        modal.style.display = 'none'; 
        modal.style.position = 'fixed';
        modal.style.top = '0'; modal.style.left = '0';
        modal.style.width = '100%'; modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        modal.style.zIndex = '9999';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        
        // Estructura del modal mejorada para texto normal hacia abajo
        modal.innerHTML = `
            <div style="background: #18181b; padding: 25px; border-radius: 12px; width: 90%; max-width: 500px; border: 1px solid #3f3f46; box-shadow: 0 10px 40px rgba(0,0,0,0.9); display: flex; flex-direction: column;">
                <h3 style="color: #f59e0b; margin-top: 0; margin-bottom: 15px; border-bottom: 1px solid #3f3f46; padding-bottom: 10px; text-align: left;">
                    📝 Informe del Partido
                </h3>
                
                <div id="texto-informe-contenido" style="color: #e4e4e7; font-size: 0.95rem; line-height: 1.6; max-height: 50vh; overflow-y: auto; overflow-x: hidden; white-space: pre-wrap; word-wrap: break-word; word-break: break-word; text-align: left; background: #09090b; padding: 15px; border-radius: 8px; border: 1px inset #27272a; margin-bottom: 20px;">
                </div>
                
                <button class="btn-premium" onclick="document.getElementById('modal-informe-dinamico').style.display='none'">
                    Cerrar Informe
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Cerrar también si haces clic en el fondo oscuro
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.style.display = 'none';
        });
    }
    
    // 3. Inyectamos el texto de las observaciones y mostramos el modal
    document.getElementById('texto-informe-contenido').innerText = partido.observaciones;
    modal.style.display = 'flex';
};