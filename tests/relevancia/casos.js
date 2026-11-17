// Casos de aceptación del buscador. "debe": cada uno de los primeros resultados tiene que cumplirlo.
// "nunca": ninguno de los primeros 20 (o de todos, con "todos") puede ser de eso sin cumplir también "debe". "vacio": no debe encontrar nada (y no inventar).
module.exports = [
  { q: "mani", debe: /\bman[ií]\b/, nunca: /toall|femenin|mini\b|manicur|manzan/, todos: true },
  { q: "maní", debe: /\bman[ií]\b/, nunca: /toall|femenin|mini\b/, todos: true },
  { q: "MANI", debe: /\bman[ií]\b/, nunca: /toall|femenin|mini\b/, todos: true },
  { q: "mani tostado", debe: /\bman[ií]\b.*\btost|\btost.*\bman[ií]\b/ },
  { q: "mani salado", debe: /\bman[ií]\b.*\bsal|\bsal.*\bman[ií]\b/ },
  { q: "mani 500g", debe: /\bman[ií]\b/, tam: 0.5 },
  { q: "aceite de mani", debe: /aceite.*\bman[ií]\b/ },   // hoy no hay en el catálogo: debe quedar vacío, no mostrar otra cosa
  { q: "toallitas femeninas", debe: /toall.*femen/ },
  { q: "toallitas", debe: /toall/ },
  { q: "arroz", debe: /\barroz/ },
  { q: "leche", debe: /\bleche/, nunca: /lechuga/ },
  { q: "yerba 1kg", debe: /\byerba/, tam: 1 },
  { q: "yerva", debe: /\byerba/ },
  { q: "aseite", debe: /\baceite/ },
  { q: "galletitas", debe: /gallet/ },
  { q: "fideos", debe: /\bfideo/ },
  { q: "mini", debe: /\bmini\b/, nunca: /\bman[ií]\b/ },
  { q: "mano", debe: /\bmano/, nunca: /\bman[ií]\b/ },
  { q: "pan", debe: /\bpan(es)?\b/, nunca: /pantal|panal|panceta/ },
  { q: "sal", debe: /\bsal\b/, nunca: /^(salsa|salchi|salad)/ },
  { q: "te", debe: /\bt[eé]\b/ },
  { q: "papa", debe: /\bpapa/ },
  { q: "birra", debe: /cerveza/ },
  { q: "xqzwk producto inexistente", vacio: true },
  { q: "zzzzz", vacio: true },
];
