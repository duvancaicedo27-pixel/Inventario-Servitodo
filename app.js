const API_URL="https://script.google.com/macros/s/AKfycbzecYLH2NvZwucN2L0E1nPmqdeyknQkmrgVYhBrNpOHKhGQu9A_sM4pz1KDogjRPRgSfw/exec";

let estadoSeleccionado="";
let registros=[];
let clientes=[];
let elementos=[];
let elementoActual="";

const ahora=new Date();
const fechaTexto=ahora.toLocaleDateString("es-CO",{day:"2-digit",month:"2-digit",year:"numeric"});

const clienteSelect=document.getElementById("cliente");
const elementoBusqueda=document.getElementById("elementoBusqueda");
const listaElementos=document.getElementById("listaElementos");
const elementoSeleccionado=document.getElementById("elementoSeleccionado");
const limpiarElemento=document.getElementById("limpiarElemento");
const botonesEstado=document.querySelectorAll(".estado-btn");
const registrarBtn=document.getElementById("registrarBtn");

const logoServitodo=new Image();
logoServitodo.src="./logo-servitodo.png";

if(document.getElementById("fechaActual")){
    document.getElementById("fechaActual").textContent=fechaTexto;
}

function normalizarTexto(texto){
    return String(texto||"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function formatear(numero){
    return Number(numero||0).toLocaleString("es-CO");
}

function escaparHTML(texto){
    return String(texto||"")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function mostrarMensaje(texto,tipo){
    const mensaje=document.getElementById("mensaje");
    if(!mensaje)return;
    mensaje.textContent=texto;
    mensaje.style.color=tipo==="ok"?"#168548":"#c62828";
    clearTimeout(window.mensajeTimeout);
    window.mensajeTimeout=setTimeout(()=>mensaje.textContent="",3000);
}

botonesEstado.forEach(boton=>{
    boton.addEventListener("click",()=>{
        botonesEstado.forEach(b=>b.classList.remove("active"));
        boton.classList.add("active");
        estadoSeleccionado=boton.dataset.estado;
    });
});

clienteSelect.addEventListener("change",()=>{
    elementoActual="";
    elementoBusqueda.value="";
    listaElementos.style.display="none";
    limpiarElemento.style.display="none";
    elementoSeleccionado.textContent="Ningún elemento seleccionado";
    elementoSeleccionado.classList.remove("error");
    elementoBusqueda.disabled=!clienteSelect.value;
    elementoBusqueda.placeholder=clienteSelect.value?"🔍 Buscar elemento...":"Primero selecciona un cliente";
});

function obtenerElementosCliente(){
    const cliente=normalizarTexto(clienteSelect.value);
    return elementos.filter(item=>normalizarTexto(item.cliente)===cliente);
}

elementoBusqueda.addEventListener("input",()=>{
    elementoActual="";
    elementoSeleccionado.textContent="Ningún elemento seleccionado";
    const texto=normalizarTexto(elementoBusqueda.value);
    const disponibles=obtenerElementosCliente();
    const filtrados=texto?disponibles.filter(item=>normalizarTexto(item.elemento).includes(texto)):disponibles;
    mostrarListaElementos(filtrados);
});

elementoBusqueda.addEventListener("focus",()=>{
    if(clienteSelect.value)mostrarListaElementos(obtenerElementosCliente());
});

function mostrarListaElementos(lista){
    listaElementos.innerHTML="";
    if(!clienteSelect.value){
        listaElementos.style.display="none";
        return;
    }
    if(lista.length===0){
        listaElementos.innerHTML=`<div class="elemento-vacio">No hay elementos disponibles</div>`;
        listaElementos.style.display="block";
        return;
    }
    lista.forEach(item=>{
        const opcion=document.createElement("div");
        opcion.className="elemento-opcion";
        opcion.textContent=item.elemento;
        opcion.addEventListener("click",()=>seleccionarElemento(item.elemento));
        listaElementos.appendChild(opcion);
    });
    listaElementos.style.display="block";
}

function seleccionarElemento(elemento){
    elementoActual=elemento;
    elementoBusqueda.value=elemento;
    elementoSeleccionado.textContent="✓ Elemento seleccionado: "+elemento;
    elementoSeleccionado.classList.remove("error");
    listaElementos.style.display="none";
    limpiarElemento.style.display="block";
}

limpiarElemento.addEventListener("click",()=>{
    elementoActual="";
    elementoBusqueda.value="";
    elementoSeleccionado.textContent="Ningún elemento seleccionado";
    elementoSeleccionado.classList.remove("error");
    limpiarElemento.style.display="none";
    listaElementos.style.display="none";
    elementoBusqueda.focus();
});

document.addEventListener("click",event=>{
    const wrapper=document.querySelector(".elemento-wrapper");
    if(wrapper&&!wrapper.contains(event.target))listaElementos.style.display="none";
});


// =====================================================
// ALMACENAMIENTO LOCAL Y SINCRONIZACION
// =====================================================
const DB_NAME="InventarioServitodoOffline";
const DB_VERSION=2;
let dbOffline=null;
let sincronizando=false;
let pendientesInventario=0;
let pendientesXCC=0;
let intervaloSincronizacion=null;
let detallePendientesInventario=[];
let detallePendientesXCC=[];
let temporizadorNotificacion=null;
let firmaNotificacion="";
let notificacionVisible=false;
function abrirDBOffline(){
    return new Promise((resolve,reject)=>{
        const req=indexedDB.open(DB_NAME,DB_VERSION);
        req.onupgradeneeded=e=>{
            const db=e.target.result;
            if(!db.objectStoreNames.contains("movimientos"))db.createObjectStore("movimientos",{keyPath:"id"});
            if(!db.objectStoreNames.contains("operaciones"))db.createObjectStore("operaciones",{keyPath:"id"});
            if(!db.objectStoreNames.contains("catalogos"))db.createObjectStore("catalogos",{keyPath:"id"});
            if(!db.objectStoreNames.contains("xcc"))db.createObjectStore("xcc",{keyPath:"id"});
            if(!db.objectStoreNames.contains("operacionesXCC"))db.createObjectStore("operacionesXCC",{keyPath:"id"});
        };
        req.onsuccess=e=>{dbOffline=e.target.result;resolve(dbOffline)};
        req.onerror=()=>reject(req.error);
    });
}
function dbPut(store,value){
    return new Promise((resolve,reject)=>{
        const tx=dbOffline.transaction(store,"readwrite");
        tx.objectStore(store).put(value);
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
    });
}
function dbPutMultiple(items){
    return new Promise((resolve,reject)=>{
        const stores=[...new Set(items.map(x=>x.store))];
        const tx=dbOffline.transaction(stores,"readwrite");
        items.forEach(x=>tx.objectStore(x.store).put(x.value));
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
        tx.onabort=()=>reject(tx.error||new Error("Transacción local abortada"));
    });
}
function dbDelete(store,key){
    return new Promise((resolve,reject)=>{
        const tx=dbOffline.transaction(store,"readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
    });
}
function dbAll(store){
    return new Promise((resolve,reject)=>{
        const req=dbOffline.transaction(store,"readonly").objectStore(store).getAll();
        req.onsuccess=()=>resolve(req.result||[]);
        req.onerror=()=>reject(req.error);
    });
}
function generarIdLocal(prefijo="id"){return prefijo+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,10)}
function renderizarColaSincronizacion(){
    let panel=document.getElementById("colaSincronizacion");
    if(!panel){
        panel=document.createElement("div");
        panel.id="colaSincronizacion";
        document.body.appendChild(panel);
        const st=document.createElement("style");
        st.textContent=`#colaSincronizacion{position:fixed;right:18px;bottom:72px;width:min(420px,calc(100vw - 36px));max-height:55vh;overflow:auto;z-index:9998;background:#fff;border:1px solid #d9e2eb;border-radius:14px;box-shadow:0 14px 35px rgba(16,43,78,.16);padding:13px;display:none;font-family:Inter,Segoe UI,Arial,sans-serif;color:#17385d}.cola-titulo{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;color:#17385d;font-size:12px;font-weight:900}.cola-subtitulo{color:#71829a;font-size:10px;font-weight:700}.cola-lista{display:grid;gap:8px}.cola-item{border:1px solid #e0e7ef;border-radius:10px;padding:10px;background:#fff}.cola-item-tipo{display:inline-flex;align-items:center;padding:4px 7px;border-radius:6px;background:#eef4fa;color:#195db7;font-size:9px;font-weight:900;letter-spacing:.3px;margin-bottom:7px}.cola-item-linea{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start}.cola-item-info strong{display:block;color:#17385d;font-size:12px;line-height:1.25}.cola-item-info span{display:block;color:#6f8298;font-size:10px;margin-top:3px;line-height:1.3}.cola-item-estado{font-size:9px;font-weight:900;white-space:nowrap;padding:5px 7px;border-radius:6px;background:#fff4d7;color:#9a6800}.cola-item.inventario .cola-item-tipo{background:#eaf4ee;color:#168548}.cola-item.xcc .cola-item-tipo{background:#eef0fb;color:#7140a8}.cola-vacio{padding:7px 2px;color:#7c8ea2;font-size:10px}@media(max-width:600px){#colaSincronizacion{right:10px;bottom:66px;width:calc(100vw - 20px);max-height:48vh}}`;
        document.head.appendChild(st);
    }
    const total=detallePendientesInventario.length+detallePendientesXCC.length;
    if(total===0){
        clearTimeout(temporizadorNotificacion);
        temporizadorNotificacion=null;
        panel.style.display="none";
        panel.classList.remove("visible");
        notificacionVisible=false;
        firmaNotificacion="";
        return;
    }
    const inventario=detallePendientesInventario.map(op=>{const p=op.payload||{};return`<div class="cola-item inventario"><div class="cola-item-tipo">INVENTARIO</div><div class="cola-item-linea"><div class="cola-item-info"><strong>${escaparHTML(p.cliente||"Sin cliente")} · ${escaparHTML(p.elemento||"Sin elemento")}</strong><span>${formatear(p.cantidad)} und · ${escaparHTML(p.estado||"Sin estado")}${p.hora?" · "+escaparHTML(p.hora):""}</span></div><div class="cola-item-estado">${sincronizando?"SINCRONIZANDO":"PENDIENTE"}</div></div></div>`}).join("");
    const xcc=detallePendientesXCC.map(op=>{const p=op.payload||{};return`<div class="cola-item xcc"><div class="cola-item-tipo">ESTIBAS XCC</div><div class="cola-item-linea"><div class="cola-item-info"><strong>${escaparHTML(p.cliente||"Sin cliente")}</strong><span>${formatear(p.inventarioActual)} estibas · objetivo ${formatear(p.objetivo)}</span></div><div class="cola-item-estado">${sincronizando?"SINCRONIZANDO":"PENDIENTE"}</div></div></div>`}).join("");
    const firma=JSON.stringify({total,inv:detallePendientesInventario.map(x=>x.id),xcc:detallePendientesXCC.map(x=>x.id),sincronizando});
    const cambio=firma!==firmaNotificacion;
    firmaNotificacion=firma;
    panel.innerHTML=`<div class="cola-titulo"><span>${sincronizando?"Sincronizando...":"Pendientes de sincronizar"}</span><span class="cola-subtitulo">${total} pendiente${total===1?"":"s"}</span></div><div class="cola-lista">${inventario}${xcc}</div>`;
    if(cambio||!notificacionVisible){
        panel.style.display="block";
        notificacionVisible=true;
        clearTimeout(temporizadorNotificacion);
        temporizadorNotificacion=setTimeout(()=>{
            panel.style.display="none";
            notificacionVisible=false;
        },7000);
    }
}
function renderizarEstadoConexion(){
    let indicador=document.getElementById("estadoConexion");
    if(!indicador){
        indicador=document.createElement("div");
        indicador.id="estadoConexion";
        document.body.appendChild(indicador);
        const st=document.createElement("style");
        st.textContent=`#estadoConexion{position:fixed;right:18px;bottom:18px;z-index:9999;background:#fff;border:1px solid #dce4eb;border-radius:999px;padding:10px 14px;box-shadow:0 8px 25px rgba(16,43,78,.14);font:800 11px Arial;color:#53677c;display:flex;align-items:center;gap:8px}.conexion-punto{width:9px;height:9px;border-radius:50%;display:inline-block;background:#168548}.conexion-offline .conexion-punto{background:#d94c4c}.conexion-pendiente .conexion-punto{background:#e6a400}.conexion-sync .conexion-punto{background:#1957ae;animation:parpadeo 1s infinite}@keyframes parpadeo{50%{opacity:.3}}`;
        document.head.appendChild(st);
    }
    const pendientes=pendientesInventario+pendientesXCC;
    indicador.className=!navigator.onLine?"conexion-offline":sincronizando?"conexion-sync":pendientes?"conexion-pendiente":"";
    indicador.innerHTML=`<span class="conexion-punto"></span>${!navigator.onLine?"Sin conexión":sincronizando?"Sincronizando...":pendientes?pendientes+" pendiente"+(pendientes===1?"":"s"):"Sincronizado"}`;
    renderizarColaSincronizacion();
}
async function actualizarEstadoConexion(){
    renderizarEstadoConexion();
    if(!dbOffline)return;
    try{
        const [ops,opsXcc]=await Promise.all([dbAll("operaciones"),dbAll("operacionesXCC")]);
        pendientesInventario=ops.length;
        pendientesXCC=opsXcc.length;
        detallePendientesInventario=ops;
        detallePendientesXCC=opsXcc;
        renderizarEstadoConexion();
    }catch(e){console.warn("No se pudo actualizar pendientes",e);}
}
async function sincronizarPendientes(){
    if(!navigator.onLine||!dbOffline||sincronizando)return;
    sincronizando=true;
    try{
        const ops=await dbAll("operaciones");
        detallePendientesInventario=ops;
        pendientesInventario=ops.length;
        renderizarEstadoConexion();
        for(const op of ops){
            try{
                const respuesta=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(op.payload),keepalive:true});
                const resultado=await respuesta.json();
                if(!resultado.ok)throw new Error(resultado.error||"Error de sincronización");
                if(op.payload.accion==="eliminarMovimiento"){
                    const idx=registros.findIndex(r=>r.id===op.payload.localId);
                    if(idx>=0)registros.splice(idx,1);
                }else{
                    const item=registros.find(r=>r.id===op.payload.localId);
                    if(item){item.sincronizado=true;item.fila=resultado.fila||item.fila;await dbPut("movimientos",item);}
                }
                await dbDelete("operaciones",op.id);
                detallePendientesInventario=detallePendientesInventario.filter(x=>x.id!==op.id);
                pendientesInventario=detallePendientesInventario.length;
                renderizarEstadoConexion();
            }catch(e){console.warn("Pendiente no sincronizado",e);break;}
        }
    }finally{
        sincronizando=false;
        renderizarEstadoConexion();
        actualizarMovimientos();
        actualizarResumen();
        programarReintentoSincronizacion();
    }
}
function programarReintentoSincronizacion(){
    clearInterval(intervaloSincronizacion);
    if(!navigator.onLine)return;
    if((pendientesInventario+pendientesXCC)<=0)return;
    intervaloSincronizacion=setInterval(()=>{
        if(!navigator.onLine){clearInterval(intervaloSincronizacion);intervaloSincronizacion=null;return;}
        sincronizarPendientes();
        sincronizarXCCPendientes();
    },3000);
}
window.addEventListener("online",()=>{
    renderizarEstadoConexion();
    sincronizarPendientes();
    sincronizarXCCPendientes();
    actualizarEstadoConexion();
});
window.addEventListener("offline",()=>{clearInterval(intervaloSincronizacion);intervaloSincronizacion=null;renderizarEstadoConexion();});

async function cargarCatalogos(){
    let cache=null;
    try{
        if(dbOffline){
            try{
                const locales=await dbAll("catalogos");
                cache=locales.find(x=>x.id==="principal")||null;
            }catch(e){console.warn("No se pudo leer catálogo local:",e);}
        }
        if(!cache){
            try{
                const localStorageCache=localStorage.getItem("servitodo_catalogos");
                if(localStorageCache)cache=JSON.parse(localStorageCache);
            }catch(e){console.warn("No se pudo leer catálogo de localStorage:",e);}
        }
        const pintarCatalogo=()=>{
            clienteSelect.innerHTML="";
            const inicial=document.createElement("option");
            inicial.value="";
            inicial.textContent="Seleccionar cliente";
            clienteSelect.appendChild(inicial);
            clientes.forEach(cliente=>{
                const option=document.createElement("option");
                option.value=cliente;
                option.textContent=cliente;
                clienteSelect.appendChild(option);
            });
            elementoBusqueda.disabled=true;
            elementoBusqueda.placeholder="Primero selecciona un cliente";
        };
        if(cache){
            clientes=cache.clientes||[];
            elementos=cache.elementos||[];
            pintarCatalogo();
        }
        if(navigator.onLine){
            const actualizarRemoto=async()=>{
                try{
                    const respuesta=await fetch(API_URL+"?accion=obtenerCatalogos&_="+Date.now(),{cache:"no-store"});
                    if(!respuesta.ok)throw new Error("HTTP "+respuesta.status);
                    const resultado=await respuesta.json();
                    if(!resultado.ok)throw new Error(resultado.error||"La API devolvió un error");
                    clientes=Array.isArray(resultado.clientes)?resultado.clientes:[];
                    elementos=Array.isArray(resultado.elementos)?resultado.elementos:[];
                    const catalogo={id:"principal",clientes,elementos};
                    try{localStorage.setItem("servitodo_catalogos",JSON.stringify(catalogo));}catch(e){}
                    if(dbOffline)try{await dbPut("catalogos",catalogo);}catch(e){console.warn("No se pudo guardar catálogo local:",e);}
                    pintarCatalogo();
                }catch(error){
                    console.warn("No se pudo consultar catálogo remoto:",error);
                    if(!cache)throw error;
                }
            };
            if(cache)actualizarRemoto().catch(error=>console.warn(error));
            else await actualizarRemoto();
        }else if(!cache){
            throw new Error("No hay catálogos guardados localmente.");
        }
        if(!clientes.length)throw new Error("No hay clientes disponibles.");
    }catch(error){
        console.error("Error cargando catálogos:",error);
        mostrarMensaje(navigator.onLine?"❌ No se pudieron cargar los clientes y elementos":"⚠ Sin conexión: no hay datos locales de clientes y elementos","error");
    }
}

async function cargarInventario(){
    try{
        if(!dbOffline)await abrirDBOffline();
        const locales=await dbAll("movimientos");
        const localesHoy=locales.filter(r=>r.fecha===fechaTexto);

        // Con internet, primero mostramos los datos reales del servidor.
        // Los datos locales solo se usan como respaldo o para movimientos pendientes,
        // evitando que una copia local antigua/corrupta aparezca por unos milisegundos.
        const actualizarRemoto=async()=>{
            if(!navigator.onLine)return false;
            try{
                const respuesta=await fetch(API_URL+"?accion=obtenerInventario&fecha="+encodeURIComponent(fechaTexto)+"&_="+Date.now(),{cache:"no-store"});
                if(!respuesta.ok)throw new Error("HTTP "+respuesta.status);
                const resultado=await respuesta.json();
                if(!resultado.ok)throw new Error(resultado.error);
                const servidor=resultado.registros||[];
                const pendientes=localesHoy.filter(r=>r.sincronizado===false);
                const fusion=[...servidor];
                pendientes.forEach(p=>{
                    if(!fusion.some(s=>(s.fila&&p.fila&&s.fila===p.fila)||(s.id&&p.id&&s.id===p.id)))fusion.push(p);
                });
                registros=fusion;
                for(const r of servidor){
                    r.sincronizado=true;
                    if(!r.id)r.id=generarIdLocal("srv");
                    await dbPut("movimientos",r);
                }
                actualizarResumen();
                actualizarMovimientos();
                sincronizarPendientes();
                return true;
            }catch(error){
                console.warn("No se pudo actualizar inventario remoto:",error);
                return false;
            }
        };

        if(navigator.onLine){
            const remotoOK=await actualizarRemoto();
            if(!remotoOK){
                registros=localesHoy.sort((a,b)=>(a.hora||"").localeCompare(b.hora||""));
                actualizarResumen();
                actualizarMovimientos();
                if(!localesHoy.length)mostrarMensaje("❌ No se pudo cargar el inventario","error");
            }
        }else{
            registros=localesHoy.sort((a,b)=>(a.hora||"").localeCompare(b.hora||""));
            actualizarResumen();
            actualizarMovimientos();
        }
    }catch(error){
        console.error(error);
        actualizarResumen();
        actualizarMovimientos();
        if(navigator.onLine)mostrarMensaje("❌ No se pudo cargar el inventario","error");
    }
}

registrarBtn.addEventListener("click",registrarInventario);

async function registrarInventario(){
    const cliente=clienteSelect.value.trim();
    const elemento=elementoActual.trim();
    const cantidad=Number(document.getElementById("cantidad").value);
    const notas=document.getElementById("notas").value.trim();
    if(!cliente){mostrarMensaje("Selecciona el cliente.","error");return;}
    if(!elemento){elementoSeleccionado.textContent="⚠ Selecciona un elemento.";elementoSeleccionado.classList.add("error");mostrarMensaje("Selecciona el elemento.","error");return;}
    if(!cantidad||cantidad<=0){mostrarMensaje("Ingresa una cantidad válida.","error");return;}
    if(!estadoSeleccionado){mostrarMensaje("Selecciona Moño o Proceso.","error");return;}
    const boton=registrarBtn;
    let localId="";
    try{
        if(!dbOffline)await abrirDBOffline();
        localId=generarIdLocal("mov");
        const datos={id:localId,fecha:fechaTexto,cliente,elemento,cantidad,estado:estadoSeleccionado,notas,hora:new Date().toLocaleTimeString("es-CO",{hour12:false}),sincronizado:false};
        const operacion={id:generarIdLocal("op"),payload:{...datos,localId}};
        registros.push(datos);
        await dbPutMultiple([{store:"movimientos",value:datos},{store:"operaciones",value:operacion}]);
        detallePendientesInventario.push(operacion);
        pendientesInventario++;
        limpiarFormulario();
        actualizarResumen();
        actualizarMovimientos();
        renderizarEstadoConexion();
        mostrarMensaje(navigator.onLine?"✓ Guardado. Sincronizando en segundo plano...":"✓ Guardado sin conexión. Se sincronizará automáticamente al volver internet","ok");
        if(navigator.onLine){
            sincronizarPendientes();
            programarReintentoSincronizacion();
        }
    }catch(error){
        console.error("Error al registrar:",error);
        registros=registros.filter(r=>r.id!==localId);
        mostrarMensaje("❌ No se pudo guardar: "+(error.message||"error local"),"error");
    }finally{
        if(boton)boton.disabled=false;
    }
}

function limpiarFormulario(){
    elementoActual="";
    elementoBusqueda.value="";
    elementoSeleccionado.textContent="Ningún elemento seleccionado";
    elementoSeleccionado.classList.remove("error");
    limpiarElemento.style.display="none";
    document.getElementById("cantidad").value="";
    document.getElementById("notas").value="";
    botonesEstado.forEach(b=>b.classList.remove("active"));
    estadoSeleccionado="";
    listaElementos.style.display="none";
}

function actualizarResumen(){
    const agrupado={};

    registros.forEach(registro=>{
        const clave=normalizarTexto(registro.cliente)+"|"+normalizarTexto(registro.elemento);

        if(!agrupado[clave]){
            agrupado[clave]={
                cliente:registro.cliente,
                elemento:registro.elemento,
                mono:0,
                proceso:0
            };
        }

        const cantidad=Number(registro.cantidad)||0;
        const estado=normalizarTexto(registro.estado);

        if(estado==="MONO")agrupado[clave].mono+=cantidad;
        if(estado==="PROCESO")agrupado[clave].proceso+=cantidad;
    });

    const lista=Object.values(agrupado);
    const tbody=document.getElementById("tablaResumen");

    if(!tbody)return;

    tbody.innerHTML="";

    if(lista.length===0){
        tbody.innerHTML=`<tr><td colspan="5" class="empty">Aún no hay registros para este inventario.</td></tr>`;
    }else{
        lista.forEach(item=>{
            const total=item.mono+item.proceso;
            const fila=document.createElement("tr");
            fila.innerHTML=`
                <td>${escaparHTML(item.cliente)}</td>
                <td>${escaparHTML(item.elemento)}</td>
                <td>${formatear(item.mono)}</td>
                <td>${formatear(item.proceso)}</td>
                <td>${formatear(total)}</td>
            `;
            tbody.appendChild(fila);
        });
    }

    const totalMono=lista.reduce((total,item)=>total+item.mono,0);
    const totalProceso=lista.reduce((total,item)=>total+item.proceso,0);
    const totalFinal=totalMono+totalProceso;

    if(document.getElementById("totalMono"))document.getElementById("totalMono").textContent=formatear(totalMono);
    if(document.getElementById("totalProceso"))document.getElementById("totalProceso").textContent=formatear(totalProceso);
    if(document.getElementById("totalFinal"))document.getElementById("totalFinal").textContent=formatear(totalFinal);

    const clientesUnicos=new Set(registros.map(r=>normalizarTexto(r.cliente)));
    const elementosUnicos=new Set(registros.map(r=>normalizarTexto(r.elemento)));

    if(document.getElementById("totalClientes"))document.getElementById("totalClientes").textContent=clientesUnicos.size;
    if(document.getElementById("totalElementos"))document.getElementById("totalElementos").textContent=elementosUnicos.size;
    if(document.getElementById("totalUnidades"))document.getElementById("totalUnidades").textContent=formatear(totalFinal);
}

function crearSeccionMovimientos(){
    if(document.getElementById("movimientosCard"))return;

    const main=document.querySelector("main");
    const moduloInventario=document.getElementById("moduloInventario");
    if(!main || !moduloInventario)return;

    const card=document.createElement("section");
    card.id="movimientosCard";
    card.className="card";

    card.innerHTML=`
        <div class="section-header">
            <div class="section-icon">📋</div>
            <div>
                <h2>Movimientos del día</h2>
                <p>Consulta, edita o elimina un movimiento individual.</p>
            </div>
        </div>
        <div id="listaMovimientos"></div>
    `;

    // Los movimientos pertenecen exclusivamente al módulo Inventario Diario.
    // Se insertan después del panel de inventario, nunca dentro de XCC.
    const resumen=moduloInventario.querySelector(".summary-card");
    if(resumen)resumen.after(card);
    else moduloInventario.appendChild(card);

    agregarEstilosMovimientos();
}

function agregarEstilosMovimientos(){
    if(document.getElementById("estilosMovimientos"))return;

    const style=document.createElement("style");
    style.id="estilosMovimientos";

    style.textContent=`
        #listaMovimientos{display:grid;gap:8px}
        .movimiento-item{display:grid;grid-template-columns:75px 1fr 1fr 100px 90px 90px;align-items:center;gap:10px;padding:12px;background:#f7f9fb;border:1px solid #dce4eb;border-radius:10px}
        .movimiento-hora{font-size:12px;color:#74869a;font-weight:700}
        .movimiento-dato small{display:block;font-size:9px;color:#8493a2;font-weight:800;margin-bottom:3px}
        .movimiento-dato strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#173a5d;font-size:13px}
        .movimiento-cantidad{text-align:center;font-weight:900}
        .movimiento-estado{text-align:center;font-size:10px;font-weight:900;padding:7px 5px;border-radius:7px;color:white}
        .movimiento-estado.mono{background:#168548}
        .movimiento-estado.proceso{background:#145db7}
        .btn-editar-movimiento,.btn-eliminar-movimiento{border:0;border-radius:8px;padding:9px;cursor:pointer;font-weight:800}
        .btn-editar-movimiento{background:#e8f1fb;color:#145db7}
        .btn-eliminar-movimiento{background:#fbeaea;color:#c62828}
        .btn-editar-movimiento:hover{background:#145db7;color:white}
        .btn-eliminar-movimiento:hover{background:#c62828;color:white}
        .movimientos-vacio{padding:25px;text-align:center;color:#8493a2;background:#f7f9fb;border:1px dashed #ccd6df;border-radius:10px}
        @media(max-width:800px){
            .movimiento-item{
                grid-template-columns:64px minmax(0,1fr) 100px;
                grid-template-areas:
                    "hora cliente estado"
                    "hora elemento cantidad"
                    ". editar eliminar";
                gap:8px;
                min-width:0;
                width:100%;
                box-sizing:border-box;
                align-items:center;
            }
            .movimiento-hora{
                grid-area:hora;
                align-self:start;
                padding-top:2px;
            }
            .movimiento-cliente{
                grid-area:cliente;
                min-width:0;
            }
            .movimiento-elemento{
                grid-area:elemento;
                min-width:0;
            }
            .movimiento-cantidad{
                grid-area:cantidad;
                min-width:0;
                text-align:right;
                white-space:nowrap;
            }
            .movimiento-estado{
                grid-area:estado;
                min-width:0;
                width:100%;
                box-sizing:border-box;
                align-self:center;
                white-space:nowrap;
            }
            .btn-editar-movimiento{
                grid-area:editar;
                min-width:0;
                width:100%;
                box-sizing:border-box;
                white-space:nowrap;
            }
            .btn-eliminar-movimiento{
                grid-area:eliminar;
                min-width:0;
                width:100%;
                box-sizing:border-box;
                display:flex;
                align-items:center;
                justify-content:center;
                white-space:nowrap;
            }
            .movimiento-dato strong{
                white-space:normal !important;
                overflow:visible !important;
                text-overflow:clip !important;
                overflow-wrap:anywhere !important;
                word-break:normal !important;
                hyphens:none !important;
                line-height:1.22;
            }
        }
    `;

    document.head.appendChild(style);
}

function actualizarMovimientos(){
    crearSeccionMovimientos();

    const contenedor=document.getElementById("listaMovimientos");
    if(!contenedor)return;

    contenedor.innerHTML="";

    if(registros.length===0){
        contenedor.innerHTML=`<div class="movimientos-vacio">No hay movimientos registrados hoy.</div>`;
        return;
    }

    [...registros].reverse().forEach(registro=>{
        const item=document.createElement("div");
        item.className="movimiento-item";

        const estado=normalizarTexto(registro.estado);
        const clase=estado==="MONO"?"mono":"proceso";

        item.innerHTML=`
            <div class="movimiento-hora">${escaparHTML(registro.hora||"--:--")}</div>
            <div class="movimiento-dato movimiento-cliente">
                <small>CLIENTE</small>
                <strong>${escaparHTML(registro.cliente)}</strong>
            </div>
            <div class="movimiento-dato movimiento-elemento">
                <small>ELEMENTO</small>
                <strong>${escaparHTML(registro.elemento)}</strong>
            </div>
            <div class="movimiento-cantidad">${formatear(registro.cantidad)}</div>
            <div class="movimiento-estado ${clase}">${escaparHTML(registro.estado)}</div>
            <button class="btn-editar-movimiento" type="button">✏️ Editar</button>
            <button class="btn-eliminar-movimiento" type="button">🗑️</button>
        `;

        item.querySelector(".btn-editar-movimiento").addEventListener("click",()=>editarMovimiento(registro));
        item.querySelector(".btn-eliminar-movimiento").addEventListener("click",()=>eliminarMovimiento(registro));

        contenedor.appendChild(item);
    });
}

async function editarMovimiento(registro){
    const nuevaCantidad=prompt("Cantidad del movimiento:",registro.cantidad);if(nuevaCantidad===null)return;
    const cantidad=Number(String(nuevaCantidad).replace(/\./g,"").replace(",","."));if(!cantidad||cantidad<=0){mostrarMensaje("❌ La cantidad no es válida.","error");return;}
    const nuevoEstado=prompt("Estado: escribe MOÑO o PROCESO",registro.estado);if(nuevoEstado===null)return;
    const estado=normalizarTexto(nuevoEstado);if(estado!=="MONO"&&estado!=="PROCESO"){mostrarMensaje("❌ El estado debe ser MOÑO o PROCESO.","error");return;}
    const nuevasNotas=prompt("Notas:",registro.notas||"");if(nuevasNotas===null)return;
    if(!confirm("¿Guardar los cambios?"))return;
    if(!dbOffline)await abrirDBOffline();
    registro.cantidad=cantidad;registro.estado=estado==="MONO"?"MOÑO":"PROCESO";registro.notas=nuevasNotas;registro.sincronizado=false;
    await dbPut("movimientos",registro);
    await dbPut("operaciones",{id:generarIdLocal("op"),payload:{accion:"editarMovimiento",fila:Number(registro.fila)||null,localId:registro.id,cliente:registro.cliente,elemento:registro.elemento,cantidad,estado:registro.estado,notas:nuevasNotas}});
    actualizarResumen();actualizarMovimientos();actualizarEstadoConexion();mostrarMensaje(navigator.onLine?"✓ Cambio guardado. Sincronizando...":"✓ Cambio guardado sin conexión","ok");
    if(navigator.onLine)sincronizarPendientes();
}

async function eliminarMovimiento(registro){
    if(!confirm("¿Seguro que deseas eliminar este movimiento?"))return;
    if(!dbOffline)await abrirDBOffline();
    registros=registros.filter(r=>r.id!==registro.id);
    await dbDelete("movimientos",registro.id);
    await dbPut("operaciones",{id:generarIdLocal("op"),payload:{accion:"eliminarMovimiento",fila:Number(registro.fila)||null,localId:registro.id}});
    actualizarResumen();actualizarMovimientos();actualizarEstadoConexion();mostrarMensaje(navigator.onLine?"✓ Eliminado. Sincronizando...":"✓ Eliminado sin conexión","ok");
    if(navigator.onLine)sincronizarPendientes();
}

// =====================================================
// REPORTE
// =====================================================

const reporteBtn=document.getElementById("reporteBtn");

if(reporteBtn){
    reporteBtn.addEventListener("click",generarReporte);
}

async function generarReporte(){
    if(registros.length===0){
        mostrarMensaje("No hay registros para generar el reporte.","error");
        return;
    }

    const momento=new Date();

    const fechaReporte=momento.toLocaleDateString(
        "es-CO",
        {
            day:"2-digit",
            month:"2-digit",
            year:"numeric"
        }
    );

    const horaReporte=momento.toLocaleTimeString(
        "es-CO",
        {
            hour:"2-digit",
            minute:"2-digit",
            second:"2-digit",
            hour12:false
        }
    );

    if(!logoServitodo.complete){
        await new Promise(resolve=>{
            logoServitodo.onload=resolve;
            logoServitodo.onerror=resolve;
        });
    }

    const grupos=prepararDatosReporte();
    const canvas=document.createElement("canvas");
    const ancho=1200;
    const alto=calcularAltoReporte(grupos);

    canvas.width=ancho;
    canvas.height=alto;

    const ctx=canvas.getContext("2d");

    dibujarReporte(
        ctx,
        ancho,
        alto,
        grupos,
        fechaReporte,
        horaReporte
    );

    const imagen=document.getElementById("imagenReporte");

    if(imagen){
        imagen.src=canvas.toDataURL("image/png");
    }

    const modal=document.getElementById("modalReporte");

    if(modal){
        modal.classList.add("visible");
    }
}

function prepararDatosReporte(){
    const grupos={};

    registros.forEach(registro=>{
        const cliente=registro.cliente;

        if(!grupos[cliente])grupos[cliente]=[];

        let elemento=grupos[cliente].find(
            item=>normalizarTexto(item.elemento)===normalizarTexto(registro.elemento)
        );

        if(!elemento){
            elemento={
                elemento:registro.elemento,
                mono:0,
                proceso:0
            };

            grupos[cliente].push(elemento);
        }

        const cantidad=Number(registro.cantidad)||0;
        const estado=normalizarTexto(registro.estado);

        if(estado==="MONO")elemento.mono+=cantidad;
        if(estado==="PROCESO")elemento.proceso+=cantidad;
    });

    return grupos;
}

function calcularAltoReporte(grupos){
    let filas=0;

    Object.values(grupos).forEach(lista=>{
        filas+=lista.length;
    });

    const clientesReporte=Object.keys(grupos).length;

    return 170+170+(filas*58)+(clientesReporte*14)+150;
}

function textoAjustado(ctx,texto,x,y,maxWidth){
    let valor=String(texto||"");

    if(ctx.measureText(valor).width<=maxWidth){
        ctx.fillText(valor,x,y);
        return;
    }

    while(valor.length>0&&ctx.measureText(valor+"...").width>maxWidth){
        valor=valor.slice(0,-1);
    }

    ctx.fillText(valor+"...",x,y);
}

function dibujarReporte(
    ctx,
    ancho,
    alto,
    grupos,
    fechaReporte,
    horaReporte
){
    const azul="#102b4e";
    const azulTexto="#11253f";
    const verde="#168b3b";
    const azulProceso="#1957ae";
    const morado="#7140a8";
    const borde="#c8d0d8";
    const grisClaro="#f5f6f8";
    const blanco="#ffffff";
    const grisTexto="#6f7d8c";

    ctx.fillStyle=blanco;
    ctx.fillRect(0,0,ancho,alto);

    // =================================================
    // ENCABEZADO
    // =================================================

    const margen=14;
    const headerX=margen;
    const headerY=14;
    const headerW=ancho-(margen*2);
    const headerH=112;

    ctx.fillStyle=azul;
    ctx.fillRect(
        headerX,
        headerY,
        headerW,
        headerH
    );

    const bloqueFecha=330;
    const bloqueLogo=330;

    ctx.strokeStyle="rgba(255,255,255,.5)";
    ctx.lineWidth=2;

    ctx.beginPath();
    ctx.moveTo(
        headerX+bloqueFecha,
        headerY
    );
    ctx.lineTo(
        headerX+bloqueFecha,
        headerY+headerH
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(
        headerX+headerW-bloqueLogo,
        headerY
    );
    ctx.lineTo(
        headerX+headerW-bloqueLogo,
        headerY+headerH
    );
    ctx.stroke();

    // ICONO CALENDARIO

    const calX=50;
    const calY=43;

    ctx.strokeStyle="#c7d0db";
    ctx.lineWidth=4;

    ctx.strokeRect(
        calX,
        calY,
        34,
        31
    );

    ctx.beginPath();
    ctx.moveTo(
        calX+7,
        calY-7
    );
    ctx.lineTo(
        calX+7,
        calY+4
    );

    ctx.moveTo(
        calX+27,
        calY-7
    );
    ctx.lineTo(
        calX+27,
        calY+4
    );

    ctx.stroke();

    ctx.lineWidth=2;

    ctx.beginPath();

    for(let i=0;i<3;i++){
        ctx.moveTo(
            calX+8,
            calY+11+i*7
        );

        ctx.lineTo(
            calX+29,
            calY+11+i*7
        );
    }

    ctx.stroke();

    ctx.fillStyle=blanco;
    ctx.textAlign="left";
    ctx.font="bold 34px Arial";

    ctx.fillText(
        fechaReporte.replace(/\//g,"-"),
        105,
        65
    );

    ctx.font="bold 18px Arial";

    ctx.fillText(
        "Fecha del inventario",
        106,
        91
    );

    // TITULO CENTRAL

    const centroX=
        headerX+
        bloqueFecha+
        26;

    ctx.fillStyle=blanco;
    ctx.font="bold 22px Arial";

    ctx.fillText(
        "INVENTARIO DIARIO",
        centroX,
        48
    );

    ctx.font="bold 58px Arial";

    ctx.fillText(
        "SERVITODO",
        centroX,
        99
    );

    // =================================================
    // LOGO REAL SERVITODO
    // =================================================

    if(
        logoServitodo.complete &&
        logoServitodo.naturalWidth>0
    ){

        const areaX=
            headerX+
            headerW-
            bloqueLogo;

        const areaY=headerY;

        const areaW=bloqueLogo;
        const areaH=headerH;

        const maxW=205;
        const maxH=96;

        let logoW=logoServitodo.naturalWidth;
        let logoH=logoServitodo.naturalHeight;

        const escala=
            Math.min(
                maxW/logoW,
                maxH/logoH
            );

        logoW*=escala;
        logoH*=escala;

        const logoX=
            areaX+
            (areaW-logoW)/2;

        const logoY=
            areaY+
            (areaH-logoH)/2;

        ctx.drawImage(
            logoServitodo,
            logoX,
            logoY,
            logoW,
            logoH
        );

    }

    // =================================================
    // TABLA
    // =================================================

    const tablaX=14;
    const tablaY=146;
    const tablaW=ancho-(tablaX*2);

    const colCliente=310;
    const colElemento=195;
    const colMono=200;
    const colProceso=200;
    const colTotal=267;

    const totalColumnas=
        colCliente+
        colElemento+
        colMono+
        colProceso+
        colTotal;

    const escala=tablaW/totalColumnas;

    const wCliente=colCliente*escala;
    const wElemento=colElemento*escala;
    const wMono=colMono*escala;
    const wProceso=colProceso*escala;
    const wTotal=colTotal*escala;

    const xCliente=tablaX;
    const xElemento=xCliente+wCliente;
    const xMono=xElemento+wElemento;
    const xProceso=xMono+wMono;
    const xTotal=xProceso+wProceso;

    const fila1=38;
    const fila2=38;

    // =================================================
    // ENCABEZADO TABLA
    // =================================================

    ctx.fillStyle=grisClaro;

    ctx.fillRect(
        xCliente,
        tablaY,
        wCliente,
        fila1+fila2
    );

    ctx.fillRect(
        xElemento,
        tablaY,
        wElemento,
        fila1+fila2
    );

    ctx.fillRect(
        xMono,
        tablaY,
        wMono+wProceso+wTotal,
        fila1
    );

    ctx.strokeStyle=borde;
    ctx.lineWidth=1;

    ctx.strokeRect(
        xCliente,
        tablaY,
        wCliente,
        fila1+fila2
    );

    ctx.strokeRect(
        xElemento,
        tablaY,
        wElemento,
        fila1+fila2
    );

    ctx.strokeRect(
        xMono,
        tablaY,
        wMono+wProceso+wTotal,
        fila1
    );

    ctx.fillStyle=azulTexto;
    ctx.font="bold 22px Arial";
    ctx.textAlign="center";

    ctx.fillText(
        "ESTADO",
        xMono+(wMono+wProceso+wTotal)/2,
        tablaY+26
    );

    ctx.fillText(
        "CLIENTE",
        xCliente+wCliente/2,
        tablaY+53
    );

    ctx.fillText(
        "ELEMENTO",
        xElemento+wElemento/2,
        tablaY+53
    );

    ctx.fillStyle=verde;

    ctx.fillRect(
        xMono,
        tablaY+fila1,
        wMono,
        fila2
    );

    ctx.fillStyle=azulProceso;

    ctx.fillRect(
        xProceso,
        tablaY+fila1,
        wProceso,
        fila2
    );

    ctx.fillStyle=morado;

    ctx.fillRect(
        xTotal,
        tablaY+fila1,
        wTotal,
        fila2
    );

    ctx.fillStyle=blanco;
    ctx.font="bold 20px Arial";

    ctx.fillText(
        "Moño",
        xMono+wMono/2,
        tablaY+fila1+25
    );

    ctx.fillText(
        "Proceso",
        xProceso+wProceso/2,
        tablaY+fila1+25
    );

    ctx.fillText(
        "Suma total",
        xTotal+wTotal/2,
        tablaY+fila1+25
    );

    let y=
        tablaY+
        fila1+
        fila2;

    // =================================================
    // DATOS
    // =================================================

    Object.entries(grupos).forEach(
        ([cliente,lista])=>{

            const alturaCliente=
                lista.length*58;

            const inicioCliente=y;

            lista.forEach(
                (item,indice)=>{

                    const anchoFila=
                        tablaW;

                    ctx.fillStyle=
                        indice%2===0
                            ? blanco
                            : "#fafbfc";

                    ctx.fillRect(
                        tablaX,
                        y,
                        anchoFila,
                        58
                    );

                    ctx.strokeStyle=borde;
                    ctx.lineWidth=1;

                    ctx.beginPath();
                    ctx.moveTo(
                        tablaX,
                        y
                    );
                    ctx.lineTo(
                        tablaX+tablaW,
                        y
                    );
                    ctx.stroke();

                    // ELEMENTO

                    ctx.fillStyle=azulTexto;
                    ctx.font="bold 19px Arial";
                    ctx.textAlign="center";

                    ctx.fillText(
                        item.elemento,
                        xElemento+wElemento/2,
                        y+36
                    );

                    // MOÑO

                    ctx.fillStyle=
                        item.mono>0
                            ? verde
                            : grisTexto;

                    ctx.fillText(
                        item.mono>0
                            ? formatear(item.mono)
                            : "-",
                        xMono+wMono/2,
                        y+36
                    );

                    // PROCESO

                    ctx.fillStyle=
                        item.proceso>0
                            ? azulProceso
                            : grisTexto;

                    ctx.fillText(
                        item.proceso>0
                            ? formatear(item.proceso)
                            : "-",
                        xProceso+wProceso/2,
                        y+36
                    );

                    // TOTAL

                    ctx.fillStyle=morado;

                    ctx.fillText(
                        formatear(
                            item.mono+
                            item.proceso
                        ),
                        xTotal+wTotal/2,
                        y+36
                    );

                    y+=58;
                }
            );

            // CLIENTE UNIFICADO

            ctx.fillStyle=blanco;

            ctx.fillRect(
                xCliente,
                inicioCliente,
                wCliente,
                alturaCliente
            );

            ctx.strokeStyle=borde;

            ctx.strokeRect(
                xCliente,
                inicioCliente,
                wCliente,
                alturaCliente
            );

            ctx.fillStyle=azulTexto;
            ctx.font="bold 21px Arial";
            ctx.textAlign="left";

            textoAjustado(
                ctx,
                cliente,
                xCliente+22,
                inicioCliente+
                alturaCliente/2+
                7,
                wCliente-40
            );

            // LINEAS VERTICALES

            ctx.strokeStyle=borde;

            [xElemento,xMono,xProceso,xTotal].forEach(pos=>{
                ctx.beginPath();
                ctx.moveTo(
                    pos,
                    inicioCliente
                );
                ctx.lineTo(
                    pos,
                    y
                );
                ctx.stroke();
            });

            y+=14;
        }
    );

    // =================================================
    // BORDE FINAL
    // =================================================

    ctx.strokeStyle=borde;
    ctx.lineWidth=2;

    ctx.strokeRect(
        tablaX,
        tablaY,
        tablaW,
        y-tablaY-14
    );

    // =================================================
    // PIE DEL REPORTE
    // =================================================

    const footerY=y+10;
    const footerH=116;

    const f1=tablaX;
    const f2=tablaX+tablaW/3;
    const f3=tablaX+(tablaW/3)*2;

    ctx.fillStyle=blanco;

    ctx.fillRect(
        f1,
        footerY,
        tablaW,
        footerH
    );

    ctx.strokeStyle=borde;
    ctx.lineWidth=1;

    ctx.strokeRect(
        f1,
        footerY,
        tablaW,
        footerH
    );

    ctx.beginPath();

    ctx.moveTo(
        f2,
        footerY
    );

    ctx.lineTo(
        f2,
        footerY+footerH
    );

    ctx.moveTo(
        f3,
        footerY
    );

    ctx.lineTo(
        f3,
        footerY+footerH
    );

    ctx.stroke();

    // RELOJ

    ctx.strokeStyle="#738292";
    ctx.lineWidth=3;

    ctx.beginPath();

    ctx.arc(
        f1+40,
        footerY+44,
        18,
        0,
        Math.PI*2
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(
        f1+40,
        footerY+44
    );

    ctx.lineTo(
        f1+40,
        footerY+31
    );

    ctx.moveTo(
        f1+40,
        footerY+44
    );

    ctx.lineTo(
        f1+49,
        footerY+49
    );

    ctx.stroke();

    ctx.fillStyle=grisTexto;
    ctx.font="15px Arial";
    ctx.textAlign="left";

    ctx.fillText(
        "Generado el:",
        f1+73,
        footerY+32
    );

    ctx.fillStyle=azulTexto;
    ctx.font="bold 18px Arial";

    ctx.fillText(
        fechaReporte+" "+horaReporte,
        f1+73,
        footerY+62
    );

    // PERSONA

    const personaX=f2+42;

    ctx.strokeStyle="#738292";
    ctx.lineWidth=3;

    ctx.beginPath();

    ctx.arc(
        personaX,
        footerY+34,
        8,
        0,
        Math.PI*2
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.arc(
        personaX,
        footerY+68,
        17,
        Math.PI,
        0
    );

    ctx.stroke();

    ctx.fillStyle=grisTexto;
    ctx.font="15px Arial";

    ctx.fillText(
        "Elaborado por:",
        f2+73,
        footerY+32
    );

    ctx.fillStyle=azulTexto;
    ctx.font="bold 18px Arial";

    ctx.fillText(
        "Duvan C",
        f2+73,
        footerY+62
    );

    // DOCUMENTO

    const docX=f3+40;

    ctx.strokeStyle="#738292";
    ctx.lineWidth=3;

    ctx.strokeRect(
        docX-13,
        footerY+24,
        25,
        34
    );

    ctx.beginPath();

    ctx.moveTo(
        docX-6,
        footerY+34
    );

    ctx.lineTo(
        docX+6,
        footerY+34
    );

    ctx.moveTo(
        docX-6,
        footerY+41
    );

    ctx.lineTo(
        docX+6,
        footerY+41
    );

    ctx.moveTo(
        docX-6,
        footerY+48
    );

    ctx.lineTo(
        docX+6,
        footerY+48
    );

    ctx.stroke();

    ctx.fillStyle=grisTexto;
    ctx.font="15px Arial";

    ctx.fillText(
        "Inventario diario Servitodo",
        f3+73,
        footerY+32
    );

    ctx.fillStyle=azulTexto;
    ctx.font="bold 18px Arial";

    ctx.fillText(
        "Página 1 de 1",
        f3+73,
        footerY+62
    );
}

// =====================================================
// MODAL
// =====================================================

const cerrarReporte=document.getElementById("cerrarReporte");

if(cerrarReporte){
    cerrarReporte.addEventListener("click",()=>{
        document.getElementById("modalReporte").classList.remove("visible");
    });
}

const modalReporte=document.getElementById("modalReporte");

if(modalReporte){
    modalReporte.addEventListener("click",event=>{
        if(event.target.id==="modalReporte"){
            modalReporte.classList.remove("visible");
        }
    });
}

const descargarReporte=document.getElementById("descargarReporte");

if(descargarReporte){
    descargarReporte.addEventListener("click",()=>{
        const imagen=document.getElementById("imagenReporte");

        if(!imagen||!imagen.src)return;

        const enlace=document.createElement("a");

        enlace.href=imagen.src;

        enlace.download=
            "Inventario_Servitodo_"+
            fechaTexto.replace(/\//g,"-")+
            ".png";

        enlace.click();
    });
}

// =====================================================
// INICIAR
// =====================================================

async function iniciarAplicacion(){
    actualizarEstadoConexion();
    try{await abrirDBOffline();}catch(error){console.warn("Almacenamiento local no disponible:",error);}
    try{await cargarCatalogos();}catch(error){console.error("Error cargando catálogos:",error);}
    try{await cargarInventario();}catch(error){console.error("Error cargando inventario:",error);}
    try{if(document.getElementById("tablaXCC"))await cargarDatosXCC();}catch(error){console.warn("Error cargando XCC:",error);}
    actualizarEstadoConexion();
    if(navigator.onLine){try{await sincronizarPendientes();}catch(error){console.warn("Error sincronizando pendientes:",error);}}
}

// =====================================================
// MODULO ESTIBAS XCC
// =====================================================
let datosXCC=[];
let reporteXCCData="";
function fechaActualXCC(){return new Date().toLocaleDateString("es-CO",{day:"2-digit",month:"2-digit",year:"numeric"});}
function mensajeXCC(texto,tipo="ok"){const e=document.getElementById("mensajeXCC");if(!e)return;e.textContent=texto;e.style.color=tipo==="ok"?"#168548":"#c62828";clearTimeout(window.mx);window.mx=setTimeout(()=>e.textContent="",3500);}
function cambiarModuloXCC(activo){const inv=document.getElementById("moduloInventario"),mod=document.getElementById("moduloXCC"),b1=document.getElementById("btnInventario"),b2=document.getElementById("btnXCC");if(!inv||!mod)return;if(activo){inv.style.display="none";mod.style.display="block";b1?.classList.remove("activo");b2?.classList.add("activo");cargarDatosXCC();}else{inv.style.display="contents";mod.style.display="none";b1?.classList.add("activo");b2?.classList.remove("activo");}}
function calcularFilaXCC(i){const f=datosXCC[i];if(!f)return;const dias=f.estibasDia>0?f.inventarioActual/f.estibasDia:0, faltante=f.objetivo-f.inventarioActual;const d=document.querySelector(`[data-xcc-dias="${i}"]`),x=document.querySelector(`[data-xcc-faltante="${i}"]`);if(d)d.textContent=dias.toFixed(1);if(x){x.textContent=formatear(faltante);x.className="xcc-faltante "+(faltante>0?"faltante":faltante<0?"excedente":"igual");}}
function renderizarXCC(){const tb=document.getElementById("tablaXCC");if(!tb)return;if(!datosXCC.length){tb.innerHTML=`<tr><td colspan="6" class="empty">No hay clientes configurados en ESTIBAS XCC.</td></tr>`;return;}tb.innerHTML=datosXCC.map((f,i)=>{const dias=f.estibasDia>0?f.inventarioActual/f.estibasDia:0,faltante=f.objetivo-f.inventarioActual;return`<tr><td><strong>${escaparHTML(f.cliente)}</strong></td><td>${formatear(f.estibasDia)}</td><td><input class="xcc-input" type="number" min="0" step="1" value="${f.inventarioActual}" data-xcc-index="${i}" data-xcc-campo="inventarioActual"></td><td class="xcc-dias" data-xcc-dias="${i}">${dias.toFixed(1)}</td><td><input class="xcc-input" type="number" min="0" step="1" value="${f.objetivo}" data-xcc-index="${i}" data-xcc-campo="objetivo"></td><td class="xcc-faltante ${faltante>0?"faltante":faltante<0?"excedente":"igual"}" data-xcc-faltante="${i}">${formatear(faltante)}</td></tr>`}).join("");document.querySelectorAll(".xcc-input").forEach(e=>e.addEventListener("input",()=>{const i=Number(e.dataset.xccIndex);datosXCC[i][e.dataset.xccCampo]=Number(e.value)||0;calcularFilaXCC(i);}));}
async function cargarDatosXCC(){
    const tb=document.getElementById("tablaXCC");
    if(!tb)return;
    if(document.getElementById("fechaXCC"))document.getElementById("fechaXCC").textContent=fechaActualXCC();
    tb.innerHTML=`<tr><td colspan="6" class="empty">Cargando inventario XCC...</td></tr>`;
    let resultado=null;
    try{
        const borradorLocal=localStorage.getItem("servitodo_xcc_ultimaEdicion");
        if(navigator.onLine){
            const r=await fetch(API_URL+"?accion=obtenerXCC",{cache:"no-store"});
            resultado=await r.json();
            if(!resultado.ok)throw new Error(resultado.error||"No se pudo obtener XCC");
            localStorage.setItem("servitodo_xcc_cache",JSON.stringify(resultado));
        }else{
            const cache=localStorage.getItem("servitodo_xcc_cache");
            if(cache)resultado=JSON.parse(cache);
            else if(borradorLocal)resultado={ok:true,configuracion:JSON.parse(borradorLocal).map(x=>({cliente:x.cliente,estibasDia:x.estibasDia,ultimo:{inventarioActual:x.inventarioActual,objetivo:x.objetivo}}))};
        }
        if(!resultado||!resultado.ok)throw new Error("No hay información XCC disponible");
        // XCC debe mostrar un solo registro por cliente. Si la fuente devuelve
        // duplicados (incluso con IDs repetidos), conservamos el último registro.
        const unicosXCC=new Map();
        (resultado.configuracion||[]).forEach(i=>{
            const u=i.ultimo||{};
            const fila={cliente:i.cliente,estibasDia:Number(i.estibasDia)||0,inventarioActual:Number(u.inventarioActual)||0,objetivo:Number(u.objetivo)||0,ultimoId:u.id||"",ultimaFecha:u.fecha||""};
            const clave=normalizarTexto(fila.cliente);
            if(clave)unicosXCC.set(clave,fila);
        });
        datosXCC=Array.from(unicosXCC.values());
        if(borradorLocal){
            try{
                const borrador=JSON.parse(borradorLocal);
                if(Array.isArray(borrador)&&borrador.length){
                    datosXCC=datosXCC.map(base=>{const b=borrador.find(x=>normalizarTexto(x.cliente)===normalizarTexto(base.cliente));return b?{...base,inventarioActual:Number(b.inventarioActual)||0,objetivo:Number(b.objetivo)||0}:base;});
                }
            }catch(e){}
        }
        renderizarXCC();
    }catch(error){
        console.error(error);
        const borrador=localStorage.getItem("servitodo_xcc_ultimaEdicion");
        const cache=localStorage.getItem("servitodo_xcc_cache");
        if(borrador){
            try{
                const b=JSON.parse(borrador);
                if(Array.isArray(b)&&b.length){datosXCC=b;renderizarXCC();mensajeXCC("⚠ Sin conexión: mostrando la última edición local","error");return;}
            }catch(e){}
        }
        if(cache){
            try{
                const r=JSON.parse(cache);
                const unicosXCC=new Map();
                (r.configuracion||[]).forEach(i=>{const u=i.ultimo||{};const fila={cliente:i.cliente,estibasDia:Number(i.estibasDia)||0,inventarioActual:Number(u.inventarioActual)||0,objetivo:Number(u.objetivo)||0,ultimoId:u.id||"",ultimaFecha:u.fecha||""};const clave=normalizarTexto(fila.cliente);if(clave)unicosXCC.set(clave,fila);});
                datosXCC=Array.from(unicosXCC.values());
                renderizarXCC();mensajeXCC("⚠ Sin conexión: mostrando el último inventario disponible","error");return;
            }catch(e){}
        }
        tb.innerHTML=`<tr><td colspan="6" class="empty">No se pudo cargar el inventario XCC.</td></tr>`;
        mensajeXCC("❌ "+error.message,"error");
    }
}
function prepararEventosXCC(){document.getElementById("btnInventario")?.addEventListener("click",()=>cambiarModuloXCC(false));document.getElementById("btnXCC")?.addEventListener("click",()=>cambiarModuloXCC(true));document.getElementById("guardarXCCBtn")?.addEventListener("click",guardarXCCLocal);document.getElementById("reporteXCCBtn")?.addEventListener("click",generarReporteXCC);document.getElementById("cerrarReporteXCC")?.addEventListener("click",()=>document.getElementById("modalReporteXCC")?.classList.remove("visible"));document.getElementById("descargarReporteXCC")?.addEventListener("click",descargarReporteXCC);}
async function guardarXCCLocal(){
    if(!datosXCC.length)return mensajeXCC("No hay datos XCC para guardar","error");
    if(!dbOffline)await abrirDBOffline();
    const ahora=Date.now(),fecha=fechaActualXCC();
    const borrador=datosXCC.map(f=>({cliente:f.cliente,estibasDia:Number(f.estibasDia)||0,inventarioActual:Number(f.inventarioActual)||0,objetivo:Number(f.objetivo)||0,ultimoId:f.ultimoId||"",ultimaFecha:f.ultimaFecha||""}));
    localStorage.setItem("servitodo_xcc_ultimaEdicion",JSON.stringify(borrador));
    for(const f of datosXCC){
        const r={id:generarIdLocal("xcc"),fecha,cliente:f.cliente,estibasDia:Number(f.estibasDia)||0,inventarioActual:Number(f.inventarioActual)||0,objetivo:Number(f.objetivo)||0,diasCubiertos:f.estibasDia>0?(Number(f.inventarioActual)||0)/f.estibasDia:0,faltante:(Number(f.objetivo)||0)-(Number(f.inventarioActual)||0),creado:ahora,sincronizado:false};
        const operacionXCC={id:generarIdLocal("opxcc"),payload:{...r,accion:"registrarInventarioXCC"}};
        await dbPutMultiple([{store:"xcc",value:r},{store:"operacionesXCC",value:operacionXCC}]);
        detallePendientesXCC.push(operacionXCC);
        pendientesXCC++;
    }
    renderizarXCC();
    actualizarEstadoConexion();
    mensajeXCC(navigator.onLine?"✓ Guardado local. Sincronizando...":"✓ Guardado sin conexión. Quedó pendiente de sincronizar.","ok");
    if(navigator.onLine){sincronizarXCCPendientes();programarReintentoSincronizacion();}
    renderizarEstadoConexion();
}
async function sincronizarXCCPendientes(){
    if(!navigator.onLine||!dbOffline)return;
    try{
        const ops=await dbAll("operacionesXCC");
        detallePendientesXCC=ops;
        pendientesXCC=ops.length;
        renderizarEstadoConexion();
        for(const op of ops){
            try{
                const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(op.payload),keepalive:true});
                const d=await r.json();
                if(!d.ok)throw new Error(d.error||"Error XCC");
                const registro=op.payload;
                registro.sincronizado=true;
                if(d.fila)registro.fila=d.fila;
                await dbPut("xcc",registro);
                await dbDelete("operacionesXCC",op.id);
                detallePendientesXCC=detallePendientesXCC.filter(x=>x.id!==op.id);
                pendientesXCC=detallePendientesXCC.length;
                renderizarEstadoConexion();
            }catch(e){
                console.warn("XCC pendiente",e);
                break;
            }
        }
        if(pendientesXCC===0)localStorage.removeItem("servitodo_xcc_ultimaEdicion");
    }finally{
        renderizarEstadoConexion();
        programarReintentoSincronizacion();
    }
}
async function generarReporteXCC(){
    const momento=new Date();

    const fechaReporte=momento.toLocaleDateString(
        "es-CO",
        {
            day:"2-digit",
            month:"2-digit",
            year:"numeric"
        }
    );

    const horaReporte=momento.toLocaleTimeString(
        "es-CO",
        {
            hour:"2-digit",
            minute:"2-digit",
            second:"2-digit",
            hour12:false
        }
    );

    if(!logoServitodo.complete){
        await new Promise(resolve=>{
            logoServitodo.onload=resolve;
            logoServitodo.onerror=resolve;
        });
    }

    const ancho=1200;
    const margen=14;
    const tablaX=margen;
    const tablaW=ancho-(margen*2);
    const filas=datosXCC.length;
    const headerH=112;
    const tablaY=146;
    const headerTablaH=62;
    const filaH=58;
    const espacioAntesFooter=10;
    const footerH=116;
    const alto=tablaY+headerTablaH+(Math.max(filas,1)*filaH)+espacioAntesFooter+footerH+10;

    const canvas=document.createElement("canvas");
    canvas.width=ancho;
    canvas.height=alto;

    const c=canvas.getContext("2d");

    const azul="#102b4e";
    const azulTexto="#11253f";
    const borde="#c8d0d8";
    const grisClaro="#f5f6f8";
    const blanco="#ffffff";
    const grisTexto="#6f7d8c";

    // FONDO
    c.fillStyle=blanco;
    c.fillRect(0,0,ancho,alto);

    // =================================================
    // ENCABEZADO — MISMO DISEÑO DEL INVENTARIO DIARIO
    // =================================================

    const headerX=margen;
    const headerY=14;
    const headerW=ancho-(margen*2);
    const bloqueFecha=330;
    const bloqueLogo=330;

    c.fillStyle=azul;
    c.fillRect(headerX,headerY,headerW,headerH);

    c.strokeStyle="rgba(255,255,255,.5)";
    c.lineWidth=2;

    c.beginPath();
    c.moveTo(headerX+bloqueFecha,headerY);
    c.lineTo(headerX+bloqueFecha,headerY+headerH);
    c.stroke();

    c.beginPath();
    c.moveTo(headerX+headerW-bloqueLogo,headerY);
    c.lineTo(headerX+headerW-bloqueLogo,headerY+headerH);
    c.stroke();

    // ICONO CALENDARIO
    const calX=50;
    const calY=43;

    c.strokeStyle="#c7d0db";
    c.lineWidth=4;
    c.strokeRect(calX,calY,34,31);

    c.beginPath();
    c.moveTo(calX+7,calY-7);
    c.lineTo(calX+7,calY+4);
    c.moveTo(calX+27,calY-7);
    c.lineTo(calX+27,calY+4);
    c.stroke();

    c.lineWidth=2;
    c.beginPath();
    for(let i=0;i<3;i++){
        c.moveTo(calX+8,calY+11+i*7);
        c.lineTo(calX+29,calY+11+i*7);
    }
    c.stroke();

    c.fillStyle=blanco;
    c.textAlign="left";
    c.font="bold 34px Arial";
    c.fillText(fechaReporte.replace(/\//g,"-"),105,65);

    c.font="bold 18px Arial";
    c.fillText("Fecha del inventario",106,91);

    // TITULO CENTRAL — IGUAL
    const centroX=headerX+bloqueFecha+26;
    c.fillStyle=blanco;
    c.font="bold 22px Arial";
    c.fillText("INVENTARIO DIARIO",centroX,48);

    c.font="bold 58px Arial";
    c.fillText("SERVITODO",centroX,99);

    // LOGO — IGUAL
    if(logoServitodo.complete&&logoServitodo.naturalWidth>0){
        const areaX=headerX+headerW-bloqueLogo;
        const areaY=headerY;
        const areaW=bloqueLogo;
        const areaH=headerH;
        const maxW=205;
        const maxH=96;

        let logoW=logoServitodo.naturalWidth;
        let logoH=logoServitodo.naturalHeight;
        const escala=Math.min(maxW/logoW,maxH/logoH);
        logoW*=escala;
        logoH*=escala;

        const logoX=areaX+(areaW-logoW)/2;
        const logoY=areaY+(areaH-logoH)/2;

        c.drawImage(logoServitodo,logoX,logoY,logoW,logoH);
    }

    // =================================================
    // TABLA XCC — MISMA PLANTILLA VISUAL
    // =================================================

    const cols=[
        {titulo:"CLIENTE",w:330},
        {titulo:"ESTIBAS/DÍA",w:180},
        {titulo:"INVENTARIO ACTUAL",w:220},
        {titulo:"DÍAS CUBIERTOS",w:190},
        {titulo:"OBJETIVO",w:160},
        {titulo:"FALTANTE",w:160}
    ];

    const totalCols=cols.reduce((a,b)=>a+b.w,0);
    const escala=tablaW/totalCols;
    const x=[];
    let acumulado=tablaX;
    cols.forEach(col=>{
        x.push(acumulado);
        acumulado+=col.w*escala;
    });

    c.fillStyle=azul;
    c.fillRect(tablaX,tablaY,tablaW,62);

    c.strokeStyle=borde;
    c.lineWidth=1;
    c.strokeRect(tablaX,tablaY,tablaW,62);

    c.fillStyle=blanco;
    c.font="bold 18px Arial";
    c.textAlign="center";

    cols.forEach((col,i)=>{
        const w=col.w*escala;
        const cx=x[i]+w/2;
        const texto=col.titulo;
        if(texto.length>15){
            const partes=texto.split(" ");
            let mitad=Math.ceil(partes.length/2);
            c.fillText(partes.slice(0,mitad).join(" "),cx,tablaY+25);
            c.fillText(partes.slice(mitad).join(" "),cx,tablaY+47);
        }else{
            c.fillText(texto,cx,tablaY+37);
        }

        if(i>0){
            c.strokeStyle="rgba(255,255,255,.45)";
            c.beginPath();
            c.moveTo(x[i],tablaY);
            c.lineTo(x[i],tablaY+62);
            c.stroke();
        }
    });

    let y=tablaY+62;

    if(!datosXCC.length){
        c.fillStyle=grisClaro;
        c.fillRect(tablaX,y,tablaW,filaH);
        c.strokeStyle=borde;
        c.strokeRect(tablaX,y,tablaW,filaH);
        c.fillStyle=grisTexto;
        c.font="bold 17px Arial";
        c.fillText("No hay clientes configurados en ESTIBAS XCC.",tablaX+tablaW/2,y+36);
        y+=filaH;
    }else{
        datosXCC.forEach((f,i)=>{
            const dias=f.estibasDia>0?f.inventarioActual/f.estibasDia:0;
            const faltante=f.objetivo-f.inventarioActual;

            c.fillStyle=i%2===0?blanco:"#fafbfc";
            c.fillRect(tablaX,y,tablaW,filaH);

            c.strokeStyle=borde;
            c.lineWidth=1;
            c.strokeRect(tablaX,y,tablaW,filaH);

            for(let j=1;j<cols.length;j++){
                c.beginPath();
                c.moveTo(x[j],y);
                c.lineTo(x[j],y+filaH);
                c.stroke();
            }

            c.textAlign="center";
            c.font="bold 17px Arial";
            c.fillStyle=azulTexto;

            c.fillText(String(f.cliente||""),x[0]+(cols[0].w*escala)/2,y+36);
            c.fillText(formatear(f.estibasDia),x[1]+(cols[1].w*escala)/2,y+36);
            c.fillText(formatear(f.inventarioActual),x[2]+(cols[2].w*escala)/2,y+36);
            c.fillText(dias.toFixed(1),x[3]+(cols[3].w*escala)/2,y+36);
            c.fillText(formatear(f.objetivo),x[4]+(cols[4].w*escala)/2,y+36);

            c.fillStyle=azulTexto;
            c.fillText(formatear(faltante),x[5]+(cols[5].w*escala)/2,y+36);

            y+=filaH;
        });
    }

    // =================================================
    // PIE — MISMO DISEÑO DEL INVENTARIO DIARIO
    // =================================================

    const footerY=y+espacioAntesFooter;
    const f1=tablaX;
    const f2=tablaX+tablaW/3;
    const f3=tablaX+(tablaW/3)*2;

    c.fillStyle=blanco;
    c.fillRect(f1,footerY,tablaW,footerH);

    c.strokeStyle=borde;
    c.lineWidth=1;
    c.strokeRect(f1,footerY,tablaW,footerH);

    c.beginPath();
    c.moveTo(f2,footerY);
    c.lineTo(f2,footerY+footerH);
    c.moveTo(f3,footerY);
    c.lineTo(f3,footerY+footerH);
    c.stroke();

    // RELOJ
    c.strokeStyle="#738292";
    c.lineWidth=3;
    c.beginPath();
    c.arc(f1+40,footerY+44,18,0,Math.PI*2);
    c.stroke();
    c.beginPath();
    c.moveTo(f1+40,footerY+44);
    c.lineTo(f1+40,footerY+31);
    c.moveTo(f1+40,footerY+44);
    c.lineTo(f1+49,footerY+49);
    c.stroke();

    c.fillStyle=grisTexto;
    c.font="15px Arial";
    c.textAlign="left";
    c.fillText("Generado el:",f1+73,footerY+32);
    c.fillStyle=azulTexto;
    c.font="bold 18px Arial";
    c.fillText(fechaReporte+" "+horaReporte,f1+73,footerY+62);

    // PERSONA
    const personaX=f2+42;
    c.strokeStyle="#738292";
    c.lineWidth=3;
    c.beginPath();
    c.arc(personaX,footerY+34,8,0,Math.PI*2);
    c.stroke();
    c.beginPath();
    c.arc(personaX,footerY+68,17,Math.PI,0);
    c.stroke();

    c.fillStyle=grisTexto;
    c.font="15px Arial";
    c.fillText("Elaborado por:",f2+73,footerY+32);
    c.fillStyle=azulTexto;
    c.font="bold 18px Arial";
    c.fillText("Duvan C",f2+73,footerY+62);

    // DOCUMENTO
    const docX=f3+40;
    c.strokeStyle="#738292";
    c.lineWidth=3;
    c.strokeRect(docX-13,footerY+24,25,34);
    c.beginPath();
    c.moveTo(docX-6,footerY+34);
    c.lineTo(docX+6,footerY+34);
    c.moveTo(docX-6,footerY+41);
    c.lineTo(docX+6,footerY+41);
    c.moveTo(docX-6,footerY+48);
    c.lineTo(docX+6,footerY+48);
    c.stroke();

    c.fillStyle=grisTexto;
    c.font="15px Arial";
    c.fillText("Inventario de estibas XCC",f3+73,footerY+32);
    c.fillStyle=azulTexto;
    c.font="bold 18px Arial";
    c.fillText("Página 1 de 1",f3+73,footerY+62);

    reporteXCCData=canvas.toDataURL("image/png");
    const img=document.getElementById("imagenReporteXCC");
    if(img)img.src=reporteXCCData;
    document.getElementById("modalReporteXCC")?.classList.add("visible");
}
function descargarReporteXCC(){if(!reporteXCCData)return;const a=document.createElement("a");a.href=reporteXCCData;a.download="Inventario_XCC_"+fechaActualXCC().replace(/\//g,"-")+".png";a.click();}
prepararEventosXCC();
iniciarAplicacion();

