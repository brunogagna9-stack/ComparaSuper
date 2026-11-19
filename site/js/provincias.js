/* SuperBarato — las provincias (código, nombre, foto y lema) y sus nombres para mostrar. Se baja al entrar porque
   toda la web la usa; la pantalla para elegir provincia (mapa.js) se baja solo cuando hace falta. */
(function () {
  const PROVS = [
    ["AR-C", "Ciudad de Buenos Aires", "caba", "el Obelisco"], ["AR-B", "Buenos Aires", "bsas", "la llanura pampeana"],
    ["AR-K", "Catamarca", "catamarca", "el Campo de Piedra Pómez"], ["AR-H", "Chaco", "chaco", "el algodón"],
    ["AR-U", "Chubut", "chubut", "la ballena franca"], ["AR-X", "Córdoba", "cordoba", "las sierras"],
    ["AR-W", "Corrientes", "corrientes", "los Esteros del Iberá"], ["AR-E", "Entre Ríos", "entrerios", "los ríos y puentes"],
    ["AR-P", "Formosa", "formosa", "el pomelo"], ["AR-Y", "Jujuy", "jujuy", "los cerros de colores"],
    ["AR-L", "La Pampa", "lapampa", "el trigo"], ["AR-F", "La Rioja", "larioja", "Talampaya"],
    ["AR-M", "Mendoza", "mendoza", "los viñedos"], ["AR-N", "Misiones", "misiones", "las Cataratas"],
    ["AR-Q", "Neuquén", "neuquen", "los lagos"], ["AR-R", "Río Negro", "rionegro", "Bariloche"],
    ["AR-A", "Salta", "salta", "los cardones"], ["AR-J", "San Juan", "sanjuan", "los valles"],
    ["AR-D", "San Luis", "sanluis", "las sierras"], ["AR-Z", "Santa Cruz", "santacruz", "el glaciar Perito Moreno"],
    ["AR-S", "Santa Fe", "santafe", "el río Paraná"], ["AR-G", "Santiago del Estero", "sde", "el monte"],
    ["AR-V", "Tierra del Fuego", "tdf", "el faro del fin del mundo"], ["AR-T", "Tucumán", "tucuman", "los cerros verdes"],
  ];
  const POR_COD = Object.fromEntries(PROVS.map(p => [p[0], p]));
  window.PROVINCIAS = PROVS.map(([c, n]) => ({ code: c, name: n }));
  window.provNombre = c => (POR_COD[c] || [, ""])[1];
  window.provCorto = c => (c === "AR-C" ? "CABA" : window.provNombre(c));
  window.PROVS_DATOS = PROVS;
})();
