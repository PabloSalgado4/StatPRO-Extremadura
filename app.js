import { supabase } from './supabaseClient.js';

let jugadorEditandoId = null;
let miEquipoId = null;
let miEquipoActual = null; 
let isAdminMode = false;

// Variables Globales Acta en Vivo
let eventosDraft = [];
let marcadorDraft = { local: 0, visitante: 0 };
let actaEquipoRol = 'local'; 
let actaJugadorSeleccionado = null; 
let actaJugadoresLocal = [];
let actaJugadoresVisita = [];

// Variables Cronómetro
let timerSeconds = 0;
let timerInterval = null;
let isTimerRunning = false;

// --- NAVEGACIÓN Y SELECTORES GLOBALES ---
const selCategoria = document.getElementById('sel-categoria');
const selCompeticion = document.getElementById('sel-competicion');

if (selCategoria && selCompeticion) {
    selCategoria.onchange = function() {
        if (this.value.includes('Senior')) {
            selCompeticion.innerHTML = `<option value="liga">Liga Regular</option><option value="copa">Copa de Extremadura</option>`;
        } else {
            selCompeticion.innerHTML = `<option value="liga">Liga Regular</option>`;
        }
    };
}

document.getElementById('logo-inicio').onclick = () => mostrarSeccion('vista-inicio');
document.getElementById('btn-ir-login').onclick = () => mostrarSeccion('vista-login');
document.getElementById('btn-nav-goleadores').onclick = () => { mostrarSeccion('vista-goleadores'); cargarGoleadores(); };

document.getElementById('btn-nav-equipo').onclick = () => {
    isAdminMode = false;
    document.getElementById('btn-volver-admin-panel').style.display = 'none';
    verificarEquipoEntrenador(); 
};

document.getElementById('btn-nav-admin').onclick = () => {
    isAdminMode = true;
    mostrarSeccion('vista-admin');
    cambiarTabAdmin('solicitudes');
};

document.getElementById('btn-volver-admin-panel').onclick = () => {
    mostrarSeccion('vista-admin');
};

function mostrarSeccion(id) {
    const vistas = ['vista-inicio', 'vista-login', 'vista-entrenador', 'vista-crear-equipo', 'vista-clasificacion', 'vista-goleadores', 'vista-resultados', 'vista-admin', 'vista-mis-equipos'];
    vistas.forEach(s => { const el = document.getElementById(s); if(el) el.style.display = 'none'; });
    const seccion = document.getElementById(id);
    if(seccion) seccion.style.display = 'block';
}

// --- CONSULTAS PÚBLICAS ---
document.getElementById('btn-continuar-consulta').onclick = function() {
    const catGen = document.getElementById('sel-categoria').value; 
    const [cat, gen] = catGen.split(' '); 
    const mod = document.getElementById('sel-modalidad').value;
    document.getElementById('titulo-clasificacion').innerText = `Clasificación - ${catGen}`;
    mostrarSeccion('vista-clasificacion');
    cargarClasificacionEquipos(cat, mod, gen);
};

async function cargarClasificacionEquipos(cat, mod, gen) {
    const { data } = await supabase.from('equipos').select('*').eq('categoria', cat).eq('modalidad', mod).eq('genero', gen).order('puntos', { ascending: false });
    const tbody = document.getElementById('tabla-body-equipos');
    tbody.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach((e, i) => {
            tbody.innerHTML += `<tr><td class="rank-col">#${i+1}</td><td class="name-col">${e.nombre_equipo}</td><td>${e.jugados||0}</td><td>${e.victorias||0}</td><td>${e.empates||0}</td><td>${e.derrotas||0}</td><td>${e.goles_favor||0}</td><td>${e.goles_contra||0}</td><td class="goals-col">${e.puntos||0}</td></tr>`;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--muted);">No hay equipos registrados</td></tr>';
    }
}

async function cargarGoleadores() {
    const catGen = document.getElementById('sel-categoria').value;
    const [cat, gen] = catGen.split(' ');
    document.getElementById('titulo-goleadores').innerText = `Máximo Goleador - ${catGen}`;

    const { data } = await supabase.from('jugadores').select('nombre, goles, equipos!inner(nombre_equipo, categoria, genero)').eq('equipos.categoria', cat).eq('equipos.genero', gen).order('goles', { ascending: false }).limit(20);
    const tbody = document.getElementById('tabla-body-goleadores');
    tbody.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach((j, i) => {
            tbody.innerHTML += `<tr><td class="rank-col">${i+1}º</td><td class="name-col">${j.nombre}</td><td>${j.equipos.nombre_equipo}</td><td class="goals-col">${j.goles || 0}</td></tr>`;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--muted);">Aún no hay goleadores</td></tr>';
    }
}

document.getElementById('btn-ver-resultados').onclick = function() {
    const catGen = document.getElementById('sel-categoria').value;
    document.getElementById('titulo-resultados').innerText = `Resultados - ${catGen}`;
    const selJornada = document.getElementById('sel-filtro-jornada');
    if(selJornada.options.length === 0) {
        for(let i=1; i<=30; i++) selJornada.innerHTML += `<option value="${i}">Jornada ${i}</option>`;
    }
    mostrarSeccion('vista-resultados');
    cargarPartidosJornada();
};

document.getElementById('sel-filtro-jornada').onchange = cargarPartidosJornada;

async function cargarPartidosJornada() {
    const catGen = document.getElementById('sel-categoria').value; 
    const [cat, gen] = catGen.split(' '); 
    const mod = document.getElementById('sel-modalidad').value;
    const jornada = document.getElementById('sel-filtro-jornada').value;

    const { data } = await supabase.from('partidos').select('*').eq('categoria', cat).eq('genero', gen).eq('modalidad', mod).eq('jornada', jornada);
    const div = document.getElementById('contenedor-partidos');
    div.innerHTML = '';

    if(data && data.length > 0) {
        data.forEach(p => {
            div.innerHTML += `
                <div class="match-card">
                    <div class="match-row-main">
                        <div class="match-team">${p.nombre_local}</div>
                        <div class="match-score-container">
                            <span class="match-score">${p.goles_local}</span><span class="match-divider">VS</span><span class="match-score">${p.goles_visitante}</span>
                        </div>
                        <div class="match-team">${p.nombre_visitante}</div>
                    </div>
                    <button class="btn-ver-acta" onclick="abrirActaDetallada('${p.id}', '${p.nombre_local}', '${p.nombre_visitante}', ${p.goles_local}, ${p.goles_visitante}, '${p.equipo_local_id}', '${p.equipo_visitante_id}')">📄 VER ACTA DETALLADA</button>
                </div>`;
        });
    } else {
        div.innerHTML = '<p style="text-align:center; color:var(--muted); padding: 30px;">No hay resultados registrados en esta jornada.</p>';
    }
}

// --- VER ACTA DETALLADA (TIMELINE VISUAL) ---
window.abrirActaDetallada = async function(partidoId, nombreLocal, nombreVis, gl, gv, idLocal, idVis) {
    document.getElementById('acta-info-equipos').innerText = `${nombreLocal} vs ${nombreVis}`;
    document.getElementById('acta-resultado-final').innerText = `${gl} - ${gv}`;
    
    const container = document.getElementById('timeline-container');
    container.innerHTML = '<p style="text-align:center; color:var(--muted);">Cargando acta...</p>';
    document.getElementById('modal-ver-acta').style.display = 'flex';

    const { data } = await supabase.from('eventos_partido').select('*').eq('partido_id', partidoId).order('minuto', { ascending: true });
    container.innerHTML = '';

    if (data && data.length > 0) {
        data.forEach(ev => {
            let tipoLabel = ""; let claseColor = ""; let icono = "";
            if(ev.tipo_evento === 'gol' || ev.tipo_evento === 'gol1') { tipoLabel = "GOL (+1)"; claseColor = "event-gol"; icono = "⚽"; }
            if(ev.tipo_evento === 'gol2') { tipoLabel = "GOL DOBLE (+2)"; claseColor = "event-gol2"; icono = "🚀"; }
            if(ev.tipo_evento === 'amarilla') { tipoLabel = "AMARILLA"; claseColor = "event-amarilla"; icono = "🟨"; }
            if(ev.tipo_evento === '2min' || ev.tipo_evento === 'exclusion') { tipoLabel = "EXCLUSIÓN"; claseColor = "event-2min"; icono = "⏱️"; }
            if(ev.tipo_evento === 'roja') { tipoLabel = "ROJA"; claseColor = "event-roja"; icono = "🟥"; }

            const ladoClase = (ev.equipo_id === idLocal) ? 'local' : 'visitante';

            container.innerHTML += `
            <div class="timeline-item ${ladoClase}">
                <div class="timeline-icon">${ev.minuto}'</div>
                <div class="timeline-content">
                    <h4>${icono} ${ev.nombre_jugador} <small style="color:var(--accent)">(#${ev.dorsal})</small></h4>
                    <p><span class="tipo-evento ${claseColor}">${tipoLabel}</span></p>
                </div>
            </div>`;
        });
    } else {
        container.innerHTML = '<p style="text-align:center; color:var(--muted); margin-top:20px;">Este partido se registró sin eventos minuto a minuto.</p>';
    }
};

// =========================================================
// ================ PANEL ADMINISTRADOR ====================
// =========================================================

document.getElementById('tab-admin-solicitudes').onclick = () => cambiarTabAdmin('solicitudes');
document.getElementById('tab-admin-equipos').onclick = () => cambiarTabAdmin('equipos');
document.getElementById('tab-admin-partidos').onclick = () => cambiarTabAdmin('partidos');

function cambiarTabAdmin(tab) {
    document.getElementById('tab-admin-solicitudes').classList.remove('active');
    document.getElementById('tab-admin-equipos').classList.remove('active');
    document.getElementById('tab-admin-partidos').classList.remove('active');
    document.getElementById(`tab-admin-${tab}`).classList.add('active');

    document.getElementById('admin-content-solicitudes').style.display = 'none';
    document.getElementById('admin-content-equipos').style.display = 'none';
    document.getElementById('admin-content-partidos').style.display = 'none';
    document.getElementById(`admin-content-${tab}`).style.display = 'block';

    if (tab === 'solicitudes') cargarAdminSolicitudes();
    if (tab === 'equipos') cargarAdminEquipos();
    if (tab === 'partidos') cargarAdminPartidos();
}

async function cargarAdminSolicitudes() {
    const { data } = await supabase.from('perfiles').select('*').eq('solicita_entrenador', true).eq('is_coach', false);
    const tbody = document.getElementById('tabla-body-solicitudes');
    tbody.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(u => {
            tbody.innerHTML += `<tr><td class="name-col">${u.email}</td><td><span style="color: #f59e0b; font-weight:bold;">Pendiente</span></td>
            <td><button onclick="aprobarEntrenador('${u.id}')" class="btn-ghost" style="background:var(--success); padding:5px; font-size:0.7rem;">✔️</button> <button onclick="rechazarEntrenador('${u.id}')" class="btn-danger" style="padding:5px; font-size:0.7rem;">❌</button></td></tr>`;
        });
    } else { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:var(--muted);">No hay solicitudes</td></tr>'; }
}

window.aprobarEntrenador = async function(id) {
    if(confirm("¿Dar permisos de entrenador?")) { await supabase.from('perfiles').update({ is_coach: true }).eq('id', id); cargarAdminSolicitudes(); }
};
window.rechazarEntrenador = async function(id) {
    if(confirm("¿Rechazar solicitud?")) { await supabase.from('perfiles').update({ solicita_entrenador: false }).eq('id', id); cargarAdminSolicitudes(); }
};

async function cargarAdminEquipos() {
    const { data } = await supabase.from('equipos').select('*').order('created_at', { ascending: false });
    const tbody = document.getElementById('tabla-body-admin-equipos');
    tbody.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(e => {
            tbody.innerHTML += `<tr><td class="name-col">${e.nombre_equipo}</td><td>${e.categoria} ${e.genero}</td><td>${e.entrenador_principal}</td>
            <td><button onclick="entrarComoAdminAEquipo('${e.id}')" class="btn-ghost" style="padding:5px 10px; font-size:0.75rem;">Configurar ⚙️</button></td></tr>`;
        });
    } else { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--muted);">No hay equipos</td></tr>'; }
}

window.entrarComoAdminAEquipo = async function(equipo_id) {
    isAdminMode = true;
    document.getElementById('btn-volver-admin-panel').style.display = 'block';
    document.getElementById('btn-volver-mis-equipos').style.display = 'none';
    abrirDashboardEquipo(equipo_id); 
};

async function cargarAdminPartidos() {
    const { data } = await supabase.from('partidos').select('*').order('created_at', { ascending: false });
    const tbody = document.getElementById('tabla-body-admin-partidos');
    tbody.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(p => {
            const fecha = new Date(p.created_at).toLocaleDateString();
            tbody.innerHTML += `<tr><td>${fecha}</td><td>${p.categoria} ${p.genero}</td><td>Jor. ${p.jornada}</td>
            <td class="name-col">${p.nombre_local} <strong style="color:var(--accent)">${p.goles_local} - ${p.goles_visitante}</strong> ${p.nombre_visitante}</td>
            <td><button onclick="borrarPartidoAdmin('${p.id}', '${p.equipo_local_id}', '${p.equipo_visitante_id}', ${p.goles_local}, ${p.goles_visitante})" class="btn-danger" style="padding:5px 10px; font-size:0.75rem;">Borrar 🗑️</button></td></tr>`;
        });
    } else { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--muted);">No hay historial</td></tr>'; }
}

window.borrarPartidoAdmin = async function(partidoId, idL, idV, gl, gv) {
    if(!confirm("⚠️ ¿Seguro que quieres borrar este partido? Se restarán automáticamente los puntos y goles de ambos equipos.")) return;
    
    const { data: eqL } = await supabase.from('equipos').select('*').eq('id', idL).single();
    const { data: eqV } = await supabase.from('equipos').select('*').eq('id', idV).single();
    
    if (eqL && eqV) {
        let ptsL = 0, pgL = 0, peL = 0, ppL = 0;
        let ptsV = 0, pgV = 0, peV = 0, ppV = 0;

        if (gl > gv) { ptsL=2; pgL=1; ppV=1; } else if (gl === gv) { ptsL=1; peL=1; ptsV=1; peV=1; } else { ptsV=2; pgV=1; ppL=1; }

        await supabase.from('equipos').update({ jugados: Math.max(0, (eqL.jugados||0) - 1), victorias: Math.max(0, (eqL.victorias||0) - pgL), empates: Math.max(0, (eqL.empates||0) - peL), derrotas: Math.max(0, (eqL.derrotas||0) - ppL), goles_favor: Math.max(0, (eqL.goles_favor||0) - gl), goles_contra: Math.max(0, (eqL.goles_contra||0) - gv), puntos: Math.max(0, (eqL.puntos||0) - ptsL) }).eq('id', idL);
        await supabase.from('equipos').update({ jugados: Math.max(0, (eqV.jugados||0) - 1), victorias: Math.max(0, (eqV.victorias||0) - pgV), empates: Math.max(0, (eqV.empates||0) - peV), derrotas: Math.max(0, (eqV.derrotas||0) - ppV), goles_favor: Math.max(0, (eqV.goles_favor||0) - gv), goles_contra: Math.max(0, (eqV.goles_contra||0) - gl), puntos: Math.max(0, (eqV.puntos||0) - ptsV) }).eq('id', idV);
    }
    
    await supabase.from('partidos').delete().eq('id', partidoId);
    alert("Partido borrado y clasificación recalculada con éxito.");
    cargarAdminPartidos();
};

// =========================================================
// ====== GESTIÓN DE MIS EQUIPOS (MULTI-TEAM DASHBOARD) ====
// =========================================================

async function verificarEquipoEntrenador() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return mostrarSeccion('vista-login');

    const { data: equipos } = await supabase.from('equipos').select('*').eq('user_id', user.id).order('created_at', { ascending: false });

    if (equipos && equipos.length > 0) {
        mostrarSeccion('vista-mis-equipos');
        renderLobbyEquipos(equipos);
    } else {
        mostrarSeccion('vista-crear-equipo');
        document.getElementById('btn-volver-lobby').style.display = 'none';
    }
}

function renderLobbyEquipos(equipos) {
    const grid = document.getElementById('grid-mis-equipos');
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

window.abrirDashboardEquipo = async function(idEquipo) {
    const { data } = await supabase.from('equipos').select('*').eq('id', idEquipo).single();
    if (data) {
        miEquipoId = data.id;
        miEquipoActual = data; 

        document.getElementById('coach-team-name').innerText = data.nombre_equipo;
        document.getElementById('coach-team-info').innerText = `${data.categoria} ${data.genero} | ${data.modalidad}`;
        
        let staffText = `Entrenador: ${data.entrenador_principal}`;
        if(data.staff_1 || data.staff_2 || data.staff_3) staffText += ` | Staff: ` + [data.staff_1, data.staff_2, data.staff_3].filter(Boolean).join(", ");
        document.getElementById('coach-staff-info').innerText = staffText;

        if(!isAdminMode) {
            document.getElementById('btn-volver-mis-equipos').style.display = 'inline-block';
            document.getElementById('btn-volver-admin-panel').style.display = 'none';
        }

        mostrarSeccion('vista-entrenador');
        cargarMiPlantilla();
    }
};

document.getElementById('btn-volver-mis-equipos').onclick = () => { verificarEquipoEntrenador(); };
document.getElementById('btn-ir-crear-equipo').onclick = () => { 
    mostrarSeccion('vista-crear-equipo'); 
    document.getElementById('btn-volver-lobby').style.display = 'inline-block';
};
document.getElementById('btn-volver-lobby').onclick = () => { verificarEquipoEntrenador(); };

document.getElementById('btn-guardar-equipo').onclick = async function() {
    const btn = this; btn.innerText = "Creando..."; btn.disabled = true;
    const nombre = document.getElementById('new-equipo-nombre').value;
    const entrenador = document.getElementById('new-equipo-entrenador').value;
    const mod = document.getElementById('new-equipo-mod').value;
    const gen = document.getElementById('new-equipo-gen').value;
    const cat = document.getElementById('new-equipo-cat').value;
    
    if (!nombre || !entrenador) {
        btn.innerText = "💾 Guardar Equipo"; btn.disabled = false;
        return alert("Nombre de equipo y entrenador son obligatorios");
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('equipos').insert([{ nombre_equipo: nombre, modalidad: mod, genero: gen, categoria: cat, entrenador_principal: entrenador, user_id: user.id }]).select().single();

    btn.innerText = "💾 Guardar Equipo"; btn.disabled = false;
    
    // Limpiamos los inputs
    document.getElementById('new-equipo-nombre').value = '';
    
    if (!error) { abrirDashboardEquipo(data.id); } else { alert(error.message); }
};

document.getElementById('btn-borrar-equipo').onclick = async function() {
    if (confirm("⚠️ ¿Seguro que quieres borrar este equipo? Se borrarán TODOS los jugadores y estadísticas.")) {
        await supabase.from('equipos').delete().eq('id', miEquipoId);
        miEquipoId = null; miEquipoActual = null; 
        if(isAdminMode) { mostrarSeccion('vista-admin'); cargarAdminEquipos(); } else { verificarEquipoEntrenador(); }
    }
};

// --- GESTIÓN DE PLANTILLA ---
async function cargarMiPlantilla() {
    if (!miEquipoId) return;
    const { data } = await supabase.from('jugadores').select('*, equipos(categoria, genero)').eq('equipo_id', miEquipoId).order('dorsal', { ascending: true });
    const grid = document.getElementById('lista-mis-jugadores');
    grid.innerHTML = '';
    
    if(data && data.length > 0) {
        data.forEach(j => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.innerHTML = `<div class="player-badge">${j.equipos?.categoria || ''}</div><div class="player-number">${j.dorsal}</div><div class="player-info"><h4>${j.nombre}</h4><p>${j.posicion}</p></div>`;
            card.onclick = () => abrirEstadisticas(j);
            grid.appendChild(card);
        });
    } else { grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1; padding: 20px; color: var(--muted);">Plantilla vacía.</div>'; }
}

document.getElementById('btn-add-jugador').onclick = async function() {
    const btn = this; btn.innerText = "Añadiendo..."; btn.disabled = true;
    const nombre = document.getElementById('add-nombre').value;
    const dorsal = document.getElementById('add-dorsal').value;
    const posicion = document.getElementById('add-posicion').value;

    if(!nombre || !dorsal) { btn.innerText = "✚ Dar de Alta"; btn.disabled = false; return alert("Datos incompletos"); }
    
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('jugadores').insert([{ nombre, dorsal: parseInt(dorsal), posicion, equipo_id: miEquipoId, user_id: user.id }]);

    btn.innerText = "✚ Dar de Alta"; btn.disabled = false;
    if (!error) { document.getElementById('add-nombre').value = ''; document.getElementById('add-dorsal').value = ''; cargarMiPlantilla(); } else { alert(error.message); }
};

function abrirEstadisticas(j) {
    jugadorEditandoId = j.id;
    document.getElementById('modal-dorsal').innerText = j.dorsal;
    document.getElementById('modal-nombre').innerText = j.nombre;
    document.getElementById('modal-posicion').innerText = j.posicion;
    document.getElementById('stat-goles').innerText = j.goles || 0;
    document.getElementById('stat-partidos').innerText = j.partidos || 0;
    document.getElementById('stat-exclusiones').innerText = j.exclusiones || 0;
    document.getElementById('stat-amarillas').innerText = j.amarillas || 0;
    document.getElementById('stat-rojas').innerText = j.rojas || 0;
    document.getElementById('edit-nombre').value = j.nombre;
    document.getElementById('edit-dorsal-input').value = j.dorsal;
    document.getElementById('edit-posicion-input').value = j.posicion;
    
    document.getElementById('stats-vista').style.display = 'grid';
    document.getElementById('stats-edicion').style.display = 'none';
    document.getElementById('btn-borrar-jugador').style.display = 'block';
    document.getElementById('btn-editar-stats').style.display = 'block';
    document.getElementById('btn-guardar-stats').style.display = 'none';
    document.getElementById('modal-estadisticas').style.display = 'flex';
}

document.getElementById('btn-editar-stats').onclick = () => {
    document.getElementById('edit-goles').value = document.getElementById('stat-goles').innerText;
    document.getElementById('edit-partidos').value = document.getElementById('stat-partidos').innerText;
    document.getElementById('edit-exclusiones').value = document.getElementById('stat-exclusiones').innerText;
    document.getElementById('edit-amarillas').value = document.getElementById('stat-amarillas').innerText;
    document.getElementById('edit-rojas').value = document.getElementById('stat-rojas').innerText;
    document.getElementById('stats-vista').style.display = 'none';
    document.getElementById('stats-edicion').style.display = 'block';
    document.getElementById('btn-borrar-jugador').style.display = 'none';
    document.getElementById('btn-editar-stats').style.display = 'none';
    document.getElementById('btn-guardar-stats').style.display = 'block';
};

document.getElementById('btn-guardar-stats').onclick = async function() {
    const btn = this; btn.innerText = "Guardando..."; btn.disabled = true;
    const upd = { 
        nombre: document.getElementById('edit-nombre').value, dorsal: parseInt(document.getElementById('edit-dorsal-input').value), posicion: document.getElementById('edit-posicion-input').value,
        goles: parseInt(document.getElementById('edit-goles').value) || 0, partidos: parseInt(document.getElementById('edit-partidos').value) || 0, exclusiones: parseInt(document.getElementById('edit-exclusiones').value) || 0,
        amarillas: parseInt(document.getElementById('edit-amarillas').value) || 0, rojas: parseInt(document.getElementById('edit-rojas').value) || 0
    };
    
    const { error } = await supabase.from('jugadores').update(upd).eq('id', jugadorEditandoId);
    btn.innerText = "💾 Guardar Cambios"; btn.disabled = false;
    if(error) alert(error.message); else { document.getElementById('modal-estadisticas').style.display = 'none'; cargarMiPlantilla(); }
};

document.getElementById('btn-borrar-jugador').onclick = async function() {
    if (confirm("⚠️ ¿Estás seguro de que quieres eliminar a este jugador de la plantilla?")) {
        await supabase.from('jugadores').delete().eq('id', jugadorEditandoId);
        document.getElementById('modal-estadisticas').style.display = 'none'; cargarMiPlantilla();
    }
};

// =========================================================
// ====== CRONÓMETRO Y BOTONERA DIGITAL DE PARTIDO =========
// =========================================================

function formatTimer(totalSeconds) {
    let m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    let s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function updateTimerDisplay() {
    document.getElementById('timer-display').innerText = formatTimer(timerSeconds);
}

document.getElementById('btn-timer-toggle').onclick = function() {
    if(isTimerRunning) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        this.innerText = "▶ Iniciar";
        this.classList.replace('btn-danger', 'primary');
    } else {
        isTimerRunning = true;
        this.innerText = "⏸ Pausar";
        this.classList.replace('primary', 'btn-danger'); 
        if(!this.classList.contains('btn-danger')) { this.style.background = 'var(--danger)'; this.style.color = 'white'; } 
        
        timerInterval = setInterval(() => {
            timerSeconds++;
            updateTimerDisplay();
        }, 1000);
    }
};

document.getElementById('btn-timer-reset').onclick = function() {
    if(confirm("¿Poner el cronómetro a 00:00?")) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        timerSeconds = 0;
        updateTimerDisplay();
        let btnToggle = document.getElementById('btn-timer-toggle');
        btnToggle.innerText = "▶ Iniciar";
        btnToggle.style.background = ''; 
        btnToggle.classList.add('primary');
    }
};

async function cargarEquiposParaPartido() {
    const mod = document.getElementById('partido-mod').value;
    const gen = document.getElementById('partido-gen').value;
    const cat = document.getElementById('partido-cat').value;
    
    const { data: rivales } = await supabase.from('equipos').select('id, nombre_equipo').eq('categoria', cat).eq('genero', gen).eq('modalidad', mod);
    
    const selLocal = document.getElementById('partido-local');
    const selVis = document.getElementById('partido-visitante');
    selLocal.innerHTML = ''; selVis.innerHTML = '';
    
    if (rivales && rivales.length > 0) {
        rivales.forEach(r => {
            selLocal.innerHTML += `<option value="${r.id}">${r.nombre_equipo}</option>`;
            selVis.innerHTML += `<option value="${r.id}">${r.nombre_equipo}</option>`;
        });
        if (miEquipoId && rivales.some(r => r.id === miEquipoId)) {
            selLocal.value = miEquipoId;
        }
    } else {
        selLocal.innerHTML = '<option value="">Sin equipos registrados</option>';
        selVis.innerHTML = '<option value="">Sin equipos registrados</option>';
    }

    renderBotonesAccion(); 
    await actualizarPlantillasActa();
}

document.getElementById('partido-mod').onchange = cargarEquiposParaPartido;
document.getElementById('partido-gen').onchange = cargarEquiposParaPartido;
document.getElementById('partido-cat').onchange = cargarEquiposParaPartido;

async function actualizarPlantillasActa() {
    const idL = document.getElementById('partido-local').value;
    const idV = document.getElementById('partido-visitante').value;
    
    if(idL) {
        const { data } = await supabase.from('jugadores').select('*').eq('equipo_id', idL).order('dorsal', { ascending: true });
        actaJugadoresLocal = data || [];
    } else { actaJugadoresLocal = []; }
    
    if(idV) {
        const { data } = await supabase.from('jugadores').select('*').eq('equipo_id', idV).order('dorsal', { ascending: true });
        actaJugadoresVisita = data || [];
    } else { actaJugadoresVisita = []; }
    
    renderActaPlayers();
}

function renderActaPlayers() {
    const grid = document.getElementById('acta-jugadores-grid');
    grid.innerHTML = '';
    actaJugadorSeleccionado = null; 
    
    const jugadores = actaEquipoRol === 'local' ? actaJugadoresLocal : actaJugadoresVisita;
    
    if(jugadores.length === 0) {
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
    const modSeleccionada = document.getElementById('partido-mod').value;
    
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

function procesarClicAccion(tipo) {
    if(!actaJugadorSeleccionado) return alert('Por favor, selecciona primero el dorsal de un jugador.');
    
    const minutoActual = Math.floor(timerSeconds / 60) + 1;
    const idEquipoReal = actaEquipoRol === 'local' ? document.getElementById('partido-local').value : document.getElementById('partido-visitante').value;

    if(!idEquipoReal) return alert("Falta seleccionar el equipo.");

    eventosDraft.push({
        id_temporal: Date.now(),
        minuto: minutoActual,
        equipo_id: idEquipoReal,
        rol_equipo: actaEquipoRol,
        jugador_id: actaJugadorSeleccionado.id,
        nombre_jugador: actaJugadorSeleccionado.nombre,
        dorsal: parseInt(actaJugadorSeleccionado.dorsal),
        tipo_evento: tipo
    });

    if(tipo === 'gol' || tipo === 'gol1') marcadorDraft[actaEquipoRol] += 1;
    if(tipo === 'gol2') marcadorDraft[actaEquipoRol] += 2;
    
    eventosDraft.sort((a,b) => a.minuto - b.minuto);
    actualizarVistaDraft();
    
    document.querySelectorAll('.acta-player-btn').forEach(b => b.classList.remove('active'));
    actaJugadorSeleccionado = null;
}

document.getElementById('btn-acta-local').onclick = () => { 
    actaEquipoRol = 'local'; 
    document.getElementById('btn-acta-local').classList.add('active'); document.getElementById('btn-acta-vis').classList.remove('active'); 
    renderActaPlayers(); 
};
document.getElementById('btn-acta-vis').onclick = () => { 
    actaEquipoRol = 'visitante'; 
    document.getElementById('btn-acta-vis').classList.add('active'); document.getElementById('btn-acta-local').classList.remove('active'); 
    renderActaPlayers(); 
};

// AL ABRIR EL MODAL DE PARTIDO
document.getElementById('btn-abrir-partido').onclick = async function() {
    if(!miEquipoActual) return;
    
    eventosDraft = []; marcadorDraft = { local: 0, visitante: 0 };
    clearInterval(timerInterval); isTimerRunning = false; timerSeconds = 0; updateTimerDisplay();
    document.getElementById('btn-timer-toggle').innerText = "▶ Iniciar"; document.getElementById('btn-timer-toggle').style.background = '';
    
    actualizarVistaDraft();

    const selJornada = document.getElementById('partido-jornada'); selJornada.innerHTML = '';
    for(let i=1; i<=30; i++) selJornada.innerHTML += `<option value="${i}">Jornada ${i}</option>`;

    document.getElementById('partido-mod').value = miEquipoActual.modalidad;
    document.getElementById('partido-gen').value = miEquipoActual.genero;
    document.getElementById('partido-cat').value = miEquipoActual.categoria;

    await cargarEquiposParaPartido();

    actaEquipoRol = 'local';
    document.getElementById('btn-acta-local').classList.add('active'); document.getElementById('btn-acta-vis').classList.remove('active');

    document.getElementById('modal-partido').style.display = 'flex';
};

document.getElementById('partido-local').onchange = actualizarPlantillasActa;
document.getElementById('partido-visitante').onchange = actualizarPlantillasActa;

function actualizarVistaDraft() {
    document.getElementById('preview-goles-local').innerText = marcadorDraft.local;
    document.getElementById('preview-goles-visitante').innerText = marcadorDraft.visitante;
    document.getElementById('partido-gf-local').value = marcadorDraft.local;
    document.getElementById('partido-gf-visitante').value = marcadorDraft.visitante;

    const container = document.getElementById('lista-eventos-draft');
    container.innerHTML = '';
    if(eventosDraft.length === 0) { container.innerHTML = '<p style="color:var(--muted); font-size:0.8rem; text-align:center; padding:10px;">Aún no hay eventos registrados.</p>'; return; }

    eventosDraft.forEach(ev => {
        let icono = ""; let color = "";
        if(ev.tipo_evento === 'gol' || ev.tipo_evento === 'gol1') { icono = "⚽ Gol (+1)"; color = "var(--success)"; }
        if(ev.tipo_evento === 'gol2') { icono = "🚀 Gol Doble (+2)"; color = "#f97316"; }
        if(ev.tipo_evento === 'amarilla') { icono = "🟨 Amarilla"; color = "#facc15"; }
        if(ev.tipo_evento === '2min' || ev.tipo_evento === 'exclusion') { icono = "⏱️ Exclusión"; color = "#f59e0b"; }
        if(ev.tipo_evento === 'roja') { icono = "🟥 Roja"; color = "var(--danger)"; }

        const equipoTexto = ev.rol_equipo === 'local' ? '(L)' : '(V)';

        container.innerHTML += `
            <div class="draft-event-item">
                <div><span style="font-weight:bold; color:var(--accent);">Min ${ev.minuto}'</span> - <strong>#${ev.dorsal} ${ev.nombre_jugador}</strong> <span style="color:var(--muted); font-size:0.7rem;">${equipoTexto}</span></div>
                <div style="display:flex; align-items:center; gap:10px;"><span style="color:${color}; font-weight:bold;">${icono}</span>
                    <button onclick="borrarEventoDraft(${ev.id_temporal}, '${ev.tipo_evento}', '${ev.rol_equipo}')" style="background:transparent; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem;">&times;</button>
                </div>
            </div>`;
    });
}

window.borrarEventoDraft = function(idTemp, tipo, rolEquipo) {
    eventosDraft = eventosDraft.filter(e => e.id_temporal !== idTemp);
    if(tipo === 'gol' || tipo === 'gol1') marcadorDraft[rolEquipo] -= 1; 
    if(tipo === 'gol2') marcadorDraft[rolEquipo] -= 2; 
    actualizarVistaDraft();
};

document.getElementById('btn-guardar-partido').onclick = async function() {
    const modSelect = document.getElementById('partido-mod').value;
    const genSelect = document.getElementById('partido-gen').value;
    const catSelect = document.getElementById('partido-cat').value;
    
    const jornada = document.getElementById('partido-jornada').value;
    const idLocal = document.getElementById('partido-local').value;
    const idVis = document.getElementById('partido-visitante').value;
    
    if(!idLocal || !idVis) return alert("Faltan equipos por seleccionar.");
    if(idLocal === idVis) return alert("Un equipo no puede jugar contra sí mismo");

    const nombreLocal = document.getElementById('partido-local').options[document.getElementById('partido-local').selectedIndex].text;
    const nombreVis = document.getElementById('partido-visitante').options[document.getElementById('partido-visitante').selectedIndex].text;
    
    const gl = parseInt(document.getElementById('partido-gf-local').value) || 0;
    const gv = parseInt(document.getElementById('partido-gf-visitante').value) || 0;

    const btn = this; btn.innerText = "Guardando Partido..."; btn.disabled = true;
    clearInterval(timerInterval); isTimerRunning = false;

    const { data: partidoGuardado, error: errPartido } = await supabase.from('partidos').insert([{
        jornada, equipo_local_id: idLocal, equipo_visitante_id: idVis, nombre_local: nombreLocal, nombre_visitante: nombreVis,
        goles_local: gl, goles_visitante: gv, categoria: catSelect, genero: genSelect, modalidad: modSelect
    }]).select().single();

    if(errPartido) { btn.innerText = "💾 Finalizar y Guardar Acta"; btn.disabled = false; return alert("Error: " + errPartido.message); }

    if (eventosDraft.length > 0) {
        let statsPorJugador = {};

        const insertsEventos = eventosDraft.map(ev => {
            if(!statsPorJugador[ev.jugador_id]) { statsPorJugador[ev.jugador_id] = { goles: 0, amarillas: 0, rojas: 0, exclusiones: 0 }; }
            
            let golesASumar = 0;
            if(ev.tipo_evento === 'gol' || ev.tipo_evento === 'gol1') golesASumar = 1;
            if(ev.tipo_evento === 'gol2') golesASumar = 2;

            statsPorJugador[ev.jugador_id].goles += golesASumar;
            if(ev.tipo_evento === 'amarilla') statsPorJugador[ev.jugador_id].amarillas += 1;
            if(ev.tipo_evento === '2min' || ev.tipo_evento === 'exclusion') statsPorJugador[ev.jugador_id].exclusiones += 1;
            if(ev.tipo_evento === 'roja') statsPorJugador[ev.jugador_id].rojas += 1;

            return {
                partido_id: partidoGuardado.id, minuto: ev.minuto, equipo_id: ev.equipo_id, jugador_id: ev.jugador_id,
                nombre_jugador: ev.nombre_jugador, dorsal: ev.dorsal, tipo_evento: ev.tipo_evento
            };
        });

        await supabase.from('eventos_partido').insert(insertsEventos);

        for (const [jId, statsAñadir] of Object.entries(statsPorJugador)) {
            const { data: jActual } = await supabase.from('jugadores').select('*').eq('id', jId).single();
            if(jActual) {
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

    const { data: eqL } = await supabase.from('equipos').select('*').eq('id', idLocal).single();
    const { data: eqV } = await supabase.from('equipos').select('*').eq('id', idVis).single();
    let ptsL = 0, pgL = 0, peL = 0, ppL = 0;
    let ptsV = 0, pgV = 0, peV = 0, ppV = 0;

    if (gl > gv) { ptsL=2; pgL=1; ppV=1; } else if (gl === gv) { ptsL=1; peL=1; ptsV=1; peV=1; } else { ptsV=2; pgV=1; ppL=1; }

    if(eqL) await supabase.from('equipos').update({ jugados: (eqL.jugados||0)+1, victorias: (eqL.victorias||0)+pgL, empates: (eqL.empates||0)+peL, derrotas: (eqL.derrotas||0)+ppL, goles_favor: (eqL.goles_favor||0)+gl, goles_contra: (eqL.goles_contra||0)+gv, puntos: (eqL.puntos||0)+ptsL }).eq('id', idLocal);
    if(eqV) await supabase.from('equipos').update({ jugados: (eqV.jugados||0)+1, victorias: (eqV.victorias||0)+pgV, empates: (eqV.empates||0)+peV, derrotas: (eqV.derrotas||0)+ppV, goles_favor: (eqV.goles_favor||0)+gv, goles_contra: (eqV.goles_contra||0)+gl, puntos: (eqV.puntos||0)+ptsV }).eq('id', idVis);

    document.getElementById('modal-partido').style.display = 'none';
    btn.innerText = "💾 Finalizar y Guardar Acta"; btn.disabled = false;
    verificarEquipoEntrenador(); 
    alert("¡Partido y Acta registrados correctamente!");
};

// --- EDITAR ESTADÍSTICAS DEL EQUIPO A MANO ---
document.getElementById('btn-editar-equipo-stats').onclick = function() {
    if(!miEquipoActual) return;
    document.getElementById('edit-eq-pj').value = miEquipoActual.jugados || 0;
    document.getElementById('edit-eq-ptos').value = miEquipoActual.puntos || 0;
    document.getElementById('edit-eq-pg').value = miEquipoActual.victorias || 0;
    document.getElementById('edit-eq-pe').value = miEquipoActual.empates || 0;
    document.getElementById('edit-eq-pp').value = miEquipoActual.derrotas || 0;
    document.getElementById('edit-eq-gf').value = miEquipoActual.goles_favor || 0;
    document.getElementById('edit-eq-gc').value = miEquipoActual.goles_contra || 0;
    document.getElementById('modal-equipo-stats').style.display = 'flex';
};
document.getElementById('btn-guardar-equipo-stats').onclick = async function() {
    const upd = {
        jugados: parseInt(document.getElementById('edit-eq-pj').value) || 0, puntos: parseInt(document.getElementById('edit-eq-ptos').value) || 0,
        victorias: parseInt(document.getElementById('edit-eq-pg').value) || 0, empates: parseInt(document.getElementById('edit-eq-pe').value) || 0, derrotas: parseInt(document.getElementById('edit-eq-pp').value) || 0,
        goles_favor: parseInt(document.getElementById('edit-eq-gf').value) || 0, goles_contra: parseInt(document.getElementById('edit-eq-gc').value) || 0
    };
    await supabase.from('equipos').update(upd).eq('id', miEquipoId);
    document.getElementById('modal-equipo-stats').style.display = 'none'; verificarEquipoEntrenador();
};

// --- EDITAR INFORMACIÓN DEL EQUIPO ---
document.getElementById('btn-editar-info-equipo').onclick = function() {
    if(!miEquipoActual) return;
    document.getElementById('info-eq-nombre').value = miEquipoActual.nombre_equipo;
    document.getElementById('info-eq-entrenador').value = miEquipoActual.entrenador_principal;
    document.getElementById('info-eq-mod').value = miEquipoActual.modalidad;
    document.getElementById('info-eq-gen').value = miEquipoActual.genero;
    document.getElementById('info-eq-cat').value = miEquipoActual.categoria;
    document.getElementById('info-eq-staff1').value = miEquipoActual.staff_1 || "";
    document.getElementById('info-eq-staff2').value = miEquipoActual.staff_2 || "";
    document.getElementById('info-eq-staff3').value = miEquipoActual.staff_3 || "";
    document.getElementById('modal-editar-info-equipo').style.display = 'flex';
};
document.getElementById('btn-guardar-info-equipo').onclick = async function() {
    const btn = this; btn.innerText = "Guardando..."; btn.disabled = true;
    const upd = {
        nombre_equipo: document.getElementById('info-eq-nombre').value, entrenador_principal: document.getElementById('info-eq-entrenador').value,
        modalidad: document.getElementById('info-eq-mod').value, genero: document.getElementById('info-eq-gen').value, categoria: document.getElementById('info-eq-cat').value,
        staff_1: document.getElementById('info-eq-staff1').value, staff_2: document.getElementById('info-eq-staff2').value, staff_3: document.getElementById('info-eq-staff3').value,
    };
    await supabase.from('equipos').update(upd).eq('id', miEquipoId);
    document.getElementById('modal-editar-info-equipo').style.display = 'none'; btn.innerText = "💾 Guardar Información"; btn.disabled = false; verificarEquipoEntrenador();
};

// Cierre de todos los modales (añadido reset de cronómetro)
document.querySelectorAll('.close-btn').forEach(btn => {
    btn.onclick = function() { 
        this.parentElement.parentElement.style.display = 'none'; 
        clearInterval(timerInterval); isTimerRunning = false; 
    }
});
window.onclick = function(e) { 
    if(e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none'; 
        clearInterval(timerInterval); isTimerRunning = false;
    }
};

// --- AUTH Y CARGA INICIAL ---
async function comprobarEstado() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        document.getElementById('btn-ir-login').style.display = 'none';
        document.getElementById('btn-cerrar-sesion').style.display = 'inline-block';
        document.getElementById('aviso-login').style.display = 'none';

        const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', user.id).single();
        if(perfil) {
            if (perfil.is_admin) document.getElementById('btn-nav-admin').style.display = 'inline-block';
            if (perfil.is_coach || perfil.is_admin) {
                document.getElementById('btn-nav-equipo').style.display = 'inline-block';
                document.getElementById('btn-nav-goleadores').style.display = 'inline-block';
            } else if (perfil.solicita_entrenador) {
                alert("Tu solicitud para ser entrenador está pendiente de ser aprobada por el administrador.");
            }
        }
    }
}

document.getElementById('btn-entrar').onclick = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: document.getElementById('correo').value, password: document.getElementById('pass').value });
    if (error) alert(error.message); else location.reload();
};
document.getElementById('btn-crear-cuenta').onclick = async () => {
    const email = document.getElementById('reg-correo').value;
    const pass = document.getElementById('reg-pass').value;
    const esEntrenador = document.getElementById('check-entrenador').checked;
    const { data, error } = await supabase.auth.signUp({ email, password: pass });
    if (error) { alert(error.message); } 
    else if(data.user) { 
        await supabase.from('perfiles').insert([{ id: data.user.id, email: email, solicita_entrenador: esEntrenador }]);
        alert("Cuenta creada. Si solicitaste ser entrenador, espera a ser aprobado."); 
        await supabase.auth.signOut(); location.reload();
    }
};
document.getElementById('btn-cerrar-sesion').onclick = async () => { await supabase.auth.signOut(); location.reload(); };
document.getElementById('tab-login').onclick = () => { document.getElementById('form-login').style.display = 'block'; document.getElementById('form-registro').style.display = 'none'; };
document.getElementById('tab-registro').onclick = () => { document.getElementById('form-login').style.display = 'none'; document.getElementById('form-registro').style.display = 'block'; };

comprobarEstado();